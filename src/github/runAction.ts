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
import {
  getIssueOrPullRequestNumber,
  getIssueOrPullRequestTitle,
} from './types';

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
  const number = getIssueOrPullRequestNumber(github);
  const title = getIssueOrPullRequestTitle(github);
  if (number == null || title == null) {
    core.warning('Skipping title update: event does not contain issue/PR data');
    return;
  }
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

type OriginalFileState = Awaited<ReturnType<typeof captureFileState>>;
type ChangedFiles = Awaited<ReturnType<typeof detectChanges>>;
type ActionPhaseResult = 'success' | 'cli_failed';

interface ActionRunContext {
  config: ActionConfig;
  processedEvent: ProcessedEvent;
  progressSteps: string[];
  progressCommentId?: number;
  prompt?: string;
  downloadedImageFiles: string[];
  originalFileState?: OriginalFileState;
  output?: string;
  changedFiles?: ChangedFiles;
}

function createRunContext(
  config: ActionConfig,
  processedEvent: ProcessedEvent,
): ActionRunContext {
  return {
    config,
    processedEvent,
    progressSteps: [
      '🔍 Gather context',
      '📝 Plan',
      '✨ Apply edits',
      '🏁 Wrap up',
    ],
    downloadedImageFiles: [],
  };
}

async function initializeAction(runCtx: ActionRunContext): Promise<void> {
  const { config, processedEvent, progressSteps } = runCtx;
  const { octokit, repo, workspace, githubToken, context } = config;
  const { agentEvent } = processedEvent;

  // add 👀 reaction and mark title as Work In Progress
  await measurePerformance('addEyeReaction', () =>
    addEyeReaction(octokit, repo, agentEvent.github),
  );
  await updateTitle(octokit, repo, agentEvent.github, 'WIP');

  try {
    runCtx.progressCommentId = await createProgressComment(
      octokit,
      repo,
      agentEvent.github,
      progressSteps,
    );
  } catch (error) {
    core.warning(`Failed to create progress comment: ${String(error)}`);
  }

  // clone the repository and capture initial file state
  await measurePerformance('cloneRepository', () =>
    cloneRepository(workspace, githubToken, repo, context, octokit, agentEvent),
  );
  runCtx.originalFileState = await measurePerformance('captureFileState', () =>
    captureFileState(workspace),
  );

  const { prompt, downloadedImageFiles } = await preparePrompt(
    config,
    processedEvent,
  );
  runCtx.prompt = prompt;
  runCtx.downloadedImageFiles = downloadedImageFiles;
  core.info(`Prompt: \n${prompt}`);

  await safeUpdateProgress(
    octokit,
    repo,
    agentEvent.github,
    runCtx.progressCommentId,
    progressSteps,
    0,
  );
}

async function executeAction(
  runCtx: ActionRunContext,
): Promise<ActionPhaseResult> {
  const { config, processedEvent, progressSteps } = runCtx;
  const { octokit, repo, workspace, timeoutSeconds } = config;
  const { agentEvent, createIssues } = processedEvent;

  if (runCtx.prompt == null) {
    throw new Error('Missing prompt in execute phase');
  }
  if (runCtx.originalFileState == null) {
    throw new Error('Missing original file state in execute phase');
  }
  const prompt = runCtx.prompt;
  const originalFileState = runCtx.originalFileState;

  try {
    const allImages = [...config.images, ...runCtx.downloadedImageFiles];
    const rawOutput = await measurePerformance('runCodex', () =>
      runCodex(workspace, config, prompt, timeoutSeconds * 1000, allImages),
    );
    runCtx.output = maskSensitiveInfo(rawOutput, config);
    await safeUpdateProgress(
      octokit,
      repo,
      agentEvent.github,
      runCtx.progressCommentId,
      progressSteps,
      1,
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await upsertComment(
      octokit,
      repo,
      agentEvent.github,
      runCtx.progressCommentId,
      `CLI execution failed: ${msg}`,
    );
    return 'cli_failed';
  }

  core.info(`Output: \n${runCtx.output}`);

  if (createIssues) {
    const { createIssuesFromFeaturePlan } = await import('./createIssues.js');
    await createIssuesFromFeaturePlan(
      octokit,
      repo,
      agentEvent.github,
      runCtx.output,
      runCtx.progressCommentId,
    );
    return 'success';
  }

  runCtx.changedFiles = await measurePerformance('detectChanges', () =>
    detectChanges(workspace, originalFileState),
  );

  await safeUpdateProgress(
    octokit,
    repo,
    agentEvent.github,
    runCtx.progressCommentId,
    progressSteps,
    2,
  );
  await safeUpdateProgress(
    octokit,
    repo,
    agentEvent.github,
    runCtx.progressCommentId,
    progressSteps,
    3,
  );

  await handleResult(
    config,
    processedEvent,
    runCtx.output,
    runCtx.changedFiles,
    runCtx.progressCommentId,
  );

  return 'success';
}

async function finalizeAction(
  runCtx: ActionRunContext,
  phaseResult: ActionPhaseResult,
): Promise<void> {
  const { octokit, repo } = runCtx.config;
  const { agentEvent } = runCtx.processedEvent;

  if (phaseResult === 'success') {
    await updateTitle(octokit, repo, agentEvent.github, 'Done');
    core.info('Action completed successfully.');
  }

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
  const { includeFullHistory, createIssues, includeFixBuild, includeFetch } =
    processedEvent;

  core.info(
    `runAction flags: includeFullHistory=${includeFullHistory}, createIssues=${createIssues}, includeFixBuild=${includeFixBuild}, includeFetch=${includeFetch}`,
  );

  const runCtx = createRunContext(config, processedEvent);
  await initializeAction(runCtx);
  const phaseResult = await executeAction(runCtx);
  await finalizeAction(runCtx, phaseResult);
}
