/**
 * @file GitHub client helper module.
 * Defines types and functions for interacting with GitHub events, issues,
 * comments, reactions, and repository operations.
 */

import { promises as fs } from 'fs';

import * as core from '@actions/core';

import * as github from '@actions/github';

import { execa } from 'execa';

import { Octokit } from 'octokit';

import { promptBuilderConfig } from '../config/prompts';

import { DEFAULT_TRIGGER_PHRASE } from '../constants';
import { genContentsString, genFullContentsString } from '../utils/contents';

import { toErrorMessage } from '../utils/error';
import { GitHubError } from '../utils/errors';

/**
 * Infer a branch type keyword from a commit message header.
 * Maps common Conventional Commit prefixes to branch categories.
 * @param commitMessage - The commit message to analyze.
 * @returns A string tag such as 'feat', 'fix', 'docs', 'styles', or default 'chore'.
 */

export function getBranchType(commitMessage: string): string {
  const cm = commitMessage.toLowerCase();
  if (/^(add|create|implement|introduce)/.test(cm)) return 'feat';
  if (/^(fix|correct|resolve|patch|repair)/.test(cm)) return 'fix';
  if (/(docs?|documentation)/.test(cm)) return 'docs';
  if (/^(style|format|lint)/.test(cm)) return 'styles';
  return 'chore';
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Type definitions for GitHub events and payloads.

export type AgentEvent =
  | { type: 'issuesOpened'; github: GitHubEventIssuesOpened }
  | { type: 'issueCommentCreated'; github: GitHubEventIssueCommentCreated }
  | {
      type: 'pullRequestCommentCreated';
      github: GitHubEventPullRequestCommentCreated;
    }
  | {
      type: 'pullRequestReviewCommentCreated';
      github: GitHubEventPullRequestReviewCommentCreated;
    }
  | { type: 'issuesAssigned'; github: GitHubEventIssuesAssigned }
  | { type: 'pullRequestOpened'; github: GitHubEventPullRequestOpened }
  | {
      type: 'pullRequestSynchronize';
      github: GitHubEventPullRequestSynchronize;
    };

export type GitHubEvent =
  | GitHubEventIssuesOpened
  | GitHubEventIssueCommentCreated
  | GitHubEventPullRequestCommentCreated
  | GitHubEventPullRequestReviewCommentCreated
  | GitHubEventIssuesAssigned
  | GitHubEventPullRequestOpened
  | GitHubEventPullRequestSynchronize;

export type GitHubEventIssuesOpened = {
  action: 'opened';
  issue: GitHubIssue;
};

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
  pull_request: {
    number: number;
    title?: string;
    body?: string;
  };
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

export type GithubComment = {
  id: number;
  body: string;
};

export type GitHubIssue = {
  number: number;
  title: string;
  body: string;
  pull_request: null;
};

export type GitHubPullRequest = {
  number: number;
  title: string;
  body: string;
  pull_request: {
    url: string;
  };
};

export type GithubContentsData = {
  content: { number?: number; title: string; body: string; login: string };
  comments: { body: string; login: string }[];
};

type RepoContext = { owner: string; repo: string };

// Helper functions for GitHub operations.

/**
 * Clone the target repository and checkout the appropriate branch based on event.
 * @param workspace - Filesystem path to clone into.
 * @param githubToken - GitHub token for authentication in clone URL.
 * @param repo - Repository owner and name.
 * @param context - GitHub Actions context containing payload data.
 * @param octokit - Authenticated Octokit client for API calls.
 * @param event - The AgentEvent indicating pull request or issue context.
 */

export async function cloneRepository(
  workspace: string,
  githubToken: string,
  repo: RepoContext,
  context: typeof github.context,
  octokit: Octokit,
  event: AgentEvent,
): Promise<void> {
  const cloneUrl = context.payload.repository?.clone_url;
  if (!cloneUrl) {
    throw new GitHubError('Repository clone URL not found');
  }

  // Determine branch to clone
  let branchToClone: string;
  if (
    event.type === 'pullRequestCommentCreated' ||
    event.type === 'pullRequestReviewCommentCreated'
  ) {
    // For PR comments, clone the PR's head branch
    const prNumber =
      event.type === 'pullRequestCommentCreated'
        ? event.github.issue.number
        : event.github.pull_request.number;
    try {
      const prData = await octokit.rest.pulls.get({
        ...repo,
        pull_number: prNumber,
      });
      branchToClone = prData.data.head.ref;
      core.info(`Cloning PR branch: ${branchToClone}`);
    } catch (e) {
      throw new GitHubError(`Could not get PR branch from API: ${e}`);
    }
  } else {
    // For issues or other events, clone the default branch
    branchToClone = context.payload.repository?.default_branch;
    if (!branchToClone) {
      throw new GitHubError('Default branch not found');
    }
    core.info(`Cloning default branch: ${branchToClone}`);
  }

  // Clone the repository
  core.info(
    `Cloning repository ${cloneUrl} branch ${branchToClone} into ${workspace}`,
  );
  try {
    // Ensure the workspace directory exists and is empty or doesn't exist
    await fs.rm(workspace, { recursive: true, force: true });
    await fs.mkdir(workspace, { recursive: true });

    // Use token for authentication with clone URL
    const authenticatedCloneUrl = cloneUrl.replace(
      'https://',
      `https://x-access-token:${githubToken}@`,
    );

    await execa(
      'git',
      [
        'clone',
        '--depth',
        '1',
        '--branch',
        branchToClone,
        authenticatedCloneUrl,
        '.',
      ],
      { cwd: workspace, stdio: 'inherit' },
    );
    core.info('Repository cloned successfully.');
  } catch (error) {
    throw new GitHubError(
      `Failed to clone repository: ${
        error instanceof Error ? error.message : error
      }`,
    );
  }
}

/**
 * Determine the normalized AgentEvent type from a raw GitHub webhook payload.
 * @param payload - The parsed GitHub event JSON.
 * @returns An AgentEvent discriminator object, or null if unsupported.
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
  // Check if payload.issue exists before accessing its properties
  if (
    payload.action === 'created' &&
    payload.issue &&
    payload.issue.pull_request &&
    payload.comment
  ) {
    return { type: 'pullRequestCommentCreated', github: payload };
  }
  // Check for Pull Request Review Comment (comment on a specific line of code)
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
 * Adds an 'eyes' reaction to the event source (issue or comment).
 * @param octokit
 * @param repo
 * @param event
 */

export async function addEyeReaction(
  octokit: Octokit,
  repo: RepoContext,
  event: GitHubEvent,
): Promise<void> {
  try {
    if (event.action === 'opened' && 'issue' in event) {
      // Add eye reaction to issue
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
      // Add eye reaction to comment on issue or PR conversation
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
      // Add eye reaction to PR review comment
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
 * Removes an 'eyes' reaction from the event source (issue or comment).
 * @param octokit
 * @param repo
 * @param event
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
 * Adds a 'thumbs up' reaction to the event source (issue or comment).
 * @param octokit
 * @param repo
 * @param event
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

/**
 * Extracts the relevant text (body, title or comment) from the event payload.
 * For issue-opened events:
 *   - If the body starts with `DEFAULT_TRIGGER_PHRASE`, returns the body and appends the title.
 *   - Else if the title starts with `DEFAULT_TRIGGER_PHRASE`, returns the title and appends the body.
 *   - Otherwise, returns the body.
 * Comment events remain unchanged.
 * @param event
 */

/**
 *
 * @param event
 */

/**
 *
 * @param event
 */

/**
 *
 * @param event
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
  // Ensure 'comment' exists before accessing 'body' for issue/PR comments
  if (event.action === 'created' && 'comment' in event && event.comment) {
    return event.comment.body;
  }
  return null;
}

/**
 * Creates a Pull Request with the changes and updates or creates a comment.
 * @param workspace Local repository path
 * @param octokit Octokit client
 * @param repo Repository context ({owner, repo})
 * @param event GitHub event for issues or comment
 * @param commitMessage Commit message and PR title
 * @param output AI output or details for comment body
 * @param progressCommentId Optional comment ID to update instead of creating a new one
 */

/**
 *
 * @param workspace
 * @param octokit
 * @param repo
 * @param event
 * @param commitMessage
 * @param output
 * @param progressCommentId
 */

/**
 *
 * @param workspace
 * @param octokit
 * @param repo
 * @param event
 * @param commitMessage
 * @param output
 * @param progressCommentId
 */

/**
 *
 * @param workspace
 * @param octokit
 * @param repo
 * @param event
 * @param commitMessage
 * @param output
 * @param progressCommentId
 */

export async function createPullRequest(
  workspace: string,
  octokit: Octokit,
  repo: RepoContext,
  event:
    | GitHubEventIssuesOpened
    | GitHubEventIssueCommentCreated
    | GitHubEventIssuesAssigned,
  commitMessage: string,
  output: string,
  progressCommentId?: number,
): Promise<void> {
  const issueNumber = event.issue.number;
  const branchType = getBranchType(commitMessage);
  let slug = slugify(commitMessage);
  if (slug.startsWith(`${branchType}-`)) {
    slug = slug.slice(branchType.length + 1);
  }
  let branchName = `codez-${branchType}-${issueNumber}-${slug}`;
  if (event.action === 'created') {
    branchName = `codez-${branchType}-${issueNumber}-${slug}-${event.comment.id}`;
  }
  const baseBranch = github.context.payload.repository?.default_branch; // Get default branch for base

  if (!baseBranch) {
    throw new GitHubError(
      'Could not determine the default branch to use as base for the PR.',
    );
  }

  try {
    // Set up Git and create a new branch
    core.info('Configuring Git user identity locally...');
    await execa('git', ['config', 'user.name', 'github-actions[bot]'], {
      cwd: workspace,
      stdio: 'inherit',
    });
    await execa(
      'git',
      ['config', 'user.email', 'github-actions[bot]@users.noreply.github.com'],
      { cwd: workspace, stdio: 'inherit' },
    );

    core.info(`Creating new branch: ${branchName}`);
    await execa('git', ['checkout', '-b', branchName], {
      cwd: workspace,
      stdio: 'inherit',
    });

    core.info('Adding changed files to Git...');
    await execa('git', ['add', '-A'], { cwd: workspace, stdio: 'inherit' });
    // Check for any changes before committing
    const statusResult = await execa('git', ['status', '--porcelain'], {
      cwd: workspace,
    });
    if (!statusResult.stdout.trim()) {
      core.info('No changes to commit. Skipping pull request creation.');
      const body = truncateOutput(output);
      if (progressCommentId) {
        await octokit.rest.issues.updateComment({
          ...repo,
          comment_id: progressCommentId,
          body,
        });
      } else {
        await octokit.rest.issues.createComment({
          ...repo,
          issue_number: issueNumber,
          body,
        });
      }
      return;
    }

    core.info('Committing changes...');
    await execa('git', ['commit', '-m', commitMessage], {
      cwd: workspace,
      stdio: 'inherit',
    });

    core.info(`Pushing changes to origin/${branchName}...`);
    await execa('git', ['push', 'origin', branchName, '--force'], {
      cwd: workspace,
      stdio: 'inherit',
    }); // Use force push for simplicity in case branch exists

    core.info('Creating Pull Request...');
    const pr = await octokit.rest.pulls.create({
      ...repo,
      title: `${commitMessage}`,
      head: branchName,
      base: baseBranch, // Use the default branch as base
      body: `Closes #${issueNumber}\n\nApplied changes based on Issue #${issueNumber}.\n\n${truncateOutput(
        output,
      )}`,
      maintainer_can_modify: true,
    });

    core.info(`Pull Request created: ${pr.data.html_url}`);

    const prCommentBody = `Created Pull Request: ${pr.data.html_url}`;
    if (progressCommentId) {
      await octokit.rest.issues.updateComment({
        ...repo,
        comment_id: progressCommentId,
        body: prCommentBody,
      });
    } else {
      await octokit.rest.issues.createComment({
        ...repo,
        issue_number: issueNumber,
        body: prCommentBody,
      });
    }

    // Link PR to issue in development panel via GraphQL
    try {
      const {
        repository: {
          issue: { id: issueId },
          pullRequest: { id: pullRequestId },
        },
      } = await octokit.graphql<{
        repository: { issue: { id: string }; pullRequest: { id: string } };
      }>(
        `
        query($owner: String!, $repo: String!, $issueNumber: Int!, $prNumber: Int!) {
          repository(owner: $owner, name: $repo) {
            issue(number: $issueNumber) { id }
            pullRequest(number: $prNumber) { id }
          }
        }
        `,
        {
          owner: repo.owner,
          repo: repo.repo,
          issueNumber,
          prNumber: pr.data.number,
        },
      );
      await octokit.graphql(
        `
        mutation($issueId: ID!, $pullRequestId: ID!) {
          linkPullRequest(input: { issueId: $issueId, pullRequestId: $pullRequestId }) {
            clientMutationId
          }
        }
        `,
        { issueId, pullRequestId },
      );
      core.info(
        `Linked PR #${pr.data.number} to Issue #${issueNumber} in development panel`,
      );
    } catch (linkError) {
      core.warning(
        `Failed to link PR to development panel: ${
          linkError instanceof Error ? linkError.message : linkError
        }`,
      );
    }

    // Update eye reaction to thumb up reaction on event source
    try {
      await removeEyeReaction(octokit, repo, event);
      await addThumbUpReaction(octokit, repo, event);
    } catch (reactionError) {
      core.warning(
        `Failed to update reaction on issue #${issueNumber}: ${
          reactionError instanceof Error ? reactionError.message : reactionError
        }`,
      );
    }
  } catch (error) {
    core.error(`Error creating Pull Request: ${toErrorMessage(error)}`);
    throw new GitHubError(
      `Failed to create Pull Request: ${toErrorMessage(error)}`,
    );
  }
}

/**
 * Commits and pushes changes to the existing PR branch.
 * @param workspace
 * @param octokit
 * @param repo
 * @param event
 * @param commitMessage
 * @param output
 * @param progressCommentId
 */

/**
 *
 * @param workspace
 * @param octokit
 * @param repo
 * @param event
 * @param commitMessage
 * @param output
 * @param progressCommentId
 */

/**
 *
 * @param workspace
 * @param octokit
 * @param repo
 * @param event
 * @param commitMessage
 * @param output
 * @param progressCommentId
 */

/**
 *
 * @param workspace
 * @param octokit
 * @param repo
 * @param event
 * @param commitMessage
 * @param output
 * @param progressCommentId
 */
export async function commitAndPush(
  workspace: string,
  octokit: Octokit,
  repo: RepoContext,
  event:
    | GitHubEventPullRequestCommentCreated
    | GitHubEventPullRequestReviewCommentCreated,
  commitMessage: string,
  output: string,

  /** Optional comment ID to update instead of creating a new one */

  progressCommentId?: number,
): Promise<void> {
  // Get PR number from the event - different location based on event type
  const prNumber =
    'issue' in event ? event.issue.number : event.pull_request.number;

  try {
    // Get current branch name from the PR context
    let currentBranch: string;
    try {
      const prData = await octokit.rest.pulls.get({
        ...repo,
        pull_number: prNumber,
      });
      currentBranch = prData.data.head.ref;
      core.info(`Checked out PR branch: ${currentBranch}`);
      // Ensure we are on the correct branch
      await execa('git', ['checkout', currentBranch], {
        cwd: workspace,
        stdio: 'inherit',
      });
    } catch (e) {
      // Fallback if PR data fetch fails (should ideally not happen in this context)
      core.warning(
        `Could not get PR branch from API, attempting to use current branch: ${e}`,
      );
      const branchResult = await execa(
        'git',
        ['rev-parse', '--abbrev-ref', 'HEAD'],
        { cwd: workspace },
      );
      currentBranch = branchResult.stdout.trim();
      core.info(`Using current branch from git: ${currentBranch}`);
      // Ensure we are on the correct branch if the checkout happened before the action ran
      await execa('git', ['checkout', currentBranch], {
        cwd: workspace,
        stdio: 'inherit',
      });
    }

    core.info('Configuring Git user identity locally...');
    await execa('git', ['config', 'user.name', 'github-actions[bot]'], {
      cwd: workspace,
      stdio: 'inherit',
    });
    await execa(
      'git',
      ['config', 'user.email', 'github-actions[bot]@users.noreply.github.com'],
      { cwd: workspace, stdio: 'inherit' },
    );

    core.info('Adding changed files to Git...');
    // Add all changed files (including deleted ones)
    await execa('git', ['add', '-A'], { cwd: workspace, stdio: 'inherit' });

    // Check if there are changes to commit
    const statusResult = await execa('git', ['status', '--porcelain'], {
      cwd: workspace,
    });
    if (!statusResult.stdout.trim()) {
      core.info('No changes to commit.');
      if (progressCommentId) {
        if ('issue' in event) {
          await octokit.rest.issues.updateComment({
            ...repo,
            comment_id: progressCommentId,
            body: truncateOutput(output),
          });
        } else if ('pull_request' in event && 'comment' in event) {
          await octokit.rest.pulls.updateReviewComment({
            ...repo,
            comment_id: progressCommentId,
            body: truncateOutput(output),
          });
        } else {
          await postComment(octokit, repo, event, output);
        }
      } else {
        await postComment(octokit, repo, event, output);
      }
      return; // Exit early if no changes
    }

    core.info('Committing changes...');
    await execa('git', ['commit', '-m', commitMessage], {
      cwd: workspace,
      stdio: 'inherit',
    });

    core.info(`Pushing changes to origin/${currentBranch}...`);
    await execa('git', ['push', 'origin', currentBranch], {
      cwd: workspace,
      stdio: 'inherit',
    });

    core.info('Changes committed and pushed.');

    // Update existing progress comment or post a new comment confirming the changes
    if (progressCommentId) {
      if ('issue' in event) {
        await octokit.rest.issues.updateComment({
          ...repo,
          comment_id: progressCommentId,
          body: truncateOutput(output),
        });
      } else if ('pull_request' in event && 'comment' in event) {
        await octokit.rest.pulls.updateReviewComment({
          ...repo,
          comment_id: progressCommentId,
          body: truncateOutput(output),
        });
      } else {
        await postComment(octokit, repo, event, output);
      }
    } else {
      await postComment(octokit, repo, event, output);
    }
  } catch (error) {
    core.error(
      `Error committing and pushing changes: ${toErrorMessage(error)}`,
    );
    // Attempt to post an error comment
    try {
      await postComment(
        octokit,
        repo,
        event,
        `Failed to apply changes to this PR: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } catch (commentError) {
      core.error(
        `Failed to post error comment: ${toErrorMessage(commentError)}`,
      );
    }
    throw new GitHubError(
      `Failed to commit and push changes: ${toErrorMessage(error)}`,
    );
  }
}

/**
 * Posts a comment to the issue or PR.
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
export async function postComment(
  octokit: Octokit,
  repo: RepoContext,
  event: GitHubEvent,
  body: string,
): Promise<void> {
  try {
    if ('issue' in event) {
      // For regular issues and PR conversation comments
      const issueNumber = event.issue.number;
      await octokit.rest.issues.createComment({
        ...repo,
        issue_number: issueNumber,
        body: truncateOutput(body),
      });
      core.info(`Comment posted to Issue/PR #${issueNumber}`);
    } else if ('pull_request' in event && 'comment' in event) {
      // For PR review comments only when a comment object is present
      const prNumber = event.pull_request.number;
      const commentId = event.comment.id;
      const inReplyTo = event.comment.in_reply_to_id;

      try {
        await octokit.rest.pulls.createReplyForReviewComment({
          ...repo,
          pull_number: prNumber,
          comment_id: inReplyTo ?? commentId, // Use the original comment ID if no reply
          body: truncateOutput(body),
        });
        core.info(
          `Comment posted to PR #${prNumber} Reply to comment #${commentId}`,
        );
      } catch (commentError) {
        // If we can't determine if it's a top-level comment, fall back to creating a regular PR comment
        core.warning(
          `Failed to check if comment is top-level: ${
            commentError instanceof Error ? commentError.message : commentError
          }`,
        );
        core.info(
          `Falling back to creating a regular PR comment instead of a reply`,
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
    // Don't re-throw here, as posting a comment failure might not be critical
  }
}

/**
 * Create or update a comment: if commentId is provided, update existing comment,
 * otherwise create a new comment.
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

/**
 *
 * @param octokit
 * @param repo
 * @param event
 * @param userPrompt
 * @param includeFullHistory
 */

/**
 *
 * @param octokit
 * @param repo
 * @param event
 * @param userPrompt
 * @param includeFullHistory
 */

/**
 *
 * @param octokit
 * @param repo
 * @param event
 * @param userPrompt
 * @param includeFullHistory
 */

/**
 *
 */
export async function generatePrompt(
  octokit: Octokit,
  repo: RepoContext,
  event: AgentEvent,
  userPrompt: string,
  includeFullHistory: boolean,
): Promise<string> {
  const contents = await getContentsData(octokit, repo, event);

  // Exclude progress comments from context
  const filteredComments = contents.comments.filter(
    (comment) => !comment.body.trim().startsWith('**🚀 Codez Progress**'),
  );

  let prFiles: string[] = [];
  let contextInfo = '';

  if (
    event.type === 'pullRequestCommentCreated' ||
    event.type === 'pullRequestReviewCommentCreated'
  ) {
    // Get the changed files in the PR
    prFiles = await getChangedFiles(octokit, repo, event);
  }

  // For PR review comments, add information about the file path and line
  if (event.type === 'pullRequestReviewCommentCreated') {
    const comment = event.github.comment;
    contextInfo = `Comment on file: ${comment.path}`;
    if (comment.line) {
      contextInfo += `, line: ${comment.line}`;
    }
  }

  let historyPrompt = '';
  const formatter = includeFullHistory
    ? genFullContentsString
    : genContentsString;
  historyPrompt += formatter(contents.content);
  for (const comment of filteredComments) {
    historyPrompt += formatter(comment);
  }

  let prompt = '';
  if (event.type === 'issuesOpened' || event.type === 'issueCommentCreated') {
    prompt += `${promptBuilderConfig.titleLabel}\n${contents.content.title}\n\n`;
  }
  if (historyPrompt) {
    prompt += `${promptBuilderConfig.historyLabel}\n${historyPrompt}\n\n`;
  }
  if (contextInfo) {
    prompt += `${promptBuilderConfig.contextLabel}\n${contextInfo}\n\n`;
  }
  if (prFiles.length > 0) {
    prompt += `${promptBuilderConfig.changedFilesLabel}\n${prFiles.join(
      '\n',
    )}\n\n`;
  }

  if (prompt) {
    prompt += `${promptBuilderConfig.promptSeparator}\n\n${userPrompt}`;
  } else {
    prompt = userPrompt;
  }

  return prompt;
}

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
export async function getChangedFiles(
  octokit: Octokit,
  repo: RepoContext,
  event: AgentEvent,
): Promise<string[]> {
  let prNumber: number;

  if (event.type === 'pullRequestCommentCreated') {
    prNumber = event.github.issue.number;
  } else if (event.type === 'pullRequestReviewCommentCreated') {
    prNumber = event.github.pull_request.number;
  } else {
    throw new GitHubError(
      `Cannot get changed files for event type: ${event.type}`,
    );
  }

  const prFilesResponse = await octokit.rest.pulls.listFiles({
    ...repo,
    pull_number: prNumber,
  });
  return prFilesResponse.data.map((file) => file.filename);
}

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
export async function getContentsData(
  octokit: Octokit,
  repo: RepoContext,
  event: AgentEvent,
): Promise<GithubContentsData> {
  if (event.type === 'issuesOpened' || event.type === 'issueCommentCreated') {
    return await getIssueData(octokit, repo, event.github.issue.number);
  } else if (event.type === 'pullRequestCommentCreated') {
    return await getPullRequestData(octokit, repo, event.github.issue.number);
  } else if (event.type === 'pullRequestReviewCommentCreated') {
    return await getPullRequestReviewCommentsData(
      octokit,
      repo,
      event.github.pull_request.number,
      event.github.comment.in_reply_to_id ?? event.github.comment.id,
    );
  }
  throw new GitHubError('Invalid event type for data retrieval');
}

/**
 * Retrieves the body and all comment bodies for a specific issue.
 * @param octokit
 * @param repo
 * @param issueNumber
 */

/**
 *
 * @param octokit
 * @param repo
 * @param issueNumber
 */

/**
 *
 * @param octokit
 * @param repo
 * @param issueNumber
 */

/**
 *
 * @param octokit
 * @param repo
 * @param issueNumber
 */
async function getIssueData(
  octokit: Octokit,
  repo: RepoContext,
  issueNumber: number,
): Promise<GithubContentsData> {
  core.info(`Fetching data for issue #${issueNumber}...`);
  try {
    // Fetch issue and its comments via GraphQL in a single request
    core.info(`Fetching data for issue #${issueNumber} via GraphQL...`);
    const query = `
      query($owner: String!, $repo: String!, $issueNumber: Int!) {
        repository(owner: $owner, name: $repo) {
          issue(number: $issueNumber) {
            number
            title
            body
            author { login }
            comments(first: 100) {
              nodes { body author { login } }
            }
          }
        }
      }
    `;
    const resp = await octokit.graphql<{
      repository: {
        issue: {
          number: number;
          title: string;
          body: string | null;
          author: { login: string };
          comments: {
            nodes: { body: string | null; author: { login: string } }[];
          };
        };
      };
    }>(query, {
      owner: repo.owner,
      repo: repo.repo,
      issueNumber,
    });
    const issue = resp.repository.issue;
    const content = {
      number: issue.number,
      title: issue.title,
      body: issue.body ?? '',
      login: issue.author.login,
    };
    const comments = issue.comments.nodes.map((c) => ({
      body: c.body ?? '',
      login: c.author.login,
    }));
    core.info(`Fetched ${comments.length} comments for issue #${issueNumber}.`);
    return { content, comments };
  } catch (error) {
    core.error(
      `Failed to get data for issue #${issueNumber}: ${toErrorMessage(error)}`,
    );
    throw new GitHubError(
      `Could not retrieve data for issue #${issueNumber}: ${toErrorMessage(
        error,
      )}`,
    );
  }
}

/**
 * Retrieves the body and all review comment bodies for a specific pull request.
 * Note: PR review comments are fetched via the pulls API endpoint.
 * @param octokit
 * @param repo
 * @param pullNumber
 * @param targetCommentId
 */

/**
 *
 * @param octokit
 * @param repo
 * @param pullNumber
 * @param targetCommentId
 */

/**
 *
 * @param octokit
 * @param repo
 * @param pullNumber
 * @param targetCommentId
 */

/**
 *
 * @param octokit
 * @param repo
 * @param pullNumber
 * @param targetCommentId
 */
async function getPullRequestReviewCommentsData(
  octokit: Octokit,
  repo: RepoContext,
  pullNumber: number,
  targetCommentId: number,
): Promise<GithubContentsData> {
  core.info(`Fetching data for pull request review comments #${pullNumber}...`);
  try {
    // Get PR body
    const prResponse = await octokit.rest.pulls.get({
      ...repo,
      pull_number: pullNumber,
    });
    const content = {
      number: prResponse.data.number,
      title: prResponse.data.title,
      body: prResponse.data.body ?? '',
      login: prResponse.data.user?.login ?? 'anonymous',
    };

    // Get PR review comments
    const commentsData = await octokit.paginate(
      octokit.rest.pulls.listReviewComments,
      {
        ...repo,
        pull_number: pullNumber,
        per_page: 100, // Fetch 100 per page for efficiency
      },
    );

    // Filter comments to include only those related to the target comment ID
    const comments = commentsData
      .filter(
        (comment) =>
          comment.id === targetCommentId ||
          comment.in_reply_to_id === targetCommentId,
      )
      .map((comment) => ({
        body: comment.body ?? '',
        login: comment.user?.login ?? 'anonymous',
      }));
    core.info(
      `Fetched ${commentsData.length} review comments for PR #${pullNumber}.`,
    );

    return { content, comments };
  } catch (error) {
    core.error(
      `Failed to get data for pull request review comments #${pullNumber}: ${toErrorMessage(
        error,
      )}`,
    );
    throw new GitHubError(
      `Could not retrieve data for pull request review comments #${pullNumber}: ${toErrorMessage(
        error,
      )}`,
    );
  }
}

/**
 * Retrieves the body and all comment bodies for a specific pull request.
 * Note: PR comments are fetched via the issues API endpoint.
 * @param octokit
 * @param repo
 * @param pullNumber
 */

/**
 *
 * @param octokit
 * @param repo
 * @param pullNumber
 */

/**
 *
 * @param octokit
 * @param repo
 * @param pullNumber
 */

/**
 *
 * @param octokit
 * @param repo
 * @param pullNumber
 */
async function getPullRequestData(
  octokit: Octokit,
  repo: RepoContext,
  pullNumber: number,
): Promise<GithubContentsData> {
  core.info(`Fetching data for pull request #${pullNumber} via GraphQL...`);
  try {
    // Fetch PR and its issue‐thread comments via GraphQL
    const query = `
      query($owner: String!, $repo: String!, $prNumber: Int!) {
        repository(owner: $owner, name: $repo) {
          pullRequest(number: $prNumber) {
            number
            title
            body
            author { login }
            comments(first: 100) {
              nodes { body author { login } }
            }
          }
        }
      }
    `;
    const resp = await octokit.graphql<{
      repository: {
        pullRequest: {
          number: number;
          title: string;
          body: string | null;
          author: { login: string };
          comments: {
            nodes: { body: string | null; author: { login: string } }[];
          };
        };
      };
    }>(query, {
      owner: repo.owner,
      repo: repo.repo,
      prNumber: pullNumber,
    });
    const pr = resp.repository.pullRequest;
    const content = {
      number: pr.number,
      title: pr.title,
      body: pr.body ?? '',
      login: pr.author.login,
    };
    const comments = pr.comments.nodes.map((c) => ({
      body: c.body ?? '',
      login: c.author.login,
    }));
    core.info(`Fetched ${comments.length} comments for PR #${pullNumber}.`);
    return { content, comments };
  } catch (error) {
    core.error(
      `Failed to get data for pull request #${pullNumber}: ${toErrorMessage(
        error,
      )}`,
    );
    throw new GitHubError(
      `Could not retrieve data for pull request #${pullNumber}: ${toErrorMessage(
        error,
      )}`,
    );
  }
}

// Truncate the output if it exceeds 60000 characters
// GitHub API has a limit of 65536 characters for the body of a PR
/**
 *
 * @param output
 */

/**
 *
 * @param output
 */

/**
 *
 * @param output
 */

/**
 *
 */
function truncateOutput(output: string): string {
  if (output.length > 60000) {
    core.warning(`Output exceeds 60000 characters, truncating...`);
    return output.substring(0, 60000);
  }
  return output;
}
