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
   * Model name or deployment identifier for the LLM provider.
   */
  model: string;
  /**
   * OpenAI model identifier (used when provider is OpenAI).
   */
  openaiModel: string;
  /**
   * Azure OpenAI endpoint (optional).
   */
  azureOpenAIEndpoint: string;
  /**
   * Azure OpenAI deployment name (required if using Azure provider).
   */
  azureOpenAIDeploymentName: string;
  /**
   * Azure OpenAI API version (required if using Azure provider).
   */
  azureOpenAIApiVersion: string;
  /**
   * Azure OpenAI API key (required if using Azure provider).
   */
  azureOpenAIApiKey: string;
  /**
   * LLM provider to use: 'openai' or 'azure'.
   */
  provider: 'openai' | 'azure';
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
  // Model selection
  const openaiModelInput = core.getInput('openai-model') || '';
  const openaiModel = openaiModelInput || defaultModel;
  // Azure OpenAI settings (optional)
  const azureOpenAIEndpoint = core.getInput('azure-openai-endpoint') || '';
  const azureOpenAIDeploymentName = core.getInput('azure-openai-deployment-name') || '';
  const azureOpenAIApiVersion = core.getInput('azure-openai-api-version') || '';
  const azureOpenAIApiKey = core.getInput('azure-openai-api-key') || '';
  const directPrompt = core.getInput('direct-prompt') || '';
  const triggerPhrase = core.getInput('trigger-phrase') || '/codex';
  const assigneeTriggerInput = core.getInput('assignee-trigger') || '';
  const assigneeTrigger = assigneeTriggerInput
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s);

  // Validate API keys and provider settings
  let provider: 'openai' | 'azure' = 'openai';
  let model = openaiModel;
  if (azureOpenAIEndpoint) {
    // Azure requires endpoint, deployment, API version, and key
    if (!azureOpenAIDeploymentName || !azureOpenAIApiVersion || !azureOpenAIApiKey) {
      throw new Error(
        'Azure OpenAI requires azure-openai-endpoint, azure-openai-deployment-name, azure-openai-api-version, and azure-openai-api-key to be set',
      );
    }
    provider = 'azure';
    model = azureOpenAIDeploymentName;
  }
  if (provider === 'openai' && !openaiApiKey) {
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
    azureOpenAIEndpoint,
    azureOpenAIDeploymentName,
    azureOpenAIApiVersion,
    azureOpenAIApiKey,
    provider,
    model,
    directPrompt,
    triggerPhrase,
    assigneeTrigger,
  };
}
