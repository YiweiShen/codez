/**
 * @file Security helpers module.
 * Provides functions for permission checks and masking sensitive information.
 */

import * as core from '@actions/core';

import type { Octokit } from 'octokit';

import type { ActionConfig } from '../config/config';
import { toErrorMessage } from '../utils/error';

// Reuse repository info type from action configuration
type Repo = ActionConfig['repo'];

/**
 * Check if the user has appropriate permissions to run the action.
 * @param config - Action configuration object containing GitHub context.
 * @returns True if the user has permission; false otherwise.
 */

export async function checkPermission(config: ActionConfig): Promise<boolean> {
  const { context, octokit, repo } = config;
  const actor = context.actor;

  if (!actor) {
    core.warning('Actor not found. Permission check failed.');
    return false;
  }

  try {
    return await checkUserPermissionGithub(octokit, repo, actor);
  } catch (error) {
    core.warning(
      `Exception occurred during permission check: ${toErrorMessage(error)}`,
    );
    return false;
  }
}


/**
 * Check if a GitHub user has appropriate permissions for the repository.
 * @param octokit - GitHub API client instance.
 * @param repo - Repository information.
 * @param username - GitHub username to check permissions for.
 * @returns True if the user has write or admin permissions; false otherwise.
 */
async function checkUserPermissionGithub(
  octokit: Octokit,
  repo: Repo,
  username: string,
): Promise<boolean> {
  try {
    // Check user's permissions as a repository collaborator
    const {
      data: { permission },
    } = await octokit.rest.repos.getCollaboratorPermissionLevel({
      ...repo,
      username,
    });
    core.info(`User permission level: ${permission}`);

    const allowed = new Set(['admin', 'write']);
    return allowed.has(permission);
  } catch (error) {
    core.warning(`Error checking user permission: ${toErrorMessage(error)}`);
    return false;
  }
}

/**
 * Escape special regex characters in a string.
 * @param str - Input string to escape for RegExp usage.
 * @returns Escaped string safe for RegExp patterns.
 */

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Mask sensitive information (GitHub token and OpenAI API key) within a string.
 * @param text - Input text that may contain sensitive data.
 * @param config - Action configuration containing sensitive keys.
 * @returns The text with sensitive information replaced by '***'.
 */

export function maskSensitiveInfo(text: string, config: ActionConfig): string {
  const secrets = [
    config.githubToken,
    config.openaiApiKey,
    config.openaiBaseUrl,
  ]
    .filter((s): s is string => s.length > 0)
    .sort((a, b) => b.length - a.length);

  return secrets.reduce((result, secret) => {
    core.setSecret(secret);
    const pattern = new RegExp(escapeRegExp(secret), 'g');
    return result.replace(pattern, '***');
  }, text);
}
