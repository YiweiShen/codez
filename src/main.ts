/**
 * @file Core orchestration and workflow logic for the GitHub Action.
 * This module initializes configuration, processes events, checks permissions,
 * and triggers the main action logic.
 */

import * as core from '@actions/core';
import type { ActionConfig } from './config/config';
import { getConfig } from './config/config';
import { getOpenAIClient } from './api/openai';
import { runAction } from './github/action';
import type { ProcessedEvent } from './github/event';
import { processEvent } from './github/event';
import { postComment } from './github/comments';
import { checkPermission } from './security/security';

/**
 * Safely post an error comment to GitHub, logging any failures.
 */
async function postErrorComment(
  config: ActionConfig,
  event: ProcessedEvent,
  message: string,
): Promise<void> {
  try {
    await postComment(config.octokit, config.repo, event.agentEvent.github, message);
  } catch (err) {
    core.error(`Failed to post comment: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Wraps a promise with a timeout, rejecting with the provided error on timeout.
 */
async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  timeoutError: Error,
): Promise<T> {
  let timer: NodeJS.Timeout;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(timeoutError), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer!);
  }
}

/**
 * Verifies OpenAI API key and model access.
 * @throws if the model is not accessible.
 */
async function verifyModelAccess(config: ActionConfig): Promise<void> {
  const client = getOpenAIClient(config);
  await client.models.retrieve(config.openaiModel);
}

/**
 * Orchestrate the action's workflow.
 *
 * Retrieves configuration, processes the event, checks permissions,
 * and executes the main action logic within the configured timeout budget.
 * @returns A promise that resolves when the action completes.
 */

export async function run(): Promise<void> {
  try {
    const config = getConfig();

    core.info(`Verifying OpenAI API key and access to model ${config.openaiModel}`);
    try {
      await verifyModelAccess(config);
    } catch (error) {
      const message = `OPENAI_API_KEY invalid or no access to model "${config.openaiModel}"`;
      core.setFailed(message);
      try {
        const processedEvent = await processEvent(config);
        if (processedEvent) {
          await postErrorComment(config, processedEvent, message);
        }
      } catch (commentError) {
        core.error(
          `Failed to post API key error comment: ${
            commentError instanceof Error ? commentError.message : String(commentError)
          }`,
        );
      }
      return;
    }

    const processedEvent = await processEvent(config);
    if (!processedEvent) {
      return;
    }

    if (!(await checkPermission(config))) {
      core.warning('Permission check failed. Exiting process.');
      return;
    }

    const timeoutMs = config.timeoutSeconds * 1000;
    const timeoutErrorMessage = `Action timed out after ${config.timeoutSeconds} seconds`;
    try {
      await withTimeout(
        runAction(config, processedEvent),
        timeoutMs,
        new Error(timeoutErrorMessage),
      );
    } catch (error) {
      if (error instanceof Error && error.message === timeoutErrorMessage) {
        core.setFailed(timeoutErrorMessage);
        await postErrorComment(config, processedEvent, timeoutErrorMessage);
        return;
      }
      throw error;
    }
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(`Action failed: ${error.message}\n${error.stack ?? ''}`);
    } else {
      core.setFailed(`An unknown error occurred: ${String(error)}`);
    }
  }
}
