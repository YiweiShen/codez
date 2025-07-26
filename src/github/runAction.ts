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

  // Helper to update issue/PR title prefixing with given label
  const updateTitle = async (label: 'WIP' | 'Done') => {
    const isIssue = 'issue' in agentEvent.github;
    const number = isIssue
      ? agentEvent.github.issue.number
      : agentEvent.github.pull_request.number;
    const title = isIssue
      ? agentEvent.github.issue.title
      : agentEvent.github.pull_request.title ?? '';
    const stripped = title.replace(/^\[(?:WIP|Done)\]\s*/, '');
    const newTitle = `[${label}] ${stripped}`;
    core.info(`Updating issue/PR #${number} title to '${newTitle}'`);
    await octokit.rest.issues.update({
      ...repo,
      issue_number: number,
      title: newTitle,
    });
  };

  // Helper to safely update original reactions: remove 👀 and add 👍
  const finalizeReactions = async () => {
    try {
      await removeEyeReaction(octokit, repo, agentEvent.github);
      await addThumbUpReaction(octokit, repo, agentEvent.github);
    } catch (reactionError) {
      core.warning(
        `Failed to update reaction on the original event: ${
          reactionError instanceof Error ? reactionError.message : reactionError
        }`,
      );
    }
  };

  core.info('[perf] addEyeReaction start');
  const startEye = Date.now();
  await addEyeReaction(octokit, repo, agentEvent.github);
  core.info(`[perf] addEyeReaction end - ${Date.now() - startEye}ms`);

  await updateTitle('WIP');

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

  const safeUpdateProgress = async (completedIndex: number) => {
    if (!progressCommentId) return;
    try {
      const steps = progressSteps.map((step, i) =>
        `- [${i <= completedIndex ? 'x' : ' '}] ${step}`,
      );
      await updateProgressComment(
        octokit,
        repo,
        agentEvent.github,
        progressCommentId,
        steps,
      );
    } catch (error) {
      core.warning(
        `Failed to update progress to '${progressSteps[completedIndex]}' complete: ${String(
          error,
        )}`,
      );
    }
  };

  core.info('[perf] cloneRepository start');
  const startClone = Date.now();
  await cloneRepository(workspace, githubToken, repo, context, octokit, agentEvent);
  core.info(`[perf] cloneRepository end - ${Date.now() - startClone}ms`);

  core.info('[perf] captureFileState start');
  const startCapture = Date.now();
  const originalFileState = await captureFileState(workspace);
  core.info(`[perf] captureFileState end - ${Date.now() - startCapture}ms`);

  const { prompt, downloadedImageFiles } = await preparePrompt(
    config,
    processedEvent,
  );
  core.info(`Prompt: \n${prompt}`);

  await safeUpdateProgress(0);

  let output: string;
  try {
    const allImages = [...config.images, ...downloadedImageFiles];
    core.info('[perf] runCodex start');
    const startCodex = Date.now();
    const rawOutput = await runCodex(
      workspace,
      config,
      prompt,
      timeoutSeconds * 1000,
      allImages,
    );
    core.info(`[perf] runCodex end - ${Date.now() - startCodex}ms`);
    output = maskSensitiveInfo(rawOutput, config);
    await safeUpdateProgress(1);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await upsertComment(
      octokit,
      repo,
      agentEvent.github,
      progressCommentId,
      `CLI execution failed: ${msg}`,
    );
    await finalizeReactions();
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
    await updateTitle('Done');
    core.info('Action completed successfully.');
    await finalizeReactions();
    return;
  }

  core.info('[perf] detectChanges start');
  const startDetect = Date.now();
  const changedFiles = await detectChanges(workspace, originalFileState);
  core.info(`[perf] detectChanges end - ${Date.now() - startDetect}ms`);

  await safeUpdateProgress(2);
  await safeUpdateProgress(3);

  await handleResult(
    config,
    processedEvent,
    output,
    changedFiles,
    progressCommentId,
  );

  await updateTitle('Done');
  core.info('Action completed successfully.');
  await finalizeReactions();
}
