/**
 * Utilities for creating and updating GitHub progress comments in workflows.
 */

import * as core from '@actions/core';
import type { Octokit } from 'octokit';

import {
  PROGRESS_BAR_BLOCKS,
  PROGRESS_TITLE,
  LOADING_PHRASES,
} from '../constants';
import { GitHubError } from '../utils/errors';

import type { GitHubEvent } from './types';

/**
 * Escape special characters in a literal string so it can be used in a RegExp.
 * @param str - Input string containing potential RegExp metacharacters.
 * @returns A string where regex-meaningful characters are escaped.
 */

/**
 *
 * @param str
 */

/**
 *
 * @param str
 */

/**
 *
 * @param str
 */

/**
 *
 * @param str
 */

/**
 *
 * @param str
 */

/**
 *
 * @param str
 */

/**
 *
 */
export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\\]\\\\]/g, '$\\&');
}

/**
 * Create a GitHub comment to display initial progress steps with checkboxes.
 * @param octokit - Authenticated Octokit client.
 * @param repo - Repository owner and name context.
 * @param repo.owner
 * @param event - The GitHubEvent where the comment will be posted.
 * @param repo.repo
 * @param steps - Array of markdown step descriptions to render.
 * @returns Promise resolving to the created comment ID.
 */

/**
 *
 * @param octokit
 * @param repo
 * @param repo.owner
 * @param repo.repo
 * @param event
 * @param steps
 */

/**
 *
 * @param octokit
 * @param repo
 * @param repo.owner
 * @param repo.repo
 * @param event
 * @param steps
 */

/**
 *
 * @param octokit
 * @param repo
 * @param repo.owner
 * @param repo.repo
 * @param event
 * @param steps
 */

/**
 *
 * @param octokit
 * @param repo
 * @param repo.owner
 * @param repo.repo
 * @param event
 * @param steps
 */

/**
 *
 * @param octokit
 * @param repo
 * @param repo.owner
 * @param repo.repo
 * @param event
 * @param steps
 */

/**
 *
 * @param octokit
 * @param repo
 * @param repo.owner
 * @param repo.repo
 * @param event
 * @param steps
 */

export async function createProgressComment(
  octokit: Octokit,
  repo: { owner: string; repo: string },
  event: GitHubEvent,
  steps: string[],
): Promise<number> {
  const barBlocks = PROGRESS_BAR_BLOCKS;
  const emptyBar = '░'.repeat(barBlocks);
  const title = PROGRESS_TITLE;
  const loadingPhrase =
    LOADING_PHRASES[Math.floor(Math.random() * LOADING_PHRASES.length)];
  const bodyLines: string[] = [
    title,
    '',
    `Progress: [${emptyBar}] 0%`,
    '',
    loadingPhrase,
    '',
  ];
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const prefix = `- [ ] ${step}`;
    const spinnerSuffix =
      i === 0
        ? ' <img src="https://github.com/user-attachments/assets/082dfba3-0ee2-4b6e-9606-93063bcc7590" alt="spinner" width="16" height="16"/>'
        : '';
    bodyLines.push(prefix + spinnerSuffix);
  }
  bodyLines.push('');
  const body = bodyLines.join('\n');
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
 * @param repo.owner
 * @param event - The GitHubEvent that the comment belongs to.
 * @param repo.repo
 * @param commentId - ID of the comment to update.
 * @param steps - Array of markdown-formatted step lines to render.
 * @returns Promise that resolves when the comment is updated.
 */

/**
 *
 * @param octokit
 * @param repo
 * @param repo.owner
 * @param repo.repo
 * @param event
 * @param commentId
 * @param steps
 */

/**
 *
 * @param octokit
 * @param repo
 * @param repo.owner
 * @param repo.repo
 * @param event
 * @param commentId
 * @param steps
 */

/**
 *
 * @param octokit
 * @param repo
 * @param repo.owner
 * @param repo.repo
 * @param event
 * @param commentId
 * @param steps
 */

/**
 *
 * @param octokit
 * @param repo
 * @param repo.owner
 * @param repo.repo
 * @param event
 * @param commentId
 * @param steps
 */

/**
 *
 * @param octokit
 * @param repo
 * @param repo.owner
 * @param repo.repo
 * @param event
 * @param commentId
 * @param steps
 */

/**
 *
 * @param octokit
 * @param repo
 * @param repo.owner
 * @param repo.repo
 * @param event
 * @param commentId
 * @param steps
 */

export async function updateProgressComment(
  octokit: Octokit,
  repo: { owner: string; repo: string },
  event: GitHubEvent,
  commentId: number,
  steps: string[],
): Promise<void> {
  const total = steps.length;
  const completed = steps.filter((s) => s.startsWith('- [x]')).length;
  const barBlocks = PROGRESS_BAR_BLOCKS;
  const filled = Math.round((completed / total) * barBlocks);
  const bar = '█'.repeat(filled) + '░'.repeat(barBlocks - filled);
  const percent = Math.round((completed / total) * 100);
  const title = PROGRESS_TITLE;
  const loadingPhrase =
    LOADING_PHRASES[Math.floor(Math.random() * LOADING_PHRASES.length)];
  const bodyLines: string[] = [
    title,
    '',
    `Progress: ${bar} ${percent}%${percent === 100 ? ' ✅' : ''}`,
    '',
    loadingPhrase,
    '',
  ];
  for (let i = 0; i < steps.length; i++) {
    let line = steps[i];
    if (i === completed && completed !== total) {
      line =
        line +
        ' <img src="https://github.com/user-attachments/assets/082dfba3-0ee2-4b6e-9606-93063bcc7590" alt="spinner" width="16" height="16"/>';
    }
    bodyLines.push(line);
  }
  bodyLines.push('');
  const body = bodyLines.join('\n');
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
