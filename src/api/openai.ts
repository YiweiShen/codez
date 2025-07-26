/**
 * @file OpenAI API wrapper for generating commit messages.
 * Provides functionality to interface with the OpenAI API and generate
 * Conventional Commits formatted messages based on user input and changed files.
 */

import * as core from '@actions/core';
import OpenAI, { type ClientOptions } from 'openai';

import type { ActionConfig } from '../config/config';
import { conventionalCommitsSystemPrompt } from '../config/prompts';
import { ParseError } from '../utils/errors';

/**
 * Default model identifier for OpenAI provider.
 */

export const defaultModel = 'o4-mini';

/**
 * Create and configure an OpenAI API client instance.
 * @param config - ActionConfig containing OpenAI API key and optional base URL.
 * @returns A configured OpenAI client for making API calls.
 */

export function getOpenAIClient(config: ActionConfig): OpenAI {
  const openaiOptions: ClientOptions = { apiKey: config.openaiApiKey };
  if (config.openaiBaseUrl) {
    openaiOptions.baseURL = config.openaiBaseUrl;
  }
  return new OpenAI(openaiOptions);
}

/**
 * Context information for determining fallback commit messages.
 */
export interface CommitContext {
  prNumber?: number;
  issueNumber?: number;
}

const MAX_COMPLETION_TOKENS = 1024;
const MAX_SUBJECT_LENGTH = 100;

/**
 * Generate a Git commit message using the OpenAI API, following Conventional Commits.
 * Falls back to a generic chore message on errors or invalid output.
 */
export async function generateCommitMessage(
  changedFiles: string[],
  userPrompt: string,
  context: CommitContext,
  config: ActionConfig,
): Promise<string> {
  const systemPrompt = conventionalCommitsSystemPrompt;
  const userMessage = buildUserMessage(changedFiles, userPrompt, context);

  const openai = getOpenAIClient(config);
  try {
    const response = await openai.chat.completions.create({
      model: config.openaiModel,
      max_completion_tokens: MAX_COMPLETION_TOKENS,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    });

    const content = response.choices?.[0]?.message?.content?.trim() ?? '';
    const subject = content.split(/\r?\n/)[0] || '';
    if (!subject || subject.length > MAX_SUBJECT_LENGTH) {
      throw new ParseError(`Invalid commit message: "${subject}"`);
    }

    core.info(`Generated commit message: ${subject}`);
    return subject;
  } catch (error) {
    core.warning(
      `Error generating commit message with OpenAI: ${
        error instanceof Error ? error.message : String(error)
      }. Using fallback.`,
    );
    return getFallbackMessage(changedFiles, context);
  }
}

/** Assemble the user prompt for OpenAI including file changes and context. */
function buildUserMessage(
  changedFiles: string[],
  userPrompt: string,
  context: CommitContext,
): string {
  const lines: string[] = [
    'User Request:',
    userPrompt,
    '',
    'Files changed:',
    '```',
    ...changedFiles,
    '```',
  ];
  if (context.prNumber) {
    lines.push(``, `This change is related to PR #${context.prNumber}.`);
  }
  if (context.issueNumber) {
    lines.push(``, `This change is related to Issue #${context.issueNumber}.`);
  }
  return lines.join('\n');
}

/** Generate a fallback commit message when AI generation fails. */
function getFallbackMessage(
  changedFiles: string[],
  context: CommitContext,
): string {
  if (context.prNumber) {
    return `chore: apply changes for PR #${context.prNumber}`;
  }
  if (context.issueNumber) {
    return `chore: apply changes for Issue #${context.issueNumber}`;
  }
  const fileCount = changedFiles.length;
  return `chore: apply changes to ${fileCount} file${
    fileCount !== 1 ? 's' : ''
  }`;
}
