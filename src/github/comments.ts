/**
 * Utilities for posting and updating comments on GitHub issues and pull requests.
 */
import * as core from '@actions/core';
import type { Octokit } from 'octokit';
import type {
  GitHubEvent,
  GitHubEventPullRequestReviewCommentCreated,
  RepoContext,
} from './types';
import { truncateOutput } from './utils';

// Type guards for GitHubEvent type narrowing
function isIssueEvent(event: GitHubEvent): event is { issue: { number: number } } {
  return 'issue' in event;
}

function isReviewCommentEvent(
  event: GitHubEvent,
): event is GitHubEventPullRequestReviewCommentCreated {
  return 'pull_request' in event && 'comment' in event;
}

/**
 * Post a comment to an issue (or pull request via issues API).
 */
async function postIssueComment(
  octokit: Octokit,
  repo: RepoContext,
  issueNumber: number,
  body: string,
): Promise<void> {
  await octokit.rest.issues.createComment({
    ...repo,
    issue_number: issueNumber,
    body: truncateOutput(body),
  });
  core.info(`Comment posted to Issue/PR #${issueNumber}`);
}

/**
 * Post a reply to a pull request review comment, or fallback to a regular PR comment.
 */
async function postReviewReply(
  octokit: Octokit,
  repo: RepoContext,
  prNumber: number,
  commentId: number,
  inReplyToId: number | undefined,
  body: string,
): Promise<void> {
  try {
    await octokit.rest.pulls.createReplyForReviewComment({
      ...repo,
      pull_number: prNumber,
      comment_id: inReplyToId ?? commentId,
      body: truncateOutput(body),
    });
    core.info(
      `Comment posted to PR #${prNumber} reply to comment #${commentId}`,
    );
  } catch (error) {
    core.warning(
      `Failed to post reply comment: ${
        error instanceof Error ? error.message : error
      }`,
    );
    await postIssueComment(octokit, repo, prNumber, body);
    core.info(`Regular comment posted to PR #${prNumber}`);
  }
}

/**
 * Posts a comment to an issue or pull request.
 * @param octokit - Authenticated Octokit client.
 * @param repo - Repository owner and name context.
 * @param event - The GitHubEvent triggering the comment.
 * @param body - Content of the comment.
 * @returns Promise that resolves when the comment is posted.
 */
export async function postComment(
  octokit: Octokit,
  repo: RepoContext,
  event: GitHubEvent,
  body: string,
): Promise<void> {
  try {
    if (isIssueEvent(event)) {
      await postIssueComment(octokit, repo, event.issue.number, body);
      return;
    }
    if (isReviewCommentEvent(event)) {
      await postReviewReply(
        octokit,
        repo,
        event.pull_request.number,
        event.comment.id,
        event.comment.in_reply_to_id,
        body,
      );
      return;
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
      return;
    }
    if (isIssueEvent(event)) {
      await octokit.rest.issues.updateComment({
        ...repo,
        comment_id: commentId,
        body,
      });
      return;
    }
    if ('pull_request' in event) {
      await octokit.rest.pulls.updateReviewComment({
        ...repo,
        comment_id: commentId,
        body,
      });
      return;
    }
    await postComment(octokit, repo, event, body);
  } catch (error) {
    core.warning(
      `Failed to upsert comment: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
