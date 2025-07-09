/**
 * @fileoverview Configuration module for the GitHub Action.
 *
 * Parses action inputs and environment variables, providing a validated
 * ActionConfig object for use throughout the action.
 */
import * as core from '@actions/core';
import * as github from '@actions/github';
import { Octokit } from 'octokit';
import { defaultModel } from '../api/openai.js';
import { ConfigError } from '../utils/errors.js';

/**
 * Defines configuration inputs for the GitHub Action.
 *
 * Includes GitHub authentication, workspace settings, and Codex/OpenAI parameters.
 */
export interface ActionConfig {
  githubToken: string;
  eventPath: string;
  workspace: string;
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
  /**
   * Optional list of local image file paths to include in the Codex CLI invocation.
   */
  images: string[];
  /**
   * Whether to fetch known URLs referenced in the prompt and include their contents.
   */
  fetch: boolean;
}

/**
 * Parse custom environment variables input from YAML mapping or comma-separated key=value pairs.
 *
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
 *
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
 *
 * @returns {ActionConfig} Validated configuration inputs for the GitHub Action.
 * @throws {ConfigError} If required inputs are missing or invalid.
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
      throw new ConfigError(
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
    images,
    fetch,
  };
}
