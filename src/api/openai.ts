/**
 * @fileoverview OpenAI API wrapper for generating commit messages.
 * Provides functionality to interface with the OpenAI API and generate
 * Conventional Commits formatted messages based on user input and changed files.
 */
import * as core from '@actions/core';
import OpenAI from 'openai';
import type { ClientOptions } from 'openai';
import type { ActionConfig } from '../config/config.js';
import { conventionalCommitsSystemPrompt } from '../config/prompts.js';
import { ParseError } from '../utils/errors.js';

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
 * Generate a Git commit message using the OpenAI API.
 *
 * The generated commit message follows the Conventional Commits specification.
 *
 * @param changedFiles - List of modified file paths.
 * @param userPrompt - The original user request or description.
 * @param context - Pull request or issue context.
 * @param config - Action configuration settings for API client.
 * @returns A promise that resolves to the generated commit message.
 *
 * @example
 * const message = await generateCommitMessage(
 *   ['src/index.ts'],
 *   'Refactor index module',
 *   { prNumber: 42 },
 *   config
 * );
 */
export async function generateCommitMessage(
  changedFiles: string[],
  userPrompt: string,
  context: { prNumber?: number; issueNumber?: number },
  config: ActionConfig,
): Promise<string> {
  try {
    // Create prompt - System prompt + User prompt structure
    const systemPrompt = conventionalCommitsSystemPrompt;

    let userContent = `User Request:
${userPrompt}

files changed:
\`\`\`
${changedFiles.join('\n')}
\`\`\``;

    // Add context information if available
    if (context.prNumber) {
      userContent += `\n\nThis change is related to PR #${context.prNumber}.`;
    }
    if (context.issueNumber) {
      userContent += `\n\nThis change is related to Issue #${context.issueNumber}.`;
    }

    const openai = getOpenAIClient(config);

    const response = await openai.chat.completions.create({
      model: config.openaiModel,
      max_completion_tokens: 1024,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
    });

    // Extract commit message from response
    let commitMessage = response.choices[0]?.message?.content?.trim() ?? '';
    commitMessage = commitMessage.split('\n')[0]; // Take the first line

    // Fallback if the message is empty or too long (adjust length check if needed)
    if (!commitMessage || commitMessage.length > 100) {
      // Keep 100 char limit for safety
      core.warning(
        `Generated commit message was empty or too long: "${commitMessage}". Falling back.`,
      );
      throw new ParseError('Generated commit message invalid.'); // Trigger fallback
    }

    core.info(`Generated commit message: ${commitMessage}`);
    return commitMessage;
  } catch (error) {
    core.warning(
      `Error generating commit message with OpenAI: ${
        error instanceof Error ? error.message : String(error)
      }. Using fallback.`,
    );
    if (context.prNumber) {
      return `chore: apply changes for PR #${context.prNumber}`;
    } else if (context.issueNumber) {
      return `chore: apply changes for Issue #${context.issueNumber}`;
    } else {
      const fileCount = changedFiles.length;
      return `chore: apply changes to ${fileCount} file${
        fileCount !== 1 ? 's' : ''
      }`;
    }
  }
}
