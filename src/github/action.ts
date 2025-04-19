import * as core from '@actions/core';
import {
  cloneRepository,
  addEyeReaction,
  createPullRequest,
  commitAndPush,
  postComment,
  generatePrompt,
} from './github.js';
import { generateCommitMessage as generateCommitMessageAnthropic } from '../api/claude.js';
import { generateCommitMessage as generateCommitMessageOpenAI } from '../api/openai.js';
import { runClaudeCode } from '../client/claudecode.js';
import { captureFileState, detectChanges } from '../file/file.js';
import { ActionConfig } from '../config/config.js';
import { ProcessedEvent } from './event.js';
import { maskSensitiveInfo } from '../security/security.js';
import { runCodex } from '../client/codex.js';

/**
 * Handles the result of execution.
 * @param config Action configuration.
 * @param processedEvent Processed event data.
 * @param output
 * @param changedFiles Array of changed file paths.
 */
async function handleResult(
  config: ActionConfig,
  processedEvent: ProcessedEvent,
  output: string,
  changedFiles: string[]
): Promise<void> {
  const { octokit, repo, workspace } = config;
  const { agentEvent, userPrompt } = processedEvent;

  if (changedFiles.length > 0) {
    core.info(`Detected changes in ${changedFiles.length} files:\n${changedFiles.join('\n')}`);

    const generateCommitMessage = processedEvent.type === 'codex'
      ? generateCommitMessageOpenAI
      : generateCommitMessageAnthropic;
    // Generate commit message
    const commitMessage = await generateCommitMessage(
      changedFiles,
      userPrompt,
      {
        issueNumber: (agentEvent.type === 'issuesOpened' || agentEvent.type === 'issueCommentCreated') ? agentEvent.github.issue.number : undefined,
        prNumber: agentEvent.type === 'pullRequestCommentCreated' 
                  ? agentEvent.github.issue.number 
                  : agentEvent.type === 'pullRequestReviewCommentCreated'
                  ? agentEvent.github.pull_request.number
                  : undefined,
      },
      config
    );

    // Handle changes based on event type
    if (agentEvent.type === 'issuesOpened' || agentEvent.type === 'issueCommentCreated') {
      await createPullRequest(
        workspace,
        octokit,
        repo,
        agentEvent.github,
        commitMessage,
        output
      );
    } else if (agentEvent.type === 'pullRequestCommentCreated' || agentEvent.type === 'pullRequestReviewCommentCreated') {
      await commitAndPush(
        workspace,
        octokit,
        repo,
        agentEvent.github,
        commitMessage,
        output
      );
    }
  } else {
    // No files changed, post Claude's output as a comment
    await postComment(octokit, repo, agentEvent.github, `${output}`);
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

  core.info(`Prompt: \n${prompt}`);
  let output;
  try {
    let rawOutput;
    if (processedEvent.type === 'codex') {
      rawOutput = runCodex(workspace, config, prompt, timeoutSeconds * 1000);
    } else {
      rawOutput = runClaudeCode(workspace, config, prompt, timeoutSeconds * 1000);
    }
    output = maskSensitiveInfo(rawOutput, config);
  } catch (error) {
    await postComment(
      octokit,
      repo,
      agentEvent.github,
      `CLI execution failed: ${error instanceof Error ? error.message : String(error)}`
    );
    return;
  }
  core.info(`Output: \n${output}`);

  // Detect file changes
  const changedFiles = detectChanges(workspace, originalFileState);

  // Handle the results
  await handleResult(config, processedEvent, output, changedFiles);

  core.info('Action completed successfully.');
}
