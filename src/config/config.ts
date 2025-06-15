import * as core from '@actions/core'
import * as github from '@actions/github'
import { Octokit } from 'octokit'

export interface ActionConfig {
  // Common settings
  githubToken: string
  eventPath: string
  workspace: string
  timeoutSeconds: number
  octokit: Octokit
  context: typeof github.context
  repo: { owner: string; repo: string }

  // Codex
  openaiApiKey: string
  openaiBaseUrl: string
}

/**
 * Gets and validates the inputs for the GitHub Action.
 * @returns ActionConfig object
 * @throws Error if required inputs are missing
 */
export function getConfig(): ActionConfig {
  const githubToken = core.getInput('github-token', { required: true })
  const eventPath = core.getInput('event-path')
  const workspace = '/workspace/app'
  const timeoutSeconds = core.getInput('timeout')
    ? parseInt(core.getInput('timeout'), 10)
    : 600
  const octokit = new Octokit({ auth: githubToken })
  const context = github.context
  const repo = context.repo

  // Codex / OpenAI
  const openaiApiKey = core.getInput('openai-api-key') || ''
  const openaiBaseUrl = core.getInput('openai-base-url') || ''

  if (!openaiApiKey) {
    throw new Error('API Key is required.')
  }
  if (!githubToken) {
    throw new Error('GitHub Token is required.')
  }
  if (!eventPath) {
    throw new Error('GitHub event path is missing.')
  }
  if (!workspace) {
    throw new Error('GitHub workspace path is missing.')
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
    openaiBaseUrl
  }
}
