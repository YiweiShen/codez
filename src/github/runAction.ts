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
 * Executes the main logic of the GitHub Action.
 * @param config - Action configuration.
 * @param processedEvent - Processed event data.
 * @returns Promise that resolves when the action run completes.
 */
export async function runAction(
  config: ActionConfig,
  processedEvent: ProcessedEvent,
): Promise<void> {
  const { octokit, repo, workspace, githubToken, context, timeoutSeconds } =
    config;
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

  // add 👀 reaction and mark title as Work In Progress
  await measurePerformance('addEyeReaction', () =>
    addEyeReaction(octokit, repo, agentEvent.github),
  );
  await updateTitle(octokit, repo, agentEvent.github, 'WIP');

  const progressSteps = [
    '🔍 Gathering context',
    '📝 Planning',
    '✨ Applying edits',
    '🧪 Testing',
  ];
  let progressCommentId: number | undefined;
  try {
    progressCommentId = await createProgressComment(
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
  const originalFileState = await measurePerformance('captureFileState', () =>
    captureFileState(workspace),
  );

  const { prompt, downloadedImageFiles } = await preparePrompt(
    config,
    processedEvent,
  );
  core.info(`Prompt: \n${prompt}`);

  await safeUpdateProgress(
    octokit,
    repo,
    agentEvent.github,
    progressCommentId,
    progressSteps,
    0,
  );

  let output: string;
  try {
    const allImages = [...config.images, ...downloadedImageFiles];
    const rawOutput = await measurePerformance('runCodex', () =>
      runCodex(workspace, config, prompt, timeoutSeconds * 1000, allImages),
    );
    output = maskSensitiveInfo(rawOutput, config);
    await safeUpdateProgress(
      octokit,
      repo,
      agentEvent.github,
      progressCommentId,
      progressSteps,
      1,
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await upsertComment(
      octokit,
      repo,
      agentEvent.github,
      progressCommentId,
      `CLI execution failed: ${msg}`,
    );
    await finalizeReactions(octokit, repo, agentEvent.github);
    return;
  }

  core.info(`Output: \n${output}`);

  if (createIssues) {
    const { createIssuesFromFeaturePlan } = await import('./createIssues.js');
    await createIssuesFromFeaturePlan(
      octokit,
      repo,
      agentEvent.github,
      output,
      progressCommentId,
    );
    await updateTitle(octokit, repo, agentEvent.github, 'Done');
    core.info('Action completed successfully.');
    await finalizeReactions(octokit, repo, agentEvent.github);
    return;
  }

  const changedFiles = await measurePerformance('detectChanges', () =>
    detectChanges(workspace, originalFileState),
  );

  await safeUpdateProgress(
    octokit,
    repo,
    agentEvent.github,
    progressCommentId,
    progressSteps,
    2,
  );
  await safeUpdateProgress(
    octokit,
    repo,
    agentEvent.github,
    progressCommentId,
    progressSteps,
    3,
  );

  await handleResult(
    config,
    processedEvent,
    output,
    changedFiles,
    progressCommentId,
  );

  await updateTitle(octokit, repo, agentEvent.github, 'Done');
  core.info('Action completed successfully.');
  await finalizeReactions(octokit, repo, agentEvent.github);
}
