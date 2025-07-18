/**
 * @file Security helpers module.
 * Provides functions for permission checks and masking sensitive information.
 */

import * as core from '@actions/core';

import type { Octokit } from 'octokit';

import type { ActionConfig } from '../config/config.js';
import { toErrorMessage } from '../utils/error.js';

/**
 * Check if the user has appropriate permissions to run the action.
 * @param config - Action configuration object containing GitHub context.
 * @returns True if the user has permission; false otherwise.
 */

/**
 *
 * @param config
 */

/**
 *
 * @param config
 */

/**
 *
 * @param config
 */

/**
 *
 * @param config
 */

/**
 *
 * @param config
 */

/**
 *
 * @param config
 */

/**
 *
 * @param config
 */

/**
 *
 * @param config
 */

/**
 *
 * @param config
 */

/**
 *
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
 * @param repo.owner
 * @param username - GitHub username to check permissions for.
 * @param repo.repo
 * @returns True if the user has write or admin permissions; false otherwise.
 */

/**
 *
 * @param octokit
 * @param repo
 * @param repo.owner
 * @param repo.repo
 * @param username
 */

/**
 *
 * @param octokit
 * @param repo
 * @param repo.owner
 * @param repo.repo
 * @param username
 */

/**
 *
 * @param octokit
 * @param repo
 * @param repo.owner
 * @param repo.repo
 * @param username
 */

/**
 *
 * @param octokit
 * @param repo
 * @param repo.owner
 * @param repo.repo
 * @param username
 */

/**
 *
 * @param octokit
 * @param repo
 * @param repo.owner
 * @param repo.repo
 * @param username
 */

/**
 *
 * @param octokit
 * @param repo
 * @param repo.owner
 * @param repo.repo
 * @param username
 */

/**
 *
 * @param octokit
 * @param repo
 * @param repo.owner
 * @param repo.repo
 * @param username
 */

/**
 *
 * @param octokit
 * @param repo
 * @param repo.owner
 * @param repo.repo
 * @param username
 */

/**
 *
 * @param octokit
 * @param repo
 * @param repo.owner
 * @param repo.repo
 * @param username
 */

async function checkUserPermissionGithub(
  octokit: Octokit,
  repo: { owner: string; repo: string },
  username: string,
): Promise<boolean> {
  try {
    // Check user's permissions as a repository collaborator
    const { data: collaboratorPermission } =
      await octokit.rest.repos.getCollaboratorPermissionLevel({
        ...repo,
        username,
      });

    const permission = collaboratorPermission.permission;
    core.info(`User Permission level: ${permission}`);

    // Determine based on permission level
    // Permission levels include `admin, write, read, none`
    return ['admin', 'write'].includes(permission);
  } catch (error) {
    core.warning(`Error checking user permission: ${toErrorMessage(error)}`);
    return false;
  }
}

/**
 * Mask sensitive information (GitHub token and OpenAI API key) within a string.
 * @param text - Input text that may contain sensitive data.
 * @param config - Action configuration containing sensitive keys.
 * @returns The text with sensitive information replaced by '***'.
 */

/**
 *
 * @param text
 * @param config
 */

/**
 *
 * @param text
 * @param config
 */

/**
 *
 * @param text
 * @param config
 */

/**
 *
 * @param text
 * @param config
 */

/**
 *
 * @param text
 * @param config
 */

/**
 *
 * @param text
 * @param config
 */

/**
 *
 * @param text
 * @param config
 */

/**
 *
 * @param text
 * @param config
 */

/**
 *
 * @param text
 * @param config
 */

/**
 *
 */
export function maskSensitiveInfo(text: string, config: ActionConfig): string {
  let maskedText = text;

  if (config.githubToken) {
    maskedText = maskedText.replaceAll(config.githubToken, '***');
  }

  if (config.openaiApiKey) {
    maskedText = maskedText.replaceAll(config.openaiApiKey, '***');
  }
  if (config.openaiBaseUrl) {
    maskedText = maskedText.replaceAll(config.openaiBaseUrl, '***');
  }

  return maskedText;
}
