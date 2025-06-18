import * as core from '@actions/core';
import * as github from '@actions/github';
import { Octokit } from 'octokit';
import { defaultModel } from '../api/openai.js';

export interface ActionConfig {
  // Common settings
  githubToken: string;
  eventPath: string;
  workspace: string;
  timeoutSeconds: number;
  octokit: Octokit;
  context: typeof github.context;
  repo: { owner: string; repo: string };

  // Codex / OpenAI settings
  openaiApiKey: string;
  openaiBaseUrl: string;
  /**
   * OpenAI model identifier.
   */
  openaiModel: string;
  /**
   * One-shot direct prompt for automated workflows.
   * If provided, Codez will bypass GitHub comment triggers and run this prompt directly.
   */
  directPrompt: string;
  /**
   * Custom trigger phrase to invoke Codez (e.g. '/codex').
   */
  triggerPhrase: string;
  /**
   * List of GitHub usernames that trigger Codez when an issue is assigned to them.
   */
  assigneeTrigger: string[];
  /**
   * Custom environment variables to inject into the Codex CLI process.
   */
  codexEnv: Record<string, string>;
}

/**
 * Parses custom environment variables input, either YAML mapping (multiline)
 * or comma-separated key=value pairs.
 */
export function parseEnvInput(input: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!input) return result;
  if (input.includes('\n')) {
    for (const line of input.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const idx = trimmed.indexOf(':');
      if (idx < 0) continue;
      const key = trimmed.slice(0, idx).trim();
      let val = trimmed.slice(idx + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (key) result[key] = val;
    }
  } else {
    for (const part of input.split(',')) {
      const [key, ...rest] = part.split('=');
      if (!key) continue;
      result[key.trim()] = rest.join('=').trim();
    }
  }
  return result;
}

/**
 * Gets and validates the inputs for the GitHub Action.
 * @returns ActionConfig object
 * @throws Error if required inputs are missing
 */
export function getConfig(): ActionConfig {
  const githubToken = core.getInput('github-token', { required: true });
  const eventPath = core.getInput('event-path');
  const workspace = '/workspace/app';
  const timeoutInput = core.getInput('timeout');
  let timeoutSeconds: number;
  if (timeoutInput) {
    timeoutSeconds = parseInt(timeoutInput, 10);
    if (isNaN(timeoutSeconds) || timeoutSeconds <= 0) {
      throw new Error(
        `Invalid timeout value: ${timeoutInput}. Timeout must be a positive integer.`,
      );
    }
  } else {
    timeoutSeconds = 600;
  }
  const octokit = new Octokit({ auth: githubToken });
  const context = github.context;
  const repo = context.repo;

  // Codex / OpenAI settings
  const openaiApiKey = core.getInput('openai-api-key') || '';
  const openaiBaseUrl = core.getInput('openai-base-url') || '';
  const openaiModelInput = core.getInput('openai-model') || '';
  const openaiModel = openaiModelInput || defaultModel;
  const directPrompt = core.getInput('direct-prompt') || '';
  const triggerPhrase = core.getInput('trigger-phrase') || '/codex';
  const assigneeTriggerInput = core.getInput('assignee-trigger') || '';
  const assigneeTrigger = assigneeTriggerInput
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s);
  const codexEnvInput = core.getInput('codex-env') || '';
  const codexEnv = parseEnvInput(codexEnvInput);

  if (!openaiApiKey) {
    throw new Error('OpenAI API key is required.');
  }
  if (!githubToken) {
    throw new Error('GitHub Token is required.');
  }
  if (!eventPath) {
    throw new Error('GitHub event path is missing.');
  }
  if (!workspace) {
    throw new Error('GitHub workspace path is missing.');
  }

  return {
    githubToken,
    eventPath,
    workspace,
    timeoutSeconds,
    octokit,
    context,
    repo,

    openaiApiKey,
    openaiBaseUrl,
    openaiModel,
    directPrompt,
    triggerPhrase,
    assigneeTrigger,
    codexEnv,
  };
}
