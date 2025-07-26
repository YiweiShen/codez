/**
 * Utility functions for normalizing and extracting data from GitHub webhook events.
 */
import { DEFAULT_TRIGGER_PHRASE } from '../constants';
import type {
  AgentEvent,
  GitHubEvent,
  GitHubEventIssuesOpened,
  GitHubEventIssuesAssigned,
  GitHubEventIssueCommentCreated,
  GitHubEventPullRequestCommentCreated,
  GitHubEventPullRequestReviewCommentCreated,
  GitHubEventPullRequestOpened,
  GitHubEventPullRequestSynchronize,
} from './types';

/**
 * Type guards for GitHub webhook payload variants.
 */
function isObject(payload: unknown): payload is Record<string, unknown> {
  return typeof payload === 'object' && payload !== null;
}

function isIssuesOpenedPayload(
  payload: unknown,
): payload is GitHubEventIssuesOpened {
  return (
    isObject(payload) &&
    payload.action === 'opened' &&
    isObject(payload.issue) &&
    payload.issue.pull_request == null
  );
}

function isIssuesAssignedPayload(
  payload: unknown,
): payload is GitHubEventIssuesAssigned {
  return (
    isObject(payload) &&
    payload.action === 'assigned' &&
    isObject(payload.issue) &&
    payload.issue.pull_request == null &&
    isObject(payload.assignee)
  );
}

function isIssueCommentCreatedPayload(
  payload: unknown,
): payload is GitHubEventIssueCommentCreated {
  return (
    isObject(payload) &&
    payload.action === 'created' &&
    isObject(payload.issue) &&
    payload.issue.pull_request == null &&
    isObject(payload.comment)
  );
}

function isPullRequestCommentCreatedPayload(
  payload: unknown,
): payload is GitHubEventPullRequestCommentCreated {
  return (
    isObject(payload) &&
    payload.action === 'created' &&
    isObject(payload.issue) &&
    payload.issue.pull_request != null &&
    isObject(payload.comment)
  );
}

function isPullRequestReviewCommentCreatedPayload(
  payload: unknown,
): payload is GitHubEventPullRequestReviewCommentCreated {
  return (
    isObject(payload) &&
    payload.action === 'created' &&
    isObject(payload.pull_request) &&
    isObject(payload.comment) &&
    'path' in payload.comment
  );
}

function isPullRequestOpenedOrSyncedPayload(
  payload: unknown,
): payload is GitHubEventPullRequestOpened | GitHubEventPullRequestSynchronize {
  return (
    isObject(payload) &&
    (payload.action === 'opened' || payload.action === 'synchronize') &&
    isObject(payload.pull_request) &&
    payload.issue == null &&
    payload.comment == null
  );
}

/**
 * Determine the normalized AgentEvent type from a raw GitHub webhook payload.
 * @param payload - Raw webhook event payload.
 * @returns AgentEvent object if recognized, otherwise null.
 */
export function getEventType(payload: unknown): AgentEvent | null {
  if (isIssuesOpenedPayload(payload)) {
    return { type: 'issuesOpened', github: payload };
  }
  if (isIssuesAssignedPayload(payload)) {
    return { type: 'issuesAssigned', github: payload };
  }
  if (isIssueCommentCreatedPayload(payload)) {
    return { type: 'issueCommentCreated', github: payload };
  }
  if (isPullRequestCommentCreatedPayload(payload)) {
    return { type: 'pullRequestCommentCreated', github: payload };
  }
  if (isPullRequestReviewCommentCreatedPayload(payload)) {
    return { type: 'pullRequestReviewCommentCreated', github: payload };
  }
  if (isPullRequestOpenedOrSyncedPayload(payload)) {
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
 * Helper to merge body and title respecting the DEFAULT_TRIGGER_PHRASE.
 */
function mergeTriggerPhrase(body: string, title: string): string {
  if (body.startsWith(DEFAULT_TRIGGER_PHRASE)) {
    return `${body}${title ? `\n\n${title}` : ''}`;
  }
  if (title.startsWith(DEFAULT_TRIGGER_PHRASE)) {
    return `${title}${body ? `\n\n${body}` : ''}`;
  }
  return body;
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
    const { title: prTitle, body: prBody } = event.pull_request;
    const title = prTitle.trim();
    const body = (prBody ?? '').trim();
    return mergeTriggerPhrase(body, title);
  }

  if (
    (event.action === 'opened' || event.action === 'assigned') &&
    'issue' in event
  ) {
    const { title: issueTitle, body: issueBody } = event.issue;
    const title = issueTitle.trim();
    const body = issueBody.trim();
    return mergeTriggerPhrase(body, title);
  }

  if (event.action === 'created' && 'comment' in event && event.comment) {
    return event.comment.body;
  }

  return null;
}
