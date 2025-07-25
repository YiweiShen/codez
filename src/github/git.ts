/**
 * Git operations for cloning repositories, creating pull requests, and pushing commits.
 */
import { promises as fs } from 'fs';
import * as core from '@actions/core';
import * as github from '@actions/github';
import { execa } from 'execa';
import type { Octokit } from 'octokit';

import type { RepoContext, AgentEvent, GitHubEvent } from './types';
import { GitHubError } from '../utils/errors';
import { getBranchType, slugify, truncateOutput } from './utils';
import { removeEyeReaction, addThumbUpReaction } from './reactions';
import { postComment } from './comments';
import { toErrorMessage } from '../utils/error';

// Helper to run git commands with inherited stdio.
async function runGit(args: string[], cwd: string) {
  return execa('git', args, { cwd, stdio: 'inherit' });
}

// Configure git user identity for GitHub Actions bot.
async function configureGitUser(workspace: string): Promise<void> {
  await runGit(['config', 'user.name', 'github-actions[bot]'], workspace);
  await runGit(
    ['config', 'user.email', 'github-actions[bot]@users.noreply.github.com'],
    workspace,
  );
}

// Stage all changes and return whether there are any to commit.
async function hasChanges(workspace: string): Promise<boolean> {
  await runGit(['add', '-A'], workspace);
  const status = await execa('git', ['status', '--porcelain'], {
    cwd: workspace,
  });
  return Boolean(status.stdout.trim());
}

// Determine which branch to clone based on the triggering event.
async function determineBranchToClone(
  event: AgentEvent,
  repo: RepoContext,
  octokit: Octokit,
  defaultBranch: string,
): Promise<string> {
  if (
    event.type === 'pullRequestCommentCreated' ||
    event.type === 'pullRequestReviewCommentCreated'
  ) {
    const prNumber =
      event.type === 'pullRequestCommentCreated'
        ? event.github.issue.number
        : event.github.pull_request.number;
    const pr = await octokit.rest.pulls.get({ ...repo, pull_number: prNumber });
    core.info(`Cloning PR branch: ${pr.data.head.ref}`);
    return pr.data.head.ref;
  }
  core.info(`Cloning default branch: ${defaultBranch}`);
  return defaultBranch;
}

/**
 * Clone the target repository and checkout the appropriate branch based on the given event.
 * @param workspace - Directory path where the repository will be cloned.
 * @param githubToken - GitHub token used for authenticated clone.
 * @param repo - Repository owner and name context.
 * @param context - GitHub context payload with repository information.
 * @param octokit - Authenticated Octokit client.
 * @param event - Normalized AgentEvent triggering the clone operation.
 * @returns Promise that resolves when the repository is cloned and checked out.
 */
export async function cloneRepository(
  workspace: string,
  githubToken: string,
  repo: RepoContext,
  context: typeof github.context,
  octokit: Octokit,
  event: AgentEvent,
): Promise<void> {
  const { repository } = context.payload;
  if (!repository?.clone_url || !repository.default_branch) {
    throw new GitHubError('Repository information not found');
  }
  const { clone_url: cloneUrl, default_branch: defaultBranch } = repository;
  const branchToClone = await determineBranchToClone(
    event,
    repo,
    octokit,
    defaultBranch,
  );
  core.info(
    `Cloning repository ${cloneUrl} branch ${branchToClone} into ${workspace}`,
  );
  try {
    await fs.rm(workspace, { recursive: true, force: true });
    await fs.mkdir(workspace, { recursive: true });
    const authenticatedCloneUrl = cloneUrl.replace(
      'https://',
      `https://x-access-token:${githubToken}@`,
    );
    await runGit(
      [
        'clone',
        '--depth',
        '1',
        '--branch',
        branchToClone,
        authenticatedCloneUrl,
        '.',
      ],
      workspace,
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
 * Creates a pull request with committed changes and updates or creates a comment for progress.
 * @param workspace - Directory path of the local repository.
 * @param octokit - Authenticated Octokit client.
 * @param repo - Repository owner and name context.
 * @param event - GitHubEvent that triggered the pull request creation.
 * @param commitMessage - Commit message to use for the changes.
 * @param output - Text content for the pull request body.
 * @param progressCommentId - Optional ID of a progress comment to update.
 * @returns Promise that resolves when the pull request is created and comment updated.
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
  const baseBranch = github.context.payload.repository?.default_branch;
  if (!baseBranch) {
    throw new GitHubError(
      'Could not determine the default branch to use as base for the PR.',
    );
  }
  try {
    await configureGitUser(workspace);
    core.info(`Creating new branch: ${branchName}`);
    await runGit(['checkout', '-b', branchName], workspace);
    core.info('Staging changes...');
    if (!(await hasChanges(workspace))) {
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
    await runGit(['commit', '-m', commitMessage], workspace);
    core.info(`Pushing changes to origin/${branchName}...`);
    await runGit(['push', 'origin', branchName, '--force'], workspace);
    core.info('Creating Pull Request...');
    const pr = await octokit.rest.pulls.create({
      ...repo,
      title: `${commitMessage}`,
      head: branchName,
      base: baseBranch,
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
          linkPullRequest(input: { issueId: $issueId, pullRequestId: $pullRequestId }) { clientMutationId }
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
 * Commits and pushes changes to the existing pull request branch and updates comments.
 * @param workspace - Directory path of the local repository.
 * @param octokit - Authenticated Octokit client.
 * @param repo - Repository owner and name context.
 * @param event - GitHubEvent that triggered the commit and push operation.
 * @param commitMessage - Commit message to use.
 * @param output - Text content for updating comments with the latest output.
 * @param progressCommentId - Optional ID of a progress comment to update.
 * @returns Promise that resolves when commit and push operations complete.
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
  progressCommentId?: number,
): Promise<void> {
  const prNumber =
    'issue' in event ? event.issue.number : event.pull_request.number;
  try {
    let currentBranch: string;
    try {
      const prData = await octokit.rest.pulls.get({
        ...repo,
        pull_number: prNumber,
      });
      currentBranch = prData.data.head.ref;
      core.info(`Checked out PR branch: ${currentBranch}`);
      await runGit(['checkout', currentBranch], workspace);
    } catch (e) {
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
      await runGit(['checkout', currentBranch], workspace);
    }
    await configureGitUser(workspace);
    core.info('Staging changes...');
    if (!(await hasChanges(workspace))) {
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
      return;
    }
    core.info('Committing changes...');
    await runGit(['commit', '-m', commitMessage], workspace);
    core.info(`Pushing changes to origin/${currentBranch}...`);
    await runGit(['push', 'origin', currentBranch], workspace);
    core.info('Changes committed and pushed.');
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
