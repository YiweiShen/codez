import * as core from '@actions/core';
import * as github from '@actions/github';
import { execaSync } from 'execa';
import * as fs from 'fs';

// --- Type Definitions ---

export type AgentEvent =
  | { type: 'issuesOpened', github: GitHubEventIssuesOpened }
  | { type: 'issueCommentCreated', github: GitHubEventIssueCommentCreated }
  | { type: 'pullRequestCommentCreated', github: GitHubEventPullRequestCommentCreated }
  ;

export type GitHubEvent =
  | GitHubEventIssuesOpened
  | GitHubEventIssueCommentCreated
  | GitHubEventPullRequestCommentCreated;

export type GitHubEventIssuesOpened = {
  action: 'opened';
  issue: GitHubIssue;
}

export type GitHubEventIssueCommentCreated = {
  action: 'created';
  issue: GitHubIssue;
  comment: GithubComment;
}

export type GitHubEventPullRequestCommentCreated = {
  action: 'created';
  issue: GitHubPullRequest;
  comment: GithubComment;
}

export type GithubComment = {
  id: number;
  body: string;
}

export type GitHubIssue = {
  number: number;
  title: string;
  body: string;
  pull_request: null;
}

export type GitHubPullRequest = {
  number: number;
  title: string;
  body: string;
  pull_request: {
    url: string;
  };
}

type Octokit = ReturnType<typeof github.getOctokit>;
type RepoContext = { owner: string; repo: string };

// --- Functions ---

/**
 * Clones the repository based on the event type.
 */
export async function cloneRepository(
  workspace: string,
  githubToken: string,
  repo: RepoContext,
  context: typeof github.context,
  octokit: Octokit,
  event: AgentEvent
): Promise<void> {
  const cloneUrl = context.payload.repository?.clone_url;
  if (!cloneUrl) {
    throw new Error('Repository clone URL not found');
  }

  // Determine branch to clone
  let branchToClone: string;
  if (event.type === 'pullRequestCommentCreated') {
    // For PR comments, clone the PR's head branch
    const prNumber = event.github.issue.number;
    try {
      const prData = await octokit.rest.pulls.get({ ...repo, pull_number: prNumber });
      branchToClone = prData.data.head.ref;
      core.info(`Cloning PR branch: ${branchToClone}`);
    } catch (e) {
      throw new Error(`Could not get PR branch from API: ${e}`);
    }
  } else {
    // For issues or other events, clone the default branch
    branchToClone = context.payload.repository?.default_branch;
    if (!branchToClone) {
      throw new Error('Default branch not found');
    }
    core.info(`Cloning default branch: ${branchToClone}`);
  }

  // Clone the repository
  core.info(`Cloning repository ${cloneUrl} branch ${branchToClone} into ${workspace}`);
  try {
    // Ensure the workspace directory exists and is empty or doesn't exist
    if (fs.existsSync(workspace)) {
      fs.rmSync(workspace, { recursive: true, force: true });
    }
    fs.mkdirSync(workspace, { recursive: true });

    // Use token for authentication with clone URL
    const authenticatedCloneUrl = cloneUrl.replace('https://', `https://x-access-token:${githubToken}@`);

    execaSync('git', ['clone', '--depth', '1', '--branch', branchToClone, authenticatedCloneUrl, '.'], { cwd: workspace, stdio: 'inherit' });
    core.info('Repository cloned successfully.');
  } catch (error) {
    throw new Error(`Failed to clone repository: ${error instanceof Error ? error.message : error}`);
  }
}

/**
 * Determines the type of GitHub event.
 */
export function getEventType(payload: any): AgentEvent | null {
  if (payload.action === 'opened' && payload.issue && !payload.issue.pull_request) {
    return { type: 'issuesOpened', github: payload };
  }
  if (payload.action === 'created' && payload.issue && !payload.issue.pull_request && payload.comment) {
    return { type: 'issueCommentCreated', github: payload };
  }
  // Check if payload.issue exists before accessing its properties
  if (payload.action === 'created' && payload.issue && payload.issue.pull_request && payload.comment) {
    return { type: 'pullRequestCommentCreated', github: payload };
  }
  return null;
}


