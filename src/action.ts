import * as core from '@actions/core';
import {
  cloneRepository,
  addEyeReaction,
  createPullRequest,
  commitAndPush,
  postComment,
  GitHubEventIssuesOpened,
  GitHubEventIssueCommentCreated,
  GitHubEventPullRequestCommentCreated,
  generatePrompt,
} from './github.js';
import { generateCommitMessage } from './claude.js';
import { runClaudeCode } from './claudecode.js';
import { captureFileState, detectChanges } from './file.js';
import { ActionConfig } from './config.js';
import { ProcessedEvent } from './event.js';

/**
 * Handles the result of Claude's execution based on file changes and event type.
 * @param config Action configuration.
 * @param processedEvent Processed event data.
 * @param claudeOutput Output from the Claude CLI.
 * @param changedFiles Array of changed file paths.
 */
async function handleResult(
  config: ActionConfig,
  processedEvent: ProcessedEvent,
  claudeOutput: string,
  changedFiles: string[]
): Promise<void> {
  const { octokit, repo, workspace, anthropicApiKey } = config;
  const { agentEvent, userPrompt } = processedEvent;

  if (changedFiles.length > 0) {
    core.info(`Detected changes in ${changedFiles.length} files:\n${changedFiles.join('\n')}`);

    // Generate commit message
    const commitMessage = await generateCommitMessage(
      anthropicApiKey,
      changedFiles,
      userPrompt,
      {
        issueNumber: (agentEvent.type === 'issuesOpened' || agentEvent.type === 'issueCommentCreated') ? agentEvent.github.issue.number : undefined,
        prNumber: agentEvent.type === 'pullRequestCommentCreated' ? agentEvent.github.issue.number : undefined,
      }
    );

    // Handle changes based on event type
    if (agentEvent.type === 'issuesOpened' || agentEvent.type === 'issueCommentCreated') {
      await createPullRequest(
        workspace,
        octokit,
        repo,
        agentEvent.github as GitHubEventIssuesOpened | GitHubEventIssueCommentCreated,
        commitMessage,
        claudeOutput
      );
    } else if (agentEvent.type === 'pullRequestCommentCreated') {
      await commitAndPush(
        workspace,
        octokit,
        repo,
        agentEvent.github as GitHubEventPullRequestCommentCreated,
        commitMessage,
        claudeOutput
      );
    }
  } else {
    // No files changed, post Claude's output as a comment
    await postComment(octokit, repo, agentEvent.github, `${claudeOutput}`);
  }
}

/**
 * Executes the main logic of the GitHub Action.
 * @param config Action configuration.
 * @param processedEvent Processed event data.
 */
export async function runAction(config: ActionConfig, processedEvent: ProcessedEvent): Promise<void> {
  const { octokit, repo, workspace, githubToken, context, anthropicApiKey, timeoutSeconds } = config;
  const { agentEvent, userPrompt } = processedEvent;

  // Add eyes reaction
  await addEyeReaction(octokit, repo, agentEvent.github);

  // Clone repository
  await cloneRepository(workspace, githubToken, repo, context, octokit, agentEvent);

  // Capture initial file state
  const originalFileState = captureFileState(workspace);

  // generate Propmt
  const prompt = await generatePrompt(octokit, repo, agentEvent, userPrompt);

  // Execute Claude CLI
  core.info('Executing Claude Code CLI...');
  core.info(`Prompt: \n${prompt}`);
  let claudeOutput;
  try {
    claudeOutput = runClaudeCode(workspace, anthropicApiKey, prompt, timeoutSeconds * 1000);
  } catch (error) {
    await postComment(
      octokit,
      repo,
      agentEvent.github,
      `Claude Code CLI execution failed: ${error instanceof Error ? error.message : String(error)}`
    );
    return;
  }
  core.info('Claude Code CLI execution finished.');

  // Detect file changes
  const changedFiles = detectChanges(workspace, originalFileState);

  // Handle the results
  await handleResult(config, processedEvent, claudeOutput, changedFiles);

  core.info('Action completed successfully.');
}