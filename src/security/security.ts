/**
 * Security helpers module.
 *
 * Provides functions for permission checks and masking sensitive information.
 */
import * as core from '@actions/core';
import type { ActionConfig } from '../config/config.js';
import type { Octokit } from 'octokit';

/**
 * Check if the user has appropriate permissions to run the action.
 *
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
    core.warning(`Exception occurred during permission check: ${error}`);
    return false;
  }
}

/**
 * Check if a GitHub user has appropriate permissions for the repository.
 *
 * @param octokit - GitHub API client instance.
 * @param repo - Repository information.
 * @param username - GitHub username to check permissions for.
 * @returns True if the user has write or admin permissions; false otherwise.
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
    core.warning(`Error checking user permission: ${error}`);
    return false;
  }
}

/**
 * Mask sensitive information (GitHub token and OpenAI API key) within a string.
 *
 * @param text - Input text that may contain sensitive data.
 * @param config - Action configuration containing sensitive keys.
 * @returns The text with sensitive information replaced by '***'.
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
  // Mask any custom environment variable values (e.g., codexEnv) that may be sensitive
  if (config.codexEnv) {
    for (const val of Object.values(config.codexEnv)) {
      if (val) {
        maskedText = maskedText.replaceAll(val, '***');
      }
    }
  }

  return maskedText;
}
/**
 * Initialize log masking by patching core and console methods
 * to scrub sensitive information from all log messages.
 * @param config - Action configuration containing secrets to mask
 */
export function initLogMasking(config: ActionConfig): void {
  const coreMethods: Array<'info' | 'warning' | 'error' | 'debug'> = [
    'info',
    'warning',
    'error',
    'debug',
  ];
  for (const method of coreMethods) {
    // @ts-ignore override
    const original = (core as any)[method] as (msg: string, ...args: any[]) => void;
    // @ts-ignore
    (core as any)[method] = (message: string, ...args: any[]) => {
      const scrubbed =
        typeof message === 'string'
          ? maskSensitiveInfo(message, config)
          : message;
      return original(scrubbed, ...args);
    };
  }
  const consoleMethods: Array<'log' | 'warn' | 'error'> = [
    'log',
    'warn',
    'error',
  ];
  for (const method of consoleMethods) {
    const original = (console as any)[method] as (...args: any[]) => void;
    (console as any)[method] = (...args: any[]) => {
      const scrubbedArgs = args.map((arg) =>
        typeof arg === 'string' ? maskSensitiveInfo(arg, config) : arg,
      );
      return original(...scrubbedArgs);
    };
  }
}