/**
 * Adds an 'eyes' reaction to the event source (issue or comment).
 */
export async function addEyeReaction(
  octokit: Octokit,
  repo: RepoContext,
  event: GitHubEvent
): Promise<void> {
  try {
    if (event.action === 'opened' && 'issue' in event) {
      // Add eye reaction to issue
      await octokit.rest.reactions.createForIssue({
        ...repo,
        issue_number: event.issue.number,
        content: 'eyes'
      });
      core.info(`Added eye reaction to issue #${event.issue.number}`);
    } else if (event.action === 'created' && 'comment' in event) {
      // Add eye reaction to comment
      await octokit.rest.reactions.createForIssueComment({
        ...repo,
        comment_id: event.comment.id,
        content: 'eyes'
      });
      core.info(`Added eye reaction to comment on issue/PR #${event.issue.number}`);
    }
  } catch (error) {
    core.warning(`Failed to add reaction: ${error instanceof Error ? error.message : error}`);
  }
}

/**
 * Extracts the relevant text (body or comment) from the event payload.
 */
export function extractText(event: GitHubEvent): string | null {
    if (event.action === 'opened' && 'issue' in event) {
        return event.issue.body;
    }
    // Ensure 'comment' exists before accessing 'body'
    if (event.action === 'created' && 'comment' in event && event.comment) {
        return event.comment.body;
    }
    return null;
}


/**
 * Creates a Pull Request with the changes.
 */
export async function createPullRequest(
  workspace: string,
  octokit: Octokit,
  repo: RepoContext,
  event: GitHubEventIssuesOpened | GitHubEventIssueCommentCreated,
  commitMessage: string,
  claudeOutput: string
): Promise<void> {
  const issueNumber = event.issue.number;
  const branchName = `claude-changes-${issueNumber}`;
  const baseBranch = github.context.payload.repository?.default_branch; // Get default branch for base

  if (!baseBranch) {
      throw new Error('Could not determine the default branch to use as base for the PR.');
  }

  try {
    // Set up Git and create a new branch
    core.info('Configuring Git user identity locally...');
    execaSync('git', ['config', 'user.name', 'github-actions[bot]'], { cwd: workspace, stdio: 'inherit' });
    execaSync('git', ['config', 'user.email', 'github-actions[bot]@users.noreply.github.com'], { cwd: workspace, stdio: 'inherit' });

    core.info(`Creating new branch: ${branchName}`);
    execaSync('git', ['checkout', '-b', branchName], { cwd: workspace, stdio: 'inherit' });

    core.info('Adding changed files to Git...');
    execaSync('git', ['add', '-A'], { cwd: workspace, stdio: 'inherit' });

    core.info('Committing changes...');
    execaSync('git', ['commit', '-m', commitMessage], { cwd: workspace, stdio: 'inherit' });

    core.info(`Pushing changes to origin/${branchName}...`);
    execaSync('git', ['push', 'origin', branchName, '--force'], { cwd: workspace, stdio: 'inherit' }); // Use force push for simplicity in case branch exists

    core.info('Creating Pull Request...');
    const pr = await octokit.rest.pulls.create({
      ...repo,
      title: `Claude changes for #${issueNumber}: ${commitMessage}`,
      head: branchName,
      base: baseBranch, // Use the default branch as base
      body: `Applied changes based on Issue #${issueNumber}.\n\n## Claude Output\n${claudeOutput}`,
      maintainer_can_modify: true,
    });

    core.info(`Pull Request created: ${pr.data.html_url}`);

    // Optionally, post a comment linking to the PR in the original issue
    await octokit.rest.issues.createComment({
      ...repo,
      issue_number: issueNumber,
      body: `Created Pull Request with Claude's changes: ${pr.data.html_url}`,
    });

  } catch (error) {
    core.error(`Error creating Pull Request: ${error}`);
    throw new Error(`Failed to create Pull Request: ${error instanceof Error ? error.message : error}`);
  }
}

