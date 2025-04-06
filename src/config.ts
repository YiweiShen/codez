import * as core from '@actions/core';
import * as github from '@actions/github';

export interface ActionConfig {
  githubToken: string;
  anthropicApiKey: string;
  eventPath: string;
  workspace: string;
  timeoutSeconds: number;
  octokit: ReturnType<typeof github.getOctokit>;
  context: typeof github.context;
  repo: { owner: string; repo: string };
}

/**
 * Gets and validates the inputs for the GitHub Action.
 * @returns ActionConfig object
 * @throws Error if required inputs are missing
 */
export function getConfig(): ActionConfig {
  const githubToken = core.getInput('github-token', { required: true });
  const anthropicApiKey = core.getInput('anthropic-api-key', { required: true });
  const eventPath = process.env.GITHUB_EVENT_PATH || core.getInput('event-path');
  const workspace = process.env.GITHUB_WORKSPACE || '/workspace/app';
  const timeoutSeconds = core.getInput('timeout') ? parseInt(core.getInput('timeout'), 10) : 300;

  if (!anthropicApiKey) {
    throw new Error('Anthropic API Key is required.');
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

  const octokit = github.getOctokit(githubToken);
  const context = github.context;
  const repo = context.repo;

  return {
    githubToken,
    anthropicApiKey,
    eventPath,
    workspace,
    timeoutSeconds,
    octokit,
    context,
    repo,
  };
}
