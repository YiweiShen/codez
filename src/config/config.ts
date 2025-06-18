import * as core from '@actions/core';
import * as github from '@actions/github';
import { Octokit } from 'octokit';

export interface ActionConfig {
  // Common settings
  githubToken: string;
  eventPath: string;
  workspace: string;
  timeoutSeconds: number;
  octokit: Octokit;
  context: typeof github.context;
  repo: { owner: string; repo: string };

  // Codex
  openaiApiKey: string;
  openaiBaseUrl: string;
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
   * Comma-separated list of allowed Codex CLI tools. If specified, only these tools will be enabled.
   */
  allowedTools: string[];
  /**
   * Comma-separated list of disallowed Codex CLI tools. These tools will be disabled during execution.
   */
  disallowedTools: string[];
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

  // Codex / OpenAI
  const openaiApiKey = core.getInput('openai-api-key') || '';
  const openaiBaseUrl = core.getInput('openai-base-url') || '';
  const directPrompt = core.getInput('direct-prompt') || '';
  const triggerPhrase = core.getInput('trigger-phrase') || '/codex';
  const assigneeTriggerInput = core.getInput('assignee-trigger') || '';
  const assigneeTrigger = assigneeTriggerInput
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s);

  const allowedToolsInput = core.getInput('allowed-tools') || '';
  const allowedTools = allowedToolsInput
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s);
  const disallowedToolsInput = core.getInput('disallowed-tools') || '';
  const disallowedTools = disallowedToolsInput
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s);

  if (allowedTools.length > 0 && disallowedTools.length > 0) {
    throw new Error('Cannot specify both allowed-tools and disallowed-tools');
  }

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
    directPrompt,
    triggerPhrase,
    assigneeTrigger,
    allowedTools,
    disallowedTools,
  };
}
