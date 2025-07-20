/**
 * Reaction utilities for adding or removing reactions on GitHub issues and comments.
 */

import * as core from '@actions/core';
import type { Octokit } from 'octokit';

import type { RepoContext, GitHubEvent } from './types';

/**
 * Adds an 'eyes' reaction to the specified issue or comment event.
 * @param octokit - Authenticated Octokit client.
 * @param repo - Repository owner and name context.
 * @param event - GitHubEvent describing the issue or comment.
 * @returns Promise that resolves when the reaction is added.
 */

/**
 *
 * @param octokit
 * @param repo
 * @param event
 */

/**
 *
 * @param octokit
 * @param repo
 * @param event
 */

/**
 *
 * @param octokit
 * @param repo
 * @param event
 */

/**
 *
 * @param octokit
 * @param repo
 * @param event
 */

/**
 *
 * @param octokit
 * @param repo
 * @param event
 */

/**
 *
 * @param octokit
 * @param repo
 * @param event
 */

/**
 *
 */
export async function addEyeReaction(
  octokit: Octokit,
  repo: RepoContext,
  event: GitHubEvent,
): Promise<void> {
  try {
    if (event.action === 'opened' && 'issue' in event) {
      await octokit.rest.reactions.createForIssue({
        ...repo,
        issue_number: event.issue.number,
        content: 'eyes',
      });
      core.info(`Added eye reaction to issue #${event.issue.number}`);
    } else if (
      event.action === 'created' &&
      'comment' in event &&
      'issue' in event
    ) {
      await octokit.rest.reactions.createForIssueComment({
        ...repo,
        comment_id: event.comment.id,
        content: 'eyes',
      });
      core.info(
        `Added eye reaction to comment on issue/PR #${event.issue.number}`,
      );
    } else if (
      event.action === 'created' &&
      'comment' in event &&
      'pull_request' in event
    ) {
      await octokit.rest.reactions.createForPullRequestReviewComment({
        ...repo,
        comment_id: event.comment.id,
        content: 'eyes',
      });
      core.info(
        `Added eye reaction to review comment on PR #${event.pull_request.number}`,
      );
    }
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

/**
 *
 * @param octokit
 * @param repo
 * @param event
 */

/**
 *
 * @param octokit
 * @param repo
 * @param event
 */

/**
 *
 * @param octokit
 * @param repo
 * @param event
 */

/**
 *
 * @param octokit
 * @param repo
 * @param event
 */

/**
 *
 * @param octokit
 * @param repo
 * @param event
 */

/**
 *
 * @param octokit
 * @param repo
 * @param event
 */

/**
 *
 */
export async function removeEyeReaction(
  octokit: Octokit,
  repo: RepoContext,
  event: GitHubEvent,
): Promise<void> {
  try {
    if (
      (event.action === 'opened' || event.action === 'assigned') &&
      'issue' in event
    ) {
      const reactions = await octokit.rest.reactions.listForIssue({
        ...repo,
        issue_number: event.issue.number,
      });
      for (const reaction of reactions.data) {
        if (
          reaction.content === 'eyes' &&
          reaction.user?.login === 'github-actions[bot]'
        ) {
          await octokit.rest.reactions.deleteForIssue({
            ...repo,
            issue_number: event.issue.number,
            reaction_id: reaction.id,
          });
          core.info(`Removed eye reaction from issue #${event.issue.number}`);
          break;
        }
      }
    } else if (
      event.action === 'created' &&
      'comment' in event &&
      'issue' in event
    ) {
      const reactions = await octokit.rest.reactions.listForIssueComment({
        ...repo,
        comment_id: event.comment.id,
      });
      for (const reaction of reactions.data) {
        if (
          reaction.content === 'eyes' &&
          reaction.user?.login === 'github-actions[bot]'
        ) {
          await octokit.rest.reactions.deleteForIssueComment({
            ...repo,
            comment_id: event.comment.id,
            reaction_id: reaction.id,
          });
          core.info(
            `Removed eye reaction from comment on issue/PR #${event.issue.number}`,
          );
          break;
        }
      }
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

/**
 *
 * @param octokit
 * @param repo
 * @param event
 */

/**
 *
 * @param octokit
 * @param repo
 * @param event
 */

/**
 *
 * @param octokit
 * @param repo
 * @param event
 */

/**
 *
 * @param octokit
 * @param repo
 * @param event
 */

/**
 *
 * @param octokit
 * @param repo
 * @param event
 */

/**
 *
 * @param octokit
 * @param repo
 * @param event
 */

/**
 *
 */
export async function addThumbUpReaction(
  octokit: Octokit,
  repo: RepoContext,
  event: GitHubEvent,
): Promise<void> {
  try {
    if (
      (event.action === 'opened' || event.action === 'assigned') &&
      'issue' in event
    ) {
      await octokit.rest.reactions.createForIssue({
        ...repo,
        issue_number: event.issue.number,
        content: '+1',
      });
      core.info(`Added thumbs up reaction to issue #${event.issue.number}`);
    } else if (
      event.action === 'created' &&
      'comment' in event &&
      'issue' in event
    ) {
      await octokit.rest.reactions.createForIssueComment({
        ...repo,
        comment_id: event.comment.id,
        content: '+1',
      });
      core.info(
        `Added thumbs up reaction to comment on issue/PR #${event.issue.number}`,
      );
    } else if (
      event.action === 'created' &&
      'comment' in event &&
      'pull_request' in event
    ) {
      await octokit.rest.reactions.createForPullRequestReviewComment({
        ...repo,
        comment_id: event.comment.id,
        content: '+1',
      });
      core.info(
        `Added thumbs up reaction to review comment on PR #${event.pull_request.number}`,
      );
    }
  } catch (error) {
    core.warning(
      `Failed to add thumbs up reaction: ${
        error instanceof Error ? error.message : error
      }`,
    );
  }
}
