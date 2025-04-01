import { execa, execaSync } from 'execa';
import * as core from '@actions/core';
import * as github from '@actions/github';
import * as fs from 'fs';

type AgentEvent = 
  | { type: 'issuesOpened', github: GitHubEventIssuesOpened }
  | { type: 'issueCommentCreated', github: GitHubEventIssueCommentCreated }
  | { type: 'pullRequestCommentCreated', github: GitHubEventPullRequestCommentCreated }
;

// Definition of event types
type GitHubEvent = 
  | GitHubEventIssuesOpened
  | GitHubEventIssueCommentCreated
  | GitHubEventPullRequestCommentCreated;

type GitHubEventIssuesOpened = {
  action: 'opened';
  issue: GitHubIssue;
}

type GitHubEventIssueCommentCreated = {
  action: 'created';
  issue: GitHubIssue;
  comment: GithubComment;
}

type GitHubEventPullRequestCommentCreated = {
  action: 'created';
  issue: GitHubPullRequest;
  comment: GithubComment;
}

type GithubComment = {
  body: string;
}

type GitHubIssue = {
  number: number;
  title: string;
  body: string;
  pull_request: null;
}

type GitHubPullRequest = {
  number: number;
  title: string;
  body: string;
  pull_request: {
    url: string;
  };
}

async function run(): Promise<void> {
  try {
    // Get GitHub Token and Anthropic API Key
    const githubToken = core.getInput('github-token', { required: true });
    const anthropicApiKey = core.getInput('anthropic-api-key', { required: true });
    const eventPath = core.getInput('event-path', { required: true });
    const workspace = core.getInput('workspace', { required: true });
    const timeoutSecond = core.getInput('timeout') !== '' ? parseInt(core.getInput('timeout')) : 300;

    if(anthropicApiKey === '') {
      core.setFailed('Anthropic API Key is required');
      return;
    }
    
    // Initialize GitHub Client
    const octokit = github.getOctokit(githubToken);
    const context = github.context;
    const repo = context.repo;
    
    // Load event data
    const eventPayload = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
    
    console.log(eventPayload);
    // Determine event type
    const event = getEventType(eventPayload);
    if (!event) {
      core.info('Unsupported event type');
      return;
    }
    
    // Check if text contains the /claude command
    const text = extractText(event.github);
    if (!text || !text.includes('/claude')) {
      core.info('/claude command not found');
      return;
    }
    
    // Extract text after /claude
    const prompt = text.substring(text.indexOf('/claude') + 7).trim();
    if (!prompt) {
      core.info('No text found after /claude');
      return;
    }
    
    // Execute Claude CLI
    core.info(`Executing Claude CLI: ${prompt}`);
    const originalFileState = captureFileState(workspace);
    const claudeOutput = runClaudeCode(workspace, anthropicApiKey, prompt, timeoutSecond * 1000);

    // `Credit balance is too low` error handling
    if (claudeOutput.includes('Credit balance is too low')) {
      core.setFailed('Credit balance is too low');
      return;
    }
    
    // Detect file changes
    const changedFiles = detectChanges(workspace, originalFileState);

    core.info('File changes detected. Files:\n' + changedFiles.join('\n'));
    
    if (changedFiles.length > 0) {
      // If files were changed
      core.info(`Changed files: ${changedFiles.join(', ')}`);
      
      if (event.type === 'issuesOpened' || event.type === 'issueCommentCreated')
      {
        // For issues, create a PR
        await createPullRequest(workspace, octokit, repo, event.github, changedFiles, claudeOutput);
      } else if (event.type === 'pullRequestCommentCreated') {
        // For PRs, commit the changes
        await commitAndPush(workspace, octokit, repo, event.github, changedFiles, claudeOutput);
      }
    } else {
      // If no files were changed, just post a comment
      core.info('No files were changed');
      await postComment(octokit, repo, event.github, claudeOutput);
    }
    
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed('An unknown error occurred');
    }
  }
}

