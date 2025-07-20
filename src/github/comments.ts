/**
 * Utilities for posting and updating comments on GitHub issues and pull requests.
 */

import * as core from '@actions/core';
import type { Octokit } from 'octokit';

import type { RepoContext, GitHubEvent } from './types';

import { truncateOutput } from './utils';

/**
 * Posts a comment to an issue or pull request.
 * @param octokit - Authenticated Octokit client.
 * @param repo - Repository owner and name context.
 * @param event - The GitHubEvent triggering the comment.
 * @param body - Content of the comment.
 * @returns Promise that resolves when the comment is posted.
 */

/**
 *
 * @param octokit
 * @param repo
 * @param event
 * @param body
 */

/**
 *
 * @param octokit
 * @param repo
 * @param event
 * @param body
 */

/**
 *
 * @param octokit
 * @param repo
 * @param event
 * @param body
 */

/**
 *
 * @param octokit
 * @param repo
 * @param event
 * @param body
 */

/**
 *
 * @param octokit
 * @param repo
 * @param event
 * @param body
 */

/**
 *
 * @param octokit
 * @param repo
 * @param event
 * @param body
 */

/**
 *
 */
export async function postComment(
  octokit: Octokit,
  repo: RepoContext,
  event: GitHubEvent,
  body: string,
): Promise<void> {
  try {
    if ('issue' in event) {
      const issueNumber = event.issue.number;
      await octokit.rest.issues.createComment({
        ...repo,
        issue_number: issueNumber,
        body: truncateOutput(body),
      });
      core.info(`Comment posted to Issue/PR #${issueNumber}`);
    } else if ('pull_request' in event && 'comment' in event) {
      const prNumber = event.pull_request.number;
      const commentId = event.comment.id;
      const inReplyTo = event.comment.in_reply_to_id;
      try {
        await octokit.rest.pulls.createReplyForReviewComment({
          ...repo,
          pull_number: prNumber,
          comment_id: inReplyTo ?? commentId,
          body: truncateOutput(body),
        });
        core.info(
          `Comment posted to PR #${prNumber} Reply to comment #${commentId}`,
        );
      } catch (error) {
        core.warning(
          `Failed to post reply comment: ${
            error instanceof Error ? error.message : error
          }`,
        );
        await octokit.rest.issues.createComment({
          ...repo,
          issue_number: prNumber,
          body: truncateOutput(body),
        });
        core.info(`Regular comment posted to PR #${prNumber}`);
      }
    }
  } catch (error) {
    core.error(
      `Failed to post comment: ${
        error instanceof Error ? error.message : error
      }`,
    );
  }
}

/**
 * Creates or updates a comment based on the presence of commentId.
 * @param octokit - Authenticated Octokit client.
 * @param repo - Repository owner and name context.
 * @param event - The GitHubEvent triggering the upsert.
 * @param commentId - ID of the comment to update, or undefined to create a new one.
 * @param body - Content of the comment.
 * @returns Promise that resolves when the comment is upserted.
 */

/**
 *
 * @param octokit
 * @param repo
 * @param event
 * @param commentId
 * @param body
 */

/**
 *
 * @param octokit
 * @param repo
 * @param event
 * @param commentId
 * @param body
 */

/**
 *
 * @param octokit
 * @param repo
 * @param event
 * @param commentId
 * @param body
 */

/**
 *
 * @param octokit
 * @param repo
 * @param event
 * @param commentId
 * @param body
 */

/**
 *
 * @param octokit
 * @param repo
 * @param event
 * @param commentId
 * @param body
 */

/**
 *
 * @param octokit
 * @param repo
 * @param event
 * @param commentId
 * @param body
 */

/**
 *
 */
export async function upsertComment(
  octokit: Octokit,
  repo: RepoContext,
  event: GitHubEvent,
  commentId: number | undefined,
  body: string,
): Promise<void> {
  try {
    if (!commentId) {
      await postComment(octokit, repo, event, body);
    } else if ('issue' in event) {
      await octokit.rest.issues.updateComment({
        ...repo,
        comment_id: commentId,
        body,
      });
    } else if ('pull_request' in event) {
      await octokit.rest.pulls.updateReviewComment({
        ...repo,
        comment_id: commentId,
        body,
      });
    } else {
      await postComment(octokit, repo, event, body);
    }
  } catch (error) {
    core.warning(
      `Failed to upsert comment: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
