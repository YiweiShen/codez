import * as core from '@actions/core';
import * as github from '@actions/github';
import { Octokit } from 'octokit';

export interface ActionConfig {
  githubToken: string;
  anthropicApiKey: string;
  anthropicBaseUrl: string;
  anthropicModel: string;
  anthropicSmallFastModel: string;
  claudeCodeUseBedrock: string;
  anthropicBedrockBaseUrl: string;
  awsAccessKeyId: string;
  awsSecretAccessKey: string;
  awsRegion: string;
  disablePromptCaching: string;
  eventPath: string;
  workspace: string;
  timeoutSeconds: number;
  octokit: Octokit;
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
  const eventPath = core.getInput('event-path');
  const workspace = '/workspace/app';
  const timeoutSeconds = core.getInput('timeout') ? parseInt(core.getInput('timeout'), 10) : 300;
  
  // Additional environment variables (all optional)
  const anthropicBaseUrl = core.getInput('anthropic-base-url') || '';
  const anthropicModel = core.getInput('anthropic-model') || '';
  const anthropicSmallFastModel = core.getInput('anthropic-small-fast-model') || '';
  const claudeCodeUseBedrock = core.getInput('claude-code-use-bedrock') || '';
  const anthropicBedrockBaseUrl = core.getInput('anthropic-bedrock-base-url') || '';
  const awsAccessKeyId = core.getInput('aws-access-key-id') || '';
  const awsSecretAccessKey = core.getInput('aws-secret-access-key') || '';
  const awsRegion = core.getInput('aws-region') || '';
  const disablePromptCaching = core.getInput('disable-prompt-caching') || '';

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

  const octokit = new Octokit({ auth: githubToken });
  const context = github.context;
  const repo = context.repo;

  return {
    githubToken,
    anthropicApiKey,
    anthropicBaseUrl,
    anthropicModel,
    anthropicSmallFastModel,
    claudeCodeUseBedrock,
    anthropicBedrockBaseUrl,
    awsAccessKeyId,
    awsSecretAccessKey,
    awsRegion,
    disablePromptCaching,
    eventPath,
    workspace,
    timeoutSeconds,
    octokit,
    context,
    repo,
  };
}
