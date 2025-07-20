import * as core from '@actions/core';
import { execa } from 'execa';
import path from 'path';

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
 */
export async function runAction(
  config: ActionConfig,
  processedEvent: ProcessedEvent,
): Promise<void> {
  const { octokit, repo, workspace, githubToken, context, timeoutSeconds } =
    config;
  const {
    agentEvent,
    userPrompt,
    includeFullHistory,
    createIssues,
    includeFixBuild,
    includeFetch,
  } = processedEvent;
  core.info(
    `runAction flags: includeFullHistory=${includeFullHistory}, createIssues=${createIssues}, includeFixBuild=${includeFixBuild}, includeFetch=${includeFetch}`,
  );

  core.info('[perf] addEyeReaction start');
  const startAddEyeReaction = Date.now();
  await addEyeReaction(octokit, repo, agentEvent.github);
  core.info(
    `[perf] addEyeReaction end - ${Date.now() - startAddEyeReaction}ms`,
  );

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
  } catch (e) {
    core.warning(
      `Failed to create progress comment: ${
        e instanceof Error ? e.message : e
      }`,
    );
  }

  core.info('[perf] cloneRepository start');
  const startClone = Date.now();
  await cloneRepository(
    workspace,
    githubToken,
    repo,
    context,
    octokit,
    agentEvent,
  );
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

  if (progressCommentId) {
    try {
      const steps = progressSteps.map(
        (s, i) => `- [${i <= 0 ? 'x' : ' '}] ${s}`,
      );
      await updateProgressComment(
        octokit,
        repo,
        agentEvent.github,
        progressCommentId,
        steps,
      );
    } catch (e) {
      core.warning(
        `Failed to update progress to 'Gathering context' complete: ${
          e instanceof Error ? e.message : e
        }`,
      );
    }
  }

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
    if (progressCommentId) {
      try {
        const steps = progressSteps.map(
          (s, i) => `- [${i <= 1 ? 'x' : ' '}] ${s}`,
        );
        await updateProgressComment(
          octokit,
          repo,
          agentEvent.github,
          progressCommentId,
          steps,
        );
      } catch (e) {
        core.warning(
          `Failed to update progress to 'Planning' complete: ${
            e instanceof Error ? e.message : e
          }`,
        );
      }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await upsertComment(
      octokit,
      repo,
      agentEvent.github,
      progressCommentId,
      `CLI execution failed: ${msg}`,
    );
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
    try {
      await removeEyeReaction(octokit, repo, agentEvent.github);
      await addThumbUpReaction(octokit, repo, agentEvent.github);
    } catch (reactionError) {
      core.warning(
        `Failed to update reaction on the original issue: ${
          reactionError instanceof Error ? reactionError.message : reactionError
        }`,
      );
    }
    return;
  }

  core.info('[perf] detectChanges start');
  const startDetect = Date.now();
  const changedFiles = await detectChanges(workspace, originalFileState);
  core.info(`[perf] detectChanges end - ${Date.now() - startDetect}ms`);

  if (progressCommentId) {
    try {
      const steps = progressSteps.map(
        (s, i) => `- [${i <= 2 ? 'x' : ' '}] ${s}`,
      );
      await updateProgressComment(
        octokit,
        repo,
        agentEvent.github,
        progressCommentId,
        steps,
      );
    } catch (e) {
      core.warning(
        `Failed to update progress to 'Applying edits' complete: ${
          e instanceof Error ? e.message : e
        }`,
      );
    }
  }
  if (progressCommentId) {
    try {
      const steps = progressSteps.map(
        (s, i) => `- [${i <= 3 ? 'x' : ' '}] ${s}`,
      );
      await updateProgressComment(
        octokit,
        repo,
        agentEvent.github,
        progressCommentId,
        steps,
      );
    } catch (e) {
      core.warning(
        `Failed to update progress to 'Testing' complete: ${
          e instanceof Error ? e.message : e
        }`,
      );
    }
  }

  await handleResult(
    config,
    processedEvent,
    output,
    changedFiles,
    progressCommentId,
  );

  core.info('Action completed successfully.');
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
}