/**
 * Commits and pushes changes to the existing PR branch.
 */
export async function commitAndPush(
  workspace: string,
  octokit: Octokit,
  repo: RepoContext,
  event: GitHubEventPullRequestCommentCreated,
  commitMessage: string,
  claudeOutput: string
): Promise<void> {
  const prNumber = event.issue.number; // In PR comments, issue.number is the PR number

  try {
    // Get current branch name from the PR context
    let currentBranch: string;
    try {
      const prData = await octokit.rest.pulls.get({ ...repo, pull_number: prNumber });
      currentBranch = prData.data.head.ref;
      core.info(`Checked out PR branch: ${currentBranch}`);
      // Ensure we are on the correct branch
      execaSync('git', ['checkout', currentBranch], { cwd: workspace, stdio: 'inherit' });
    } catch (e) {
      // Fallback if PR data fetch fails (should ideally not happen in this context)
      core.warning(`Could not get PR branch from API, attempting to use current branch: ${e}`);
      const branchResult = execaSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: workspace });
      currentBranch = branchResult.stdout.trim();
      core.info(`Using current branch from git: ${currentBranch}`);
       // Ensure we are on the correct branch if the checkout happened before the action ran
      execaSync('git', ['checkout', currentBranch], { cwd: workspace, stdio: 'inherit' });
    }

    core.info('Configuring Git user identity locally...');
    execaSync('git', ['config', 'user.name', 'github-actions[bot]'], { cwd: workspace, stdio: 'inherit' });
    execaSync('git', ['config', 'user.email', 'github-actions[bot]@users.noreply.github.com'], { cwd: workspace, stdio: 'inherit' });

    core.info('Adding changed files to Git...');
    // Add all changed files (including deleted ones)
    execaSync('git', ['add', '-A'], { cwd: workspace, stdio: 'inherit' });

    // Check if there are changes to commit
    const statusResult = execaSync('git', ['status', '--porcelain'], { cwd: workspace });
    if (!statusResult.stdout.trim()) {
        core.info('No changes to commit.');
        // Post a comment indicating no changes were made or Claude's output if relevant
        await postComment(octokit, repo, event, `Claude processed the request, but no code changes were detected.\n\n## Claude Output\n${claudeOutput}`);
        return; // Exit early if no changes
    }


    core.info('Committing changes...');
    execaSync('git', ['commit', '-m', commitMessage], { cwd: workspace, stdio: 'inherit' });

    core.info(`Pushing changes to origin/${currentBranch}...`);
    execaSync('git', ['push', 'origin', currentBranch], { cwd: workspace, stdio: 'inherit' });

    core.info('Changes committed and pushed.');

    // Post a comment confirming the changes
    await postComment(octokit, repo, event, `Applied changes to this PR based on your comment.\n\n## Claude Output\n${claudeOutput}`);

  } catch (error) {
    core.error(`Error committing and pushing changes: ${error}`);
    // Attempt to post an error comment
     try {
        await postComment(octokit, repo, event, `Failed to apply changes to this PR: ${error instanceof Error ? error.message : String(error)}`);
    } catch (commentError) {
        core.error(`Failed to post error comment: ${commentError}`);
    }
    throw new Error(`Failed to commit and push changes: ${error instanceof Error ? error.message : error}`);
  }
}

/**
 * Posts a comment to the issue or PR.
 */
export async function postComment(
  octokit: Octokit,
  repo: RepoContext,
  event: GitHubEvent,
  body: string
): Promise<void> {
  const issueNumber = event.issue.number;

  try {
      await octokit.rest.issues.createComment({
        ...repo,
        issue_number: issueNumber,
        body: body,
      });
      core.info(`Comment posted to Issue/PR #${issueNumber}`);
  } catch (error) {
      core.error(`Failed to post comment to Issue/PR #${issueNumber}: ${error}`);
      // Don't re-throw here, as posting a comment failure might not be critical
  }
}
