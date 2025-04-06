import * as core from '@actions/core';
import * as github from '@actions/github';
import { ActionConfig } from './config.js';

/**
 * Checks if the user has appropriate permissions.
 * @param config Action configuration
 * @returns true if the user has permission, false otherwise
 */
export async function checkPermission(config: ActionConfig): Promise<boolean> {
  const { context, octokit, repo } = config;
  const actor = context.actor;

  if (!actor) {
    core.warning('Actor not found. Permission check failed.');
    return false;
  }

  core.info(`Checking permissions for actor ${actor}`);

  try {
    core.info(`Checking permissions for user ${actor} on repository ${repo.owner}/${repo.repo}`);
    return await checkUserPermissionGithub(octokit, repo, actor);
  } catch (error) {
    core.warning(`Exception occurred during permission check: ${error}`);
    return false;
  }
}

/**
 * Asynchronously checks if a user has appropriate permissions for a repository.
 * This function is used internally and primarily for logging permission information.
 * @param octokit GitHub API client
 * @param repo Repository information
 * @param username Username to check
 * @returns true if the user has permissions, false otherwise
 */
async function checkUserPermissionGithub(
  octokit: ReturnType<typeof github.getOctokit>,
  repo: { owner: string; repo: string },
  username: string
): Promise<boolean> {
  try {
    // Check user's permissions as a repository collaborator
    const { data: collaboratorPermission } = await octokit.rest.repos.getCollaboratorPermissionLevel({
      ...repo,
      username,
    });

    const permission = collaboratorPermission.permission;
    core.info(`User ${username} permission level: ${permission}`);

    // Determine based on permission level
    // Permission levels include `admin, write, read, none`
    return ['admin', 'write'].includes(permission);
  } catch (error) {
    // The API may return an error if the user is not a collaborator
    core.warning(`Error checking user permissions: ${error}`);
    
    try {
      // Alternative method: check repository membership
      // This works for organization repositories
      const { data: membership } = await octokit.rest.orgs.getMembershipForUser({
        org: repo.owner,
        username,
      });
      
      core.info(`User ${username} membership status in organization ${repo.owner}: ${membership.state}`);
      
      // Only allow users with active membership
      return membership.state === 'active';
    } catch (membershipError) {
      // User is not a member of the organization, or the repository is personal
      core.warning(`Error checking organization membership: ${membershipError}`);
      return false;
    }
  }
}
