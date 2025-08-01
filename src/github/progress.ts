/**
 * Utilities for creating and updating GitHub progress comments in workflows.
 */
import * as core from '@actions/core';
import type { Octokit } from 'octokit';
import type { GitHubEvent } from './types';
import { GitHubError } from '../utils/errors';
import {
  PROGRESS_BAR_BLOCKS,
  PROGRESS_TITLE,
  LOADING_PHRASES,
} from '../constants';

/**
 * Escape special characters in a literal string so it can be used in a RegExp.
 * @param str - Input string containing potential RegExp metacharacters.
 * @returns A string where regex-meaningful characters are escaped.
 */
export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\\]\\\\]/g, '$\\&');
}

/** Repository owner and name context. */
type RepoContext = { owner: string; repo: string };

/** HTML snippet for the spinner icon displayed next to the active step. */
const SPINNER_HTML =
  ' <img src="https://github.com/user-attachments/assets/082dfba3-0ee2-4b6e-9606-93063bcc7590" alt="spinner" width="16" height="16"/>';

/** Select a random loading phrase to display under the progress bar. */
function getRandomLoadingPhrase(): string {
  return LOADING_PHRASES[Math.floor(Math.random() * LOADING_PHRASES.length)];
}

/**
 * Construct a URL to the current GitHub Actions run.
 * @returns A URL string if context vars are set, otherwise null.
 */
function getRunUrl(): string | null {
  const server = process.env.GITHUB_SERVER_URL || 'https://github.com';
  const repo = process.env.GITHUB_REPOSITORY;
  const runId = process.env.GITHUB_RUN_ID;
  if (!repo || !runId) return null;
  return `${server}/${repo}/actions/runs/${runId}`;
}

/**
 * Create a GitHub comment to display initial progress steps with checkboxes.
 * @param octokit - Authenticated Octokit client.
 * @param repo - Repository owner and name context.
 * @param event - The GitHubEvent where the comment will be posted.
 * @param steps - Array of markdown step descriptions to render.
 * @returns Promise resolving to the created comment ID.
 */
export async function createProgressComment(
  octokit: Octokit,
  repo: RepoContext,
  event: GitHubEvent,
  steps: string[],
): Promise<number> {
  const emptyBar = '░'.repeat(PROGRESS_BAR_BLOCKS);
  const runUrl = getRunUrl();
  const lines = [
    PROGRESS_TITLE,
    '',
    `Progress: [${emptyBar}] 0%`,
    '',
    getRandomLoadingPhrase(),
    '',
    ...steps.map((step, i) => {
      const checkbox = `- [ ] ${step}`;
      return i === 0 ? `${checkbox}${SPINNER_HTML}` : checkbox;
    }),
    '',
  ];
  if (runUrl) {
    lines.push(`[View job run](${runUrl})`, '');
  }
  const body = lines.join('\n');
  if ('issue' in event) {
    const { data } = await octokit.rest.issues.createComment({
      ...repo,
      issue_number: event.issue.number,
      body,
    });
    core.info(`Created progress comment with id: ${data.id}`);
    return data.id;
  } else if ('pull_request' in event && 'comment' in event) {
    const inReplyTo = event.comment.in_reply_to_id ?? event.comment.id;
    const { data } = await octokit.rest.pulls.createReplyForReviewComment({
      ...repo,
      pull_number: event.pull_request.number,
      comment_id: inReplyTo,
      body,
    });
    core.info(`Created progress comment with id: ${data.id}`);
    return data.id;
  }
  throw new GitHubError('Unsupported event for progress comment');
}

/**
 * Update the content of an existing GitHub progress comment.
 * @param octokit - Authenticated Octokit client.
 * @param repo - Repository owner and name context.
 * @param event - The GitHubEvent that the comment belongs to.
 * @param commentId - ID of the comment to update.
 * @param steps - Array of markdown-formatted step lines to render.
 * @returns Promise that resolves when the comment is updated.
 */
export async function updateProgressComment(
  octokit: Octokit,
  repo: RepoContext,
  event: GitHubEvent,
  commentId: number,
  steps: string[],
): Promise<void> {
  const total = steps.length;
  const completed = steps.filter((s) => s.startsWith('- [x]')).length;
  const filled = Math.round((completed / total) * PROGRESS_BAR_BLOCKS);
  const bar = '█'.repeat(filled) + '░'.repeat(PROGRESS_BAR_BLOCKS - filled);
  const percent = Math.round((completed / total) * 100);

  const runUrl = getRunUrl();
  const lines = [
    PROGRESS_TITLE,
    '',
    `Progress: ${bar} ${percent}%${percent === 100 ? ' ✅' : ''}`,
    '',
    getRandomLoadingPhrase(),
    '',
    ...steps.map((line, i) =>
      i === completed && completed !== total ? `${line}${SPINNER_HTML}` : line,
    ),
    '',
  ];
  if (runUrl) {
    lines.push(`[View job run](${runUrl})`, '');
  }
  const body = lines.join('\n');
  if ('issue' in event) {
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
    throw new GitHubError('Unsupported event for updating progress comment');
  }
}
