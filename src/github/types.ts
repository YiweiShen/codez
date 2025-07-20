/**
 * Type definitions for GitHub event payloads and related data.
 */

/**
 * Normalized GitHub webhook event for the Codex agent.
 */
export type AgentEvent =
  | { type: 'issuesOpened'; github: GitHubEventIssuesOpened }
  | { type: 'issueCommentCreated'; github: GitHubEventIssueCommentCreated }
  | { type: 'pullRequestCommentCreated'; github: GitHubEventPullRequestCommentCreated }
  | { type: 'pullRequestReviewCommentCreated'; github: GitHubEventPullRequestReviewCommentCreated }
  | { type: 'issuesAssigned'; github: GitHubEventIssuesAssigned }
  | { type: 'pullRequestOpened'; github: GitHubEventPullRequestOpened }
  | { type: 'pullRequestSynchronize'; github: GitHubEventPullRequestSynchronize };

/**
 * Raw GitHub event payload types.
 */
export type GitHubEvent =
  | GitHubEventIssuesOpened
  | GitHubEventIssueCommentCreated
  | GitHubEventPullRequestCommentCreated
  | GitHubEventPullRequestReviewCommentCreated
  | GitHubEventIssuesAssigned
  | GitHubEventPullRequestOpened
  | GitHubEventPullRequestSynchronize;

export type GitHubEventIssuesOpened = { action: 'opened'; issue: GitHubIssue };
export type GitHubEventIssueCommentCreated = {
  action: 'created';
  issue: GitHubIssue;
  comment: GithubComment;
};
export type GitHubEventPullRequestCommentCreated = {
  action: 'created';
  issue: GitHubPullRequest;
  comment: GithubComment;
};
export type GitHubEventPullRequestReviewCommentCreated = {
  action: 'created';
  pull_request: { number: number; title?: string; body?: string };
  comment: {
    id: number;
    body: string;
    path: string;
    in_reply_to_id?: number;
    position?: number;
    line?: number;
  };
};
export type GitHubEventIssuesAssigned = {
  action: 'assigned';
  issue: GitHubIssue;
  assignee: { login: string };
};
export type GitHubEventPullRequestOpened = {
  action: 'opened';
  pull_request: GitHubPullRequest;
};
export type GitHubEventPullRequestSynchronize = {
  action: 'synchronize';
  pull_request: GitHubPullRequest;
};

export type GithubComment = { id: number; body: string };
export type GitHubIssue = { number: number; title: string; body: string; pull_request: null };
export type GitHubPullRequest = {
  number: number;
  title: string;
  body: string;
  pull_request: { url: string };
};

/**
 * Content and comments data for issues and pull requests.
 */
export type GithubContentsData = {
  content: { number?: number; title: string; body: string; login: string };
  comments: { body: string; login: string }[];
};

/**
 * Repository owner/name context for API calls.
 */
export type RepoContext = { owner: string; repo: string };
