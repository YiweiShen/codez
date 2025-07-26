/**
 * Reaction utilities for adding or removing reactions on GitHub issues and comments.
 */
import * as core from '@actions/core';
import type { Octokit } from 'octokit';
import type { RepoContext, GitHubEvent } from './types';

/**
 * Get handlers for reactions based on the GitHub event.
 */
function getReactionHandlers(
  octokit: Octokit,
  repo: RepoContext,
  event: GitHubEvent,
) {
  if (
    (event.action === 'opened' || event.action === 'assigned') &&
    'issue' in event
  ) {
    const issueNumber = event.issue.number;
    const logTarget = `issue #${issueNumber}`;
    return {
      create: (content: string) =>
        octokit.rest.reactions.createForIssue({
          ...repo,
          issue_number: issueNumber,
          content,
        }),
      list: () =>
        octokit.rest.reactions.listForIssue({
          ...repo,
          issue_number: issueNumber,
        }),
      delete: (reaction_id: number) =>
        octokit.rest.reactions.deleteForIssue({
          ...repo,
          issue_number: issueNumber,
          reaction_id,
        }),
      logTarget,
    };
  }
  if (event.action === 'created' && 'comment' in event && 'issue' in event) {
    const issueNumber = event.issue.number;
    const commentId = event.comment.id;
    const logTarget = `comment on issue/PR #${issueNumber}`;
    return {
      create: (content: string) =>
        octokit.rest.reactions.createForIssueComment({
          ...repo,
          comment_id: commentId,
          content,
        }),
      list: () =>
        octokit.rest.reactions.listForIssueComment({
          ...repo,
          comment_id: commentId,
        }),
      delete: (reaction_id: number) =>
        octokit.rest.reactions.deleteForIssueComment({
          ...repo,
          comment_id: commentId,
          reaction_id,
        }),
      logTarget,
    };
  }
  if (
    event.action === 'created' &&
    'comment' in event &&
    'pull_request' in event
  ) {
    const prNumber = event.pull_request.number;
    const commentId = event.comment.id;
    const logTarget = `review comment on PR #${prNumber}`;
    return {
      create: (content: string) =>
        octokit.rest.reactions.createForPullRequestReviewComment({
          ...repo,
          comment_id: commentId,
          content,
        }),
      list: () =>
        octokit.rest.reactions.listForPullRequestReviewComment({
          ...repo,
          comment_id: commentId,
        }),
      delete: (reaction_id: number) => {
        if (
          typeof octokit.rest.reactions.deleteForPullRequestReviewComment ===
          'function'
        ) {
          return octokit.rest.reactions.deleteForPullRequestReviewComment({
            ...repo,
            comment_id: commentId,
            reaction_id,
          });
        }
        return octokit.request(
          'DELETE /repos/{owner}/{repo}/pulls/comments/{comment_id}/reactions/{reaction_id}',
          { ...repo, comment_id: commentId, reaction_id },
        );
      },
      logTarget,
    };
  }
  return null;
}

/**
 * Adds an 'eyes' reaction to the specified issue or comment event.
 * @param octokit - Authenticated Octokit client.
 * @param repo - Repository owner and name context.
 * @param event - GitHubEvent describing the issue or comment.
 * @returns Promise that resolves when the reaction is added.
 */
export async function addEyeReaction(
  octokit: Octokit,
  repo: RepoContext,
  event: GitHubEvent,
): Promise<void> {
  const handler = getReactionHandlers(octokit, repo, event);
  if (!handler) return;

  try {
    await handler.create('eyes');
    core.info(`Added eye reaction to ${handler.logTarget}`);
  } catch (error) {
    core.warning(
      `Failed to add reaction: ${
        error instanceof Error ? error.message : error
      }`,
    );
  }
}

/**
 * Removes the 'eyes' reaction added by the bot from the specified event.
 * @param octokit - Authenticated Octokit client.
 * @param repo - Repository owner and name context.
 * @param event - GitHubEvent describing the issue or comment.
 * @returns Promise that resolves when the reaction is removed.
 */
export async function removeEyeReaction(
  octokit: Octokit,
  repo: RepoContext,
  event: GitHubEvent,
): Promise<void> {
  const handler = getReactionHandlers(octokit, repo, event);
  if (!handler) return;

  try {
    const reactions = await handler.list();
    const reaction = reactions.data.find(
      (r) => r.content === 'eyes' && r.user?.login === 'github-actions[bot]',
    );

    if (reaction) {
      await handler.delete(reaction.id);
      core.info(`Removed eye reaction from ${handler.logTarget}`);
    }
  } catch (error) {
    core.warning(
      `Failed to remove eye reaction: ${
        error instanceof Error ? error.message : error
      }`,
    );
  }
}

/**
 * Adds a 'thumbs up' reaction to the specified issue or comment event.
 * @param octokit - Authenticated Octokit client.
 * @param repo - Repository owner and name context.
 * @param event - GitHubEvent describing the issue or comment.
 * @returns Promise that resolves when the reaction is added.
 */
export async function addThumbUpReaction(
  octokit: Octokit,
  repo: RepoContext,
  event: GitHubEvent,
): Promise<void> {
  await removeEyeReaction(octokit, repo, event);

  const handler = getReactionHandlers(octokit, repo, event);
  if (!handler) return;

  try {
    await handler.create('+1');
    core.info(`Added thumbs up reaction to ${handler.logTarget}`);
  } catch (error) {
    core.warning(
      `Failed to add thumbs up reaction: ${
        error instanceof Error ? error.message : error
      }`,
    );
  }
}
