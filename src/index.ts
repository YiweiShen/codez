import { execa, execaSync } from 'execa';
import * as core from '@actions/core';
import * as github from '@actions/github';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { globSync } from 'glob';
import * as path from 'path';
import ignore from 'ignore';
import Anthropic from '@anthropic-ai/sdk';

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
  id: number;
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
    const workspace = "/workspace/app";
    const timeoutSecond = core.getInput('timeout') !== '' ? parseInt(core.getInput('timeout')) : 300;

    if (anthropicApiKey === '') {
      core.setFailed('Anthropic API Key is required');
      return;
    }

    // Initialize GitHub Client
    const octokit = github.getOctokit(githubToken);
    const context = github.context;
    const repo = context.repo;

    // Load event data
    const eventPayload = JSON.parse(fs.readFileSync(eventPath, 'utf8'));

    // Determine event type
    const event = getEventType(eventPayload);
    if (!event) {
      core.info('Unsupported event type');
      return;
    }

    // Add eyes reaction to show the action is processing the event
    try {
      await addEyeReaction(octokit, repo, event.github);
      core.info('Added eyes reaction to the event');
    } catch (error) {
      core.warning(`Could not add reaction: ${error instanceof Error ? error.message : error}`);
      // Continue execution even if adding reaction fails
    }

    // Clone the repository
    try {
      await cloneRepository(workspace, githubToken, repo, context, octokit, event);
    } catch (error) {
      core.setFailed(`Failed during repository cloning: ${error instanceof Error ? error.message : error}`);
      return;
    }

    // Check if text contains the /claude command
    const text = extractText(event.github);
    if (!text || !text.includes('/claude')) {
      core.info('/claude command not found');
      return;
    }

    // Extract text after /claude
    const userPrompt = text.substring(text.indexOf('/claude') + 7).trim();
    if (!userPrompt) {
      core.info('No text found after /claude');
      return;
    }

    // Execute Claude CLI
    const originalFileState = captureFileState(workspace);

    core.info(`Executing Claude CLI: ${userPrompt}`);
    const claudeOutput = runClaudeCode(workspace, anthropicApiKey, userPrompt, timeoutSecond * 1000);

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

      // get Commit message
      const commitMessage = await generateCommitMessage(
        anthropicApiKey,
        changedFiles,
        workspace,
        claudeOutput,
        {
          issueNumber: event.type === 'issuesOpened' || event.type === 'issueCommentCreated' ? event.github.issue.number : undefined,
          prNumber: event.type === 'pullRequestCommentCreated' ? event.github.issue.number : undefined,
        }
      );

      if (event.type === 'issuesOpened' || event.type === 'issueCommentCreated') {
        // For issues, create a PR
        await createPullRequest(workspace, octokit, repo, event.github, commitMessage, claudeOutput);
      } else if (event.type === 'pullRequestCommentCreated') {
        // For PRs, commit the changes
        await commitAndPush(workspace, octokit, repo, event.github, commitMessage, claudeOutput);
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

// Function to clone the repository
async function cloneRepository(
  workspace: string,
  githubToken: string,
  repo: { owner: string; repo: string },
  context: typeof github.context,
  octokit: ReturnType<typeof github.getOctokit>,
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

// Function to add eye reaction to the event source
async function addEyeReaction(
  octokit: ReturnType<typeof github.getOctokit>,
  repo: { owner: string; repo: string },
  event: GitHubEvent
): Promise<void> {
  try {
    if (event.action === 'opened') {
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

// Function to calculate SHA-256 hash of a file
function calculateFileHash(filePath: string): string {
  const fileBuffer = fs.readFileSync(filePath);
  const hashSum = crypto.createHash('sha256');
  hashSum.update(fileBuffer);
  return hashSum.digest('hex');
}

// Function to capture the state of files in the workspace, respecting .gitignore
function captureFileState(workspace: string): Map<string, string> {
  core.info('Capturing current file state (respecting .gitignore)...');
  const fileState = new Map<string, string>();
  const gitignorePath = path.join(workspace, '.gitignore');
  const ig = ignore();

  // Add default ignores
  ig.add('.git/**');
  ig.add('.github/**'); // Assuming we always want to ignore .github

  if (fs.existsSync(gitignorePath)) {
    core.info('Reading .gitignore rules...');
    const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
    ig.add(gitignoreContent);
  } else {
    core.info('.gitignore not found, using default ignores.');
  }

  // Use glob to find all files, then filter using ignore rules
  const allFiles = globSync('**/*', { cwd: workspace, nodir: true, dot: true });
  const filesToProcess = ig.filter(allFiles); // Filter files based on ignore rules

  core.info(`Found ${allFiles.length} total files, processing ${filesToProcess.length} files after ignore rules.`);

  for (const file of filesToProcess) {
    const filePath = path.join(workspace, file);
    try {
      const hash = calculateFileHash(filePath);
      fileState.set(file, hash); // Store relative path
    } catch (error) {
      core.warning(`Could not read file ${file}: ${error}`);
    }
  }
  core.info(`Captured state of ${fileState.size} files.`);
  return fileState;
}

// Function to detect file changes by comparing states
function detectChanges(workspace: string, originalState: Map<string, string>): string[] {
  core.info('Detecting file changes...');
  const currentState = captureFileState(workspace);
  const changedFiles = new Set<string>();

  // Check for changed or added files
  for (const [file, currentHash] of currentState.entries()) {
    const originalHash = originalState.get(file);
    if (!originalHash) {
      core.info(`File added: ${file}`);
      changedFiles.add(file); // New file added
    } else if (originalHash !== currentHash) {
      core.info(`File changed: ${file}`);
      changedFiles.add(file); // File content changed
    }
  }

  // Check for deleted files
  for (const file of originalState.keys()) {
    if (!currentState.has(file)) {
      core.info(`File deleted: ${file}`);
      changedFiles.add(file); // File deleted
    }
  }

  if (changedFiles.size > 0) {
    core.info(`Detected changes in files: ${Array.from(changedFiles).join(', ')}`);
  } else {
    core.info('No file changes detected.');
  }

  return Array.from(changedFiles);
}

// Function to create a PR
async function createPullRequest(
  workspace: string,
  octokit: ReturnType<typeof github.getOctokit>,
  repo: { owner: string; repo: string },
  event: GitHubEventIssuesOpened | GitHubEventIssueCommentCreated,
  commitMessage: string,
  claudeOutput: string
): Promise<void> {
  const issueNumber = event.issue.number;
  const branchName = `claude-changes-${issueNumber}`;

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

/**
 * Function to generate Git commit messages using Anthropic API
 * @param apiKey Anthropic API Key
 * @param changedFiles List of changed files
 * @param workspace Workspace path
 * @param userPrompt
 * @param context Context information (PR number, Issue number, etc.)
 * @returns Generated commit message
 */
async function generateCommitMessage(
  apiKey: string,
  changedFiles: string[],
  workspace: string,
  userPrompt: string,
  context: { prNumber?: number; issueNumber?: number; }
): Promise<string> {
  try {

    // Create prompt
    let prompt = `Based on the following file changed and User Request, generate a concise and clear git commit message.
  The commit message should follow this format:
  * Summary of changes (50 characters or less). Please do not include any other text.

  User Request:
  ${userPrompt}

  files changed:
  \`\`\`
  ${changedFiles.join('\n')}
  \`\`\``;

    // Add context information if available
    if (context.prNumber) {
      prompt += `\n\nThis change is related to PR #${context.prNumber}.`;
    }
    if (context.issueNumber) {
      prompt += `\n\nThis change is related to Issue #${context.issueNumber}.`;
    }

    // Call Anthropic API
    const anthropic = new Anthropic({
      apiKey: apiKey,
    });

    const response = await anthropic.messages.create({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    // Extract commit message from response
    let commitMessage = '';
    for (const block of response.content) {
      if (block.type === 'text') {
        commitMessage += block.text;
      }
    }
    commitMessage = commitMessage.trim();

    core.info(`Generated commit message: ${commitMessage}`);
    return commitMessage;
  } catch (error) {
    core.warning(`Error generating commit message: ${error instanceof Error ? error.message : String(error)}`);
    // Return default message in case of error
    if (context.prNumber) {
      return `Apply changes for PR #${context.prNumber}`;
    } else if (context.issueNumber) {
      return `Apply changes for Issue #${context.issueNumber}`;
    } else {
      return `Apply changes to ${changedFiles.length} files`;
    }
  }
}

// Function to commit and push changes
async function commitAndPush(
  workspace: string,
  octokit: ReturnType<typeof github.getOctokit>,
  repo: { owner: string; repo: string },
  event: GitHubEventPullRequestCommentCreated,
  commitMessage: string,
  claudeOutput: string
): Promise<void> {
  const prNumber = event.issue.number; // In PR comments, issue.number is the PR number

  // Add changed files before committing
  core.info('Adding changed files to Git...');
  execaSync('git', ['add', '-A'], { cwd: workspace, stdio: 'inherit' });

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

    core.info('Configuring Git user identity locally...');
    execaSync('git', ['config', 'user.name', 'github-actions[bot]'], { cwd: workspace, stdio: 'inherit' });
    execaSync('git', ['config', 'user.email', 'github-actions[bot]@users.noreply.github.com'], { cwd: workspace, stdio: 'inherit' });

    core.info('Adding changed files to Git...');
    // Add all changed files (including deleted ones)
    execaSync('git', ['add', '-A'], { cwd: workspace, stdio: 'inherit' });

    core.info('Committing changes...');
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
    body: `${claudeOutput}\n`,
  });

  core.info(`Comment has been posted to Issue/PR #${issueNumber}`);
}


function runClaudeCode(workspace: string, apiKey: string, prompt: string, timeout: number): string {
  // Execute claude command
  try {
    const claudeResult = execaSync({
      shell: '/bin/zsh',
      timeout: timeout, // ms,
      cwd: workspace,
    })`ANTHROPIC_API_KEY=${apiKey} claude -p ${prompt} --allowedTools Bash,Edit,Write`;
    if (claudeResult.exitCode !== 0) {
      throw new Error(`Claude command failed with exit code ${claudeResult.exitCode}`);
    }

    if (claudeResult.stderr) {
      core.warning(`Claude command stderr: ${claudeResult.stderr}`);
      return claudeResult.stderr;
    }
    return claudeResult.stdout;
  } catch (error) {
    core.error(`Error executing claude command: ${error}`);
    throw new Error(`Failed to execute claude command: ${error instanceof Error ? error.message : error}`);
  }
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
