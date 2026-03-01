/**
 * Main executor for the GitHub Action workflow.
 */
import * as core from '@actions/core';

import type { ActionConfig } from '../config/config';
import type { ProcessedEvent } from './event';
import { cloneRepository } from './git';
import {
  addEyeReaction,
  removeEyeReaction,
  addThumbUpReaction,
} from './reactions';
import { upsertComment } from './comments';
import { captureFileState, detectChanges } from '../file/file';
import { maskSensitiveInfo } from '../security/security';
import { runCodex } from '../client/codex';
import { createProgressComment, updateProgressComment } from './progress';
import { preparePrompt } from './prompt-builder';
import { handleResult } from './result-handler';

type RunActionContext = {
  config: ActionConfig;
  processedEvent: ProcessedEvent;
  progressSteps: string[];
  progressCommentId?: number;
  originalFileState?: Awaited<ReturnType<typeof captureFileState>>;
  prompt?: string;
  downloadedImageFiles: string[];
  output?: string;
};

type ExecuteResult =
  | { success: true }
  | { success: false; errorMessage: string };

/**
 * Utility to measure and log the duration of an async operation.
 * @param label - Description of the operation.
 * @param fn - Async function to execute.
 * @returns Result of the function.
 */
async function measurePerformance<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<T> {
  core.info(`[perf] ${label} start`);
  const start = Date.now();
  const result = await fn();
  core.info(`[perf] ${label} end - ${Date.now() - start}ms`);
  return result;
}

/**
 * Update issue or pull request title by prefixing with the given label.
 */
async function updateTitle(
  octokit: ActionConfig['octokit'],
  repo: ActionConfig['repo'],
  github: ProcessedEvent['agentEvent']['github'],
  label: 'WIP' | 'Done',
): Promise<void> {
  const isIssue = 'issue' in github;
  const number = isIssue ? github.issue.number : github.pull_request!.number;
  const title = isIssue ? github.issue.title : github.pull_request!.title ?? '';
  const stripped = title.replace(/^\[(?:WIP|Done)\]\s*/, '');
  const newTitle = `[${label}] ${stripped}`;
  core.info(`Updating issue/PR #${number} title to '${newTitle}'`);
  await octokit.rest.issues.update({
    ...repo,
    issue_number: number,
    title: newTitle,
  });
}

/**
 * Remove 👀 and add 👍 reaction on the original GitHub event.
 */
async function finalizeReactions(
  octokit: ActionConfig['octokit'],
  repo: ActionConfig['repo'],
  github: ProcessedEvent['agentEvent']['github'],
): Promise<void> {
  try {
    await removeEyeReaction(octokit, repo, github);
    await addThumbUpReaction(octokit, repo, github);
  } catch (error) {
    core.warning(
      `Failed to update reaction on the original event: ${
        error instanceof Error ? error.message : error
      }`,
    );
  }
}

/**
 * Safely update the progress comment to mark a step complete.
 */
async function safeUpdateProgress(
  octokit: ActionConfig['octokit'],
  repo: ActionConfig['repo'],
  github: ProcessedEvent['agentEvent']['github'],
  progressCommentId: number | undefined,
  steps: readonly string[],
  completedIndex: number,
): Promise<void> {
  if (!progressCommentId) return;
  try {
    const status = steps.map(
      (step, i) => `- [${i <= completedIndex ? 'x' : ' '}] ${step}`,
    );
    await updateProgressComment(
      octokit,
      repo,
      github,
      progressCommentId,
      status,
    );
  } catch (error) {
    core.warning(
      `Failed to update progress to '${
        steps[completedIndex]
      }' complete: ${String(error)}`,
    );
  }
}

/**
 * Initializes the action run and prepares execution inputs.
 */
async function initializeAction(runContext: RunActionContext): Promise<void> {
  const { config, processedEvent } = runContext;
  const { octokit, repo, workspace, githubToken, context } = config;
  const {
    agentEvent,
    includeFullHistory,
    createIssues,
    includeFixBuild,
    includeFetch,
  } = processedEvent;

  core.info(
    `runAction flags: includeFullHistory=${includeFullHistory}, createIssues=${createIssues}, includeFixBuild=${includeFixBuild}, includeFetch=${includeFetch}`,
  );

  await measurePerformance('addEyeReaction', () =>
    addEyeReaction(octokit, repo, agentEvent.github),
  );
  await updateTitle(octokit, repo, agentEvent.github, 'WIP');

  try {
    runContext.progressCommentId = await createProgressComment(
      octokit,
      repo,
      agentEvent.github,
      runContext.progressSteps,
    );
  } catch (error) {
    core.warning(`Failed to create progress comment: ${String(error)}`);
  }

  await measurePerformance('cloneRepository', () =>
    cloneRepository(workspace, githubToken, repo, context, octokit, agentEvent),
  );
  runContext.originalFileState = await measurePerformance('captureFileState', () =>
    captureFileState(workspace),
  );

  const { prompt, downloadedImageFiles } = await preparePrompt(config, processedEvent);
  runContext.prompt = prompt;
  runContext.downloadedImageFiles = downloadedImageFiles;
  core.info(`Prompt: \n${prompt}`);

  await safeUpdateProgress(
    octokit,
    repo,
    agentEvent.github,
    runContext.progressCommentId,
    runContext.progressSteps,
    0,
  );
}

