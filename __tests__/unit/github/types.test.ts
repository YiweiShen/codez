import { describe, expect, it } from '@jest/globals';

import type {
  GitHubEventIssuesOpened,
  GitHubEventPullRequestCommentCreated,
  GitHubEventPullRequestOpened,
  GitHubEventPullRequestReviewCommentCreated,
} from '../../../src/github/types';
import {
  getIssueOrPullRequestNumber,
  getIssueOrPullRequestTitle,
  hasIssue,
  hasPullRequest,
  isReviewCommentEvent,
} from '../../../src/github/types';

describe('github event typed helpers', () => {
  it('normalizes issue metadata for issue events', () => {
    const event: GitHubEventIssuesOpened = {
      action: 'opened',
      issue: {
        number: 12,
        title: 'Issue title',
        body: 'body',
        pull_request: null,
      },
    };

    expect(hasIssue(event)).toBe(true);
    expect(hasPullRequest(event)).toBe(false);
    expect(getIssueOrPullRequestNumber(event)).toBe(12);
    expect(getIssueOrPullRequestTitle(event)).toBe('Issue title');
  });

  it('normalizes issue-like PR comment events via issue field', () => {
    const event: GitHubEventPullRequestCommentCreated = {
      action: 'created',
      issue: {
        number: 33,
        title: 'PR via issue payload',
        body: 'body',
        pull_request: { url: 'https://example.com/pull/33' },
      },
      comment: { id: 100, body: 'comment' },
    };

    expect(hasIssue(event)).toBe(true);
    expect(getIssueOrPullRequestNumber(event)).toBe(33);
    expect(getIssueOrPullRequestTitle(event)).toBe('PR via issue payload');
  });

  it('normalizes top-level pull request metadata', () => {
    const event: GitHubEventPullRequestOpened = {
      action: 'opened',
      pull_request: {
        number: 7,
        title: 'PR title',
        body: 'body',
        pull_request: { url: 'https://example.com/pull/7' },
      },
    };

    expect(hasIssue(event)).toBe(false);
    expect(hasPullRequest(event)).toBe(true);
    expect(getIssueOrPullRequestNumber(event)).toBe(7);
    expect(getIssueOrPullRequestTitle(event)).toBe('PR title');
  });

  it('detects review-comment events', () => {
    const event: GitHubEventPullRequestReviewCommentCreated = {
      action: 'created',
      pull_request: { number: 9, title: 'Review PR', body: 'body' },
      comment: { id: 123, body: 'review', path: 'src/file.ts' },
    };

    expect(isReviewCommentEvent(event)).toBe(true);
  });
});
