/**
 * Utility functions for normalizing and extracting data from GitHub webhook events.
 */
import { DEFAULT_TRIGGER_PHRASE } from '../constants';
import type { AgentEvent, GitHubEvent } from './types';

/**
 * Determine the normalized AgentEvent type from a raw GitHub webhook payload.
 * @param payload - Raw webhook event payload.
 * @returns AgentEvent object if recognized, otherwise null.
 */
export function getEventType(payload: unknown): AgentEvent | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }
  if (
    payload.action === 'opened' &&
    payload.issue &&
    !payload.issue.pull_request
  ) {
    return { type: 'issuesOpened', github: payload };
  }
  if (
    payload.action === 'assigned' &&
    payload.issue &&
    !payload.issue.pull_request &&
    payload.assignee
  ) {
    return { type: 'issuesAssigned', github: payload };
  }
  if (
    payload.action === 'created' &&
    payload.issue &&
    !payload.issue.pull_request &&
    payload.comment
  ) {
    return { type: 'issueCommentCreated', github: payload };
  }
  if (
    payload.action === 'created' &&
    payload.issue &&
    payload.issue.pull_request &&
    payload.comment
  ) {
    return { type: 'pullRequestCommentCreated', github: payload };
  }
  if (
    payload.action === 'created' &&
    payload.pull_request &&
    payload.comment &&
    payload.comment.path
  ) {
    return { type: 'pullRequestReviewCommentCreated', github: payload };
  }
  if (
    (payload.action === 'opened' || payload.action === 'synchronize') &&
    payload.pull_request &&
    !payload.issue &&
    !payload.comment
  ) {
    return {
      type:
        payload.action === 'opened'
          ? 'pullRequestOpened'
          : 'pullRequestSynchronize',
      github: payload,
    };
  }
  return null;
}

/**
 * Extracts the relevant text (title, body, or comment) from the GitHubEvent.
 * @param event - GitHubEvent containing issue or pull request data.
 * @returns Extracted text content or null if unavailable.
 */
export function extractText(event: GitHubEvent): string | null {
  if (
    (event.action === 'opened' || event.action === 'synchronize') &&
    'pull_request' in event
  ) {
    const title = event.pull_request.title.trim();
    const body = (event.pull_request.body || '').trim();
    if (body.startsWith(DEFAULT_TRIGGER_PHRASE)) {
      return body + (title ? '\n\n' + title : '');
    }
    if (title.startsWith(DEFAULT_TRIGGER_PHRASE)) {
      return title + (body ? '\n\n' + body : '');
    }
    return body;
  }
  if (
    (event.action === 'opened' || event.action === 'assigned') &&
    'issue' in event
  ) {
    const title = event.issue.title.trim();
    const body = event.issue.body.trim();
    if (body.startsWith(DEFAULT_TRIGGER_PHRASE)) {
      return body + (title ? '\n\n' + title : '');
    }
    if (title.startsWith(DEFAULT_TRIGGER_PHRASE)) {
      return title + (body ? '\n\n' + body : '');
    }
    return body;
  }
  if (event.action === 'created' && 'comment' in event && event.comment) {
    return event.comment.body;
  }
  return null;
}
