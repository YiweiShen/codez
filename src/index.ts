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
    const originalFileState = captureFileState();
    const claudeOutput = runClaudeCode(workspace, anthropicApiKey, prompt, timeoutSecond * 1000);

    // `Credit balance is too low` error handling
    if (claudeOutput.includes('Credit balance is too low')) {
      core.setFailed('Credit balance is too low');
      return;
    }
    
    // Detect file changes
    const changedFiles = detectChanges(originalFileState);
    
    if (changedFiles.length > 0) {
      // If files were changed
      core.info(`Changed files: ${changedFiles.join(', ')}`);
      
      if (event.type === 'issuesOpened' || event.type === 'issueCommentCreated')
      {
        // For issues, create a PR
        await createPullRequest(octokit, repo, event.github, changedFiles, claudeOutput);
      } else if (event.type === 'pullRequestCommentCreated') {
        // For PRs, commit the changes
        await commitAndPush(octokit, repo, event.github, changedFiles, claudeOutput);
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
function captureFileState(): string {
  try {
    // Get current Git commit hash
    const { stdout: commitHash } = execaSync('git', ['rev-parse', 'HEAD']);
    return commitHash.trim();
  } catch (error) {
    core.warning('Failed to capture Git state. This might be a new repository without commits.');
    return '';
  }
}

// Function to detect file changes using Git
function detectChanges(originalCommitHash: string): string[] {
  try {
    if (!originalCommitHash) {
      // If there was no initial commit hash, get all files that would be committed
      const { stdout } = execaSync('git', ['ls-files', '--others', '--modified', '--exclude-standard']);
      return stdout.split('\n').filter(Boolean);
    }

    // First stage all changes so we can detect them
    execaSync('git', ['add', '-A']);
    
    // Get list of changed files compared to the original commit
    const { stdout } = execaSync('git', ['diff', '--name-only', '--cached', originalCommitHash]);
    
    // Return the list of changed files
    return stdout.split('\n').filter(Boolean);
  } catch (error) {
    core.warning(`Failed to detect changes: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

// Function to create a PR
async function createPullRequest(
  octokit: ReturnType<typeof github.getOctokit>,
  repo: { owner: string; repo: string },
  event: GitHubEventIssuesOpened | GitHubEventIssueCommentCreated,
  changedFiles: string[],
  claudeOutput: string
): Promise<void> {
  const branchName = `claude-code-github-agent-${Date.now()}`;
  
  // Create a new branch
  await execa('git', ['checkout', '-b', branchName]);
  
  // Commit changes
  await execa('git', ['add', '.']);
  await execa('git', ['config', 'user.name', 'GitHub Action']);
  await execa('git', ['config', 'user.email', 'github-action@users.noreply.github.com']);
  await execa('git', ['commit', '-m', `Claude Code Github Agent: Changes from issue #${event.issue.number}`]);
  
  // Push to remote
  await execa('git', ['push', 'origin', branchName]);
  
  // Create PR
  const issueNumber = event.issue.number;
  const issueTitle = event.issue.title;
  const prTitle = `[Claude Code Github Agent] {${issueTitle}}`;
  const prBody = `# Issue\n#${issueNumber}\n\n# Result\n${claudeOutput}\n`;
  
  const { data: pullRequest } = await octokit.rest.pulls.create({
    ...repo,
    title: prTitle,
    body: prBody,
    head: branchName,
    base: 'main',
  });
  
  core.info(`PR has been created: ${pullRequest.html_url}`);
  
  // Post a comment to the issue
  await octokit.rest.issues.createComment({
    ...repo,
    issue_number: issueNumber,
    body: `Claude Code Github Agent has made changes. PR has been created: ${pullRequest.html_url}`,
  });
}

// Function to commit and push changes
async function commitAndPush(
  octokit: ReturnType<typeof github.getOctokit>,
  repo: { owner: string; repo: string },
  event: GitHubEventPullRequestCommentCreated,
  changedFiles: string[],
  claudeOutput: string
): Promise<void> {
  const prNumber = event.issue.number;
  
  // Get PR information
  const { data: pr } = await octokit.rest.pulls.get({
    ...repo,
    pull_number: prNumber,
  });
  
  // Checkout PR branch
  await execa('git', ['fetch', 'origin', pr.head.ref]);
  await execa('git', ['checkout', pr.head.ref]);
  
  // Commit changes
  await execa('git', ['add', '.']);
  await execa('git', ['config', 'user.name', 'GitHub Action']);
  await execa('git', ['config', 'user.email', 'github-action@users.noreply.github.com']);
  await execa('git', ['commit', '-m', `Claude Code Github Agent: Changes from PR #${prNumber}`]);
  
  // Push to remote
  await execa('git', ['push', 'origin', pr.head.ref]);
  
  // Post a comment to the PR
  await octokit.rest.issues.createComment({
    ...repo,
    issue_number: prNumber,
    body: `# Result\n${claudeOutput}\n`,
  });
  
  core.info(`Changes have been pushed to PR #${prNumber}`);
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