// Function to determine event type
function getEventType(payload: any): AgentEvent | null {
  if (payload.action === 'opened' && !payload.issue.pull_request) {
    return { type: 'issuesOpened', github: payload };
  }
  if (payload.action === 'created' && !payload.issue.pull_request) {
    return { type: 'issueCommentCreated', github: payload };
  }
  if (payload.action === 'created' && payload.issue.pull_request) {
    return { type: 'pullRequestCommentCreated', github: payload };
  }
  return null;
}

// Function to extract text
function extractText(event: GitHubEvent): string | null {
  if (event.action === 'opened') {
    return event.issue.body;
  }
  if (event.action === 'created') {
    return event.comment.body;
  }
  return null;
}

// Function to record Git state
function captureFileState(workspace: string): string {
  try {
    // Configure Git user identity locally for this repository
    core.info('Configuring Git user identity locally...');
    execaSync('git', ['config', 'user.name', 'github-actions[bot]'], { cwd: workspace, stdio: 'inherit' });
    execaSync('git', ['config', 'user.email', 'github-actions[bot]@users.noreply.github.com'], { cwd: workspace, stdio: 'inherit' });

    // Get the current commit hash
    const result = execaSync('git', ['rev-parse', 'HEAD'], { cwd: workspace });
    core.info(`Captured initial commit hash: ${result.stdout}`);
    return result.stdout.trim();
  } catch (error) {
    core.error(`Error capturing file state: ${error}`);
    throw new Error(`Failed to capture file state: ${error instanceof Error ? error.message : error}`);
  }
}

// Function to detect file changes using Git
function detectChanges(workspace: string, originalCommitHash: string): string[] {
  try {
    // Ensure all changes are tracked, including untracked files
    execaSync('git', ['add', '-A'], { cwd: workspace, stdio: 'inherit' });

    // Check for differences compared to the original state
    // Use exit code to determine if there are changes
    const diffResult = execaSync('git', ['diff', '--quiet', '--exit-code', originalCommitHash, 'HEAD', '--'], {
      cwd: workspace,
      reject: false, // Don't throw error on non-zero exit code
      stdio: 'inherit'
    });

    if (diffResult.exitCode === 0) {
      // No changes detected
      core.info('No changes detected by git diff.');
      // Revert any potential 'git add' if no actual changes occurred
      execaSync('git', ['reset', 'HEAD'], { cwd: workspace, stdio: 'inherit' });
      return [];
    } else {
      // Changes detected, get the list of changed files
      const statusResult = execaSync('git', ['diff', '--name-only', originalCommitHash, 'HEAD', '--'], { cwd: workspace });
      const changedFiles = statusResult.stdout.trim().split('\n').filter(file => file); // Filter out empty lines
      core.info(`Detected changed files: ${changedFiles.join(', ')}`);
      return changedFiles;
    }
  } catch (error) {
    core.error(`Error detecting changes: ${error}`);
    // Attempt to reset any staged changes in case of error
    try {
      execaSync('git', ['reset', 'HEAD'], { cwd: workspace, stdio: 'inherit' });
    } catch (resetError) {
      core.error(`Failed to reset git state after error: ${resetError}`);
    }
    throw new Error(`Failed to detect changes: ${error instanceof Error ? error.message : error}`);
  }
}

