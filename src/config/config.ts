/**
 * @file Configuration module for the GitHub Action.
 *
 * Parses action inputs and environment variables, providing a validated
 * ActionConfig object for use throughout the action.
 */

import * as core from '@actions/core';
import * as github from '@actions/github';
import { Octokit } from 'octokit';

import { defaultModel } from '../api/openai';
import {
  DEFAULT_TRIGGER_PHRASE,
  DEFAULT_TIMEOUT_SECONDS,
  DEFAULT_WORKSPACE_PATH,
} from '../constants';

import { ConfigError } from '../utils/errors';
import { z } from 'zod';

/**
 * Defines configuration inputs for the GitHub Action.
 *
 * Includes GitHub authentication, workspace settings, and Codex/OpenAI parameters.
 */

export interface ActionConfig {
  githubToken: string;
  eventPath: string;
  /**
   * GitHub workspace path.
   * @default DEFAULT_WORKSPACE_PATH
   */
  workspace: string;
  /**
   * Timeout in seconds for GitHub Action operations.
   * @default DEFAULT_TIMEOUT_SECONDS
   */
  timeoutSeconds: number;
  octokit: Octokit;
  context: typeof github.context;
  repo: { owner: string; repo: string };

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
   * Custom trigger phrase to invoke Codez.
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

  /**
   * Optional list of local image file paths to include in the Codex CLI invocation.
   */

  images: string[];

  /**
   * Whether to fetch known URLs referenced in the prompt and include their contents.
   */

  fetch: boolean;
}

// Zod schema for validating action configuration
const actionConfigSchema = z.object({
  githubToken: z.string().min(1, 'GitHub token is required'),
  eventPath: z.string().min(1, 'GitHub event path is required'),
  workspace: z.string().min(1, 'Workspace path is required'),
  timeoutSeconds: z
    .number()
    .int()
    .positive('Timeout must be a positive integer'),
  octokit: z.any(),
  context: z.any(),
  repo: z.object({
    owner: z.string().min(1, 'Repository owner is required'),
    repo: z.string().min(1, 'Repository name is required'),
  }),
  openaiApiKey: z.string().min(1, 'OpenAI API key is required'),
  openaiBaseUrl: z.union([
    z.string().url({ message: 'Invalid URL for openai-base-url' }),
    z.literal(''),
  ]),
  openaiModel: z.string().min(1, 'OpenAI model is required'),
  directPrompt: z.string(),
  triggerPhrase: z.string().min(1, 'Trigger phrase is required'),
  assigneeTrigger: z.array(z.string()),
  codexEnv: z.record(z.string(), z.string()),
  images: z.array(z.string()),
  fetch: z.boolean(),
});

/**
 * Parse custom environment variables input from YAML mapping or comma-separated key=value pairs.
 * @param input - Raw input string (multiline YAML or comma-separated key=value pairs).
 * @returns A map of environment variable names to values.
 */

export function parseKeyValueMap(input: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!input) return result;
  // Split input into items based on newlines or commas
  const items = parseStringList(input);
  for (const item of items) {
    // YAML-style mapping: key: value
    const colonIdx = item.indexOf(':');
    if (colonIdx > 0) {
      const key = item.slice(0, colonIdx).trim();
      let val = item.slice(colonIdx + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (key) {
        result[key] = val;
      }
      continue;
    }
    // CSV-style mapping: key=value
    const eqIdx = item.indexOf('=');
    if (eqIdx > 0) {
      const key = item.slice(0, eqIdx).trim();
      const val = item.slice(eqIdx + 1).trim();
      if (key) {
        result[key] = val;
      }
    }
  }
  return result;
}

/**
 * Parse list input into an array of trimmed, non-empty strings.
 * @param input - String containing list items.
 * @returns Array of trimmed non-empty strings.
 */

export function parseStringList(input: string): string[] {
  if (!input) {
    return [];
  }
  let items: string[] = [];
  if (input.includes('\n')) {
    items = input.split(/\r?\n/);
  } else if (input.includes(',')) {
    items = input.split(',');
  } else {
    items = [input];
  }
  return items.map((s) => s.trim()).filter((s) => s.length > 0);
}

/**
 * Gets and validates the inputs for the GitHub Action.
 * @returns ActionConfig object
 * @throws Error if required inputs are missing
 */

export function getConfig(): ActionConfig {
  const githubToken = core.getInput('github-token', { required: true });
  const eventPath = core.getInput('event-path');
  const workspace = DEFAULT_WORKSPACE_PATH;
  const timeoutInput = core.getInput('timeout');
  let timeoutSeconds: number;
  if (timeoutInput) {
    timeoutSeconds = parseInt(timeoutInput, 10);
    if (isNaN(timeoutSeconds) || timeoutSeconds <= 0) {
      throw new ConfigError(
        `Invalid timeout value: ${timeoutInput}. Timeout must be a positive integer.`,
      );
    }
  } else {
    timeoutSeconds = DEFAULT_TIMEOUT_SECONDS;
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
  const triggerPhrase =
    core.getInput('trigger-phrase') || DEFAULT_TRIGGER_PHRASE;
  const assigneeTriggerInput = core.getInput('assignee-trigger') || '';
  // Parse comma- or newline-separated GitHub usernames
  const assigneeTrigger = parseStringList(assigneeTriggerInput);
  const codexEnvInput = core.getInput('codex-env') || '';
  const codexEnv = parseKeyValueMap(codexEnvInput);
  const imagesInput = core.getInput('images') || '';
  const images = parseStringList(imagesInput);
  const fetch = core.getBooleanInput('fetch');

  if (!openaiApiKey) {
    throw new ConfigError('OpenAI API key is required.');
  }
  if (!githubToken) {
    throw new ConfigError('GitHub Token is required.');
  }
  if (!eventPath) {
    throw new ConfigError('GitHub event path is missing.');
  }
  if (!workspace) {
    throw new ConfigError('GitHub workspace path is missing.');
  }

  const rawConfig = {
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
    images,
    fetch,
  } as const;

  const parsed = actionConfigSchema.safeParse(rawConfig);
  if (!parsed.success) {
    const issues = parsed.error.errors
      .map((e) => `${e.path.join('.')}: ${e.message}`)
      .join('; ');
    throw new ConfigError(`Invalid configuration: ${issues}`);
  }

  return parsed.data;
}