/**
 * Executes Codex and stores the masked output.
 */
async function executeAction(
  runContext: RunActionContext,
): Promise<ExecuteResult> {
  const { config, processedEvent } = runContext;
  const { octokit, repo, workspace, timeoutSeconds } = config;
  const { agentEvent } = processedEvent;

  if (!runContext.prompt) {
    return { success: false, errorMessage: 'Prompt was not initialized.' };
  }
  const prompt = runContext.prompt;

  try {
    const allImages = [...config.images, ...runContext.downloadedImageFiles];
    const rawOutput = await measurePerformance('runCodex', () =>
      runCodex(workspace, config, prompt, timeoutSeconds * 1000, allImages),
    );
    runContext.output = maskSensitiveInfo(rawOutput, config);
    await safeUpdateProgress(
      octokit,
      repo,
      agentEvent.github,
      runContext.progressCommentId,
      runContext.progressSteps,
      1,
    );
    return { success: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, errorMessage: msg };
  }
}

/**
 * Finalizes the run by handling success/error output, updates and reactions.
 */
async function finalizeAction(
  runContext: RunActionContext,
  executionResult: ExecuteResult,
): Promise<void> {
  const { config, processedEvent } = runContext;
  const { octokit, repo, workspace } = config;
  const { agentEvent, createIssues } = processedEvent;

  if (!executionResult.success) {
    await upsertComment(
      octokit,
      repo,
      agentEvent.github,
      runContext.progressCommentId,
      `CLI execution failed: ${executionResult.errorMessage}`,
    );
    await finalizeReactions(octokit, repo, agentEvent.github);
    return;
  }
  if (runContext.output === undefined) {
    throw new Error('Codex output was not initialized.');
  }
  const output = runContext.output;

  core.info(`Output: \n${output}`);

  if (createIssues) {
    const { createIssuesFromFeaturePlan } = await import('./createIssues.js');
    await createIssuesFromFeaturePlan(
      octokit,
      repo,
      agentEvent.github,
      output,
      runContext.progressCommentId,
    );
    await updateTitle(octokit, repo, agentEvent.github, 'Done');
    core.info('Action completed successfully.');
    await finalizeReactions(octokit, repo, agentEvent.github);
    return;
  }

  if (!runContext.originalFileState) {
    throw new Error('Original file state was not initialized.');
  }
  const originalFileState = runContext.originalFileState;

  const changedFiles = await measurePerformance('detectChanges', () =>
    detectChanges(workspace, originalFileState),
  );

  await safeUpdateProgress(
    octokit,
    repo,
    agentEvent.github,
    runContext.progressCommentId,
    runContext.progressSteps,
    2,
  );
  await safeUpdateProgress(
    octokit,
    repo,
    agentEvent.github,
    runContext.progressCommentId,
    runContext.progressSteps,
    3,
  );

  await handleResult(
    config,
    processedEvent,
    output,
    changedFiles,
    runContext.progressCommentId,
  );

  await updateTitle(octokit, repo, agentEvent.github, 'Done');
  core.info('Action completed successfully.');
  await finalizeReactions(octokit, repo, agentEvent.github);
}

/**
 * Executes the main logic of the GitHub Action.
 * @param config - Action configuration.
 * @param processedEvent - Processed event data.
 * @returns Promise that resolves when the action run completes.
 */
export async function runAction(
  config: ActionConfig,
  processedEvent: ProcessedEvent,
): Promise<void> {
  const runContext: RunActionContext = {
    config,
    processedEvent,
    progressSteps: [
      '🔍 Gathering context',
      '📝 Planning',
      '✨ Applying edits',
      '🏁 Wrap up',
    ],
    downloadedImageFiles: [],
  };

  await initializeAction(runContext);
  const executionResult = await executeAction(runContext);
  await finalizeAction(runContext, executionResult);
}