// Function to create a PR
async function createPullRequest(
  workspace: string,
  octokit: ReturnType<typeof github.getOctokit>,
  repo: { owner: string; repo: string },
  event: GitHubEventIssuesOpened | GitHubEventIssueCommentCreated,
  changedFiles: string[],
  claudeOutput: string
): Promise<void> {
  const issueNumber = event.issue.number;
  const branchName = `claude-changes-${issueNumber}`;
  const commitMessage = `Apply changes by Claude for #${issueNumber}\n\n${claudeOutput}`;

  try {
    core.info(`Creating new branch: ${branchName}`);
    execaSync('git', ['checkout', '-b', branchName], { cwd: workspace, stdio: 'inherit' });

    core.info('Committing changes...');
    // 'git add -A' was already done in detectChanges
    execaSync('git', ['commit', '-m', commitMessage], { cwd: workspace, stdio: 'inherit' });

    core.info(`Pushing changes to origin/${branchName}...`);
    execaSync('git', ['push', 'origin', branchName, '--force'], { cwd: workspace, stdio: 'inherit' }); // Use force push for simplicity in case branch exists

    core.info('Creating Pull Request...');
    const pr = await octokit.rest.pulls.create({
      ...repo,
      title: `Claude changes for #${issueNumber}: ${event.issue.title}`,
      head: branchName,
      base: github.context.ref.replace('refs/heads/', ''), // Use the branch the action ran on as base
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

// Function to commit and push changes
async function commitAndPush(
  workspace: string,
  octokit: ReturnType<typeof github.getOctokit>,
  repo: { owner: string; repo: string },
  event: GitHubEventPullRequestCommentCreated,
  changedFiles: string[],
  claudeOutput: string
): Promise<void> {
  const prNumber = event.issue.number; // In PR comments, issue.number is the PR number
  const commitMessage = `Apply changes by Claude based on comment in #${prNumber}\n\n${claudeOutput}`;

  try {
    // Get current branch name from the PR context if possible, otherwise from git
    let currentBranch: string;
    try {
        const prData = await octokit.rest.pulls.get({ ...repo, pull_number: prNumber });
        currentBranch = prData.data.head.ref;
        core.info(`Checked out PR branch: ${currentBranch}`);
        execaSync('git', ['checkout', currentBranch], { cwd: workspace, stdio: 'inherit' });
    } catch (e) {
        core.warning(`Could not get PR branch from API, falling back to git: ${e}`);
        const branchResult = execaSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: workspace });
        currentBranch = branchResult.stdout.trim();
        core.info(`Current branch from git: ${currentBranch}`);
        // Ensure we are on the correct branch if the checkout happened before the action ran
        execaSync('git', ['checkout', currentBranch], { cwd: workspace, stdio: 'inherit' });
    }


    core.info('Committing changes...');
    // 'git add -A' was already done in detectChanges
    execaSync('git', ['commit', '-m', commitMessage], { cwd: workspace, stdio: 'inherit' });

    core.info(`Pushing changes to origin/${currentBranch}...`);
    execaSync('git', ['push', 'origin', currentBranch], { cwd: workspace, stdio: 'inherit' });

    core.info('Changes committed and pushed.');

    // Post a comment confirming the changes
    await postComment(octokit, repo, event, `Applied changes to this PR based on your comment.\n\n## Claude Output\n${claudeOutput}`);

  } catch (error) {
    core.error(`Error committing and pushing changes: ${error}`);
    throw new Error(`Failed to commit and push changes: ${error instanceof Error ? error.message : error}`);
  }
}

// Function to post a comment
async function postComment(
  octokit: ReturnType<typeof github.getOctokit>,
  repo: { owner: string; repo: string },
  event: GitHubEvent,
  claudeOutput: string
): Promise<void> {
  const issueNumber = event.issue.number;
  
  await octokit.rest.issues.createComment({
    ...repo,
    issue_number: issueNumber,
    body: `# Result\n${claudeOutput}\n`,
  });
  
  core.info(`Comment has been posted to Issue/PR #${issueNumber}`);
}


function runClaudeCode(workspace:string, apiKey: string, prompt: string, timeout: number): string {
  // Execute claude command
  const claudeResult = execaSync({
    shell: '/bin/zsh',
    timeout: timeout, // ms,
    cwd: workspace,
  })`ANTHROPIC_API_KEY=${apiKey} claude --verbose -p ${prompt} --allowedTools Bash,Edit,Write`;
  return claudeResult.stdout;
}

// Execute main function
run();
// Test execution (commented out)
// (async () => {
//   try {
//     const result = runClaudeCode('Please tell me the overview of this file in 3 lines', 300000);
//     console.log(result);
//   } catch (error) {
//     console.error('Error:', error);
//   }
// })();
