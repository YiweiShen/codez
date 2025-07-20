/**
 * @file Core orchestration and workflow logic for the GitHub Action.
 * This module initializes configuration, processes events, checks permissions,
 * and triggers the main action logic.
 */

import * as core from '@actions/core';

import { getOpenAIClient } from './api/openai';

import { getConfig } from './config/config';

import { runAction } from './github/action';

import { postComment } from './github/comments';
import { processEvent } from './github/event';

import { checkPermission } from './security/security';

/**
 * Orchestrate the action's workflow.
 *
 * Retrieves configuration, processes the event, checks permissions,
 * and executes the main action logic within the configured timeout budget.
 * @returns A promise that resolves when the action completes.
 */

/**
 *
 */

/**
 *
 */

/**
 *
 */

/**
 *
 */

/**
 *
 */

/**
 *
 */

/**
 *
 */

/**
 *
 */

/**
 *
 */

/**
 *
 */

export async function run(): Promise<void> {
  try {
    // Get Configuration
    const config = getConfig();

    // Verify OpenAI API key and access to the configured model
    core.info(
      `Verifying OpenAI API key and access to model ${config.openaiModel}`,
    );
    try {
      const client = getOpenAIClient(config);
      await client.models.retrieve(config.openaiModel);
    } catch (error) {
      const failureMessage = `OPENAI_API_KEY invalid or no access to model "${config.openaiModel}"`;
      core.setFailed(failureMessage);
      try {
        const processedEvent = await processEvent(config);
        if (processedEvent) {
          await postComment(
            config.octokit,
            config.repo,
            processedEvent.agentEvent.github,
            failureMessage,
          );
        }
      } catch (commentError) {
        core.error(
          `Failed to post API key error comment: ${
            commentError instanceof Error
              ? commentError.message
              : String(commentError)
          }`,
        );
      }
      return;
    }

    // Process Event
    const processedEvent = await processEvent(config);

    // Execute Action Logic or Handle Edge Cases
    if (!processedEvent) {
      return;
    }

    // Permissions Check
    const hasPermission = await checkPermission(config);
    if (!hasPermission) {
      core.warning('Permission check failed. Exiting process.');
      return;
    }

    // Event is valid and prompt exists, run the main action logic with timeout control
    const timeoutMs = config.timeoutSeconds * 1000;
    let timer: ReturnType<typeof setTimeout>;
    const timeoutErrorMessage = `Action timed out after ${config.timeoutSeconds} seconds`;
    try {
      await Promise.race([
        runAction(config, processedEvent),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(timeoutErrorMessage)),
            timeoutMs,
          );
        }),
      ]);
    } catch (error) {
      if (error instanceof Error && error.message === timeoutErrorMessage) {
        core.setFailed(timeoutErrorMessage);
        try {
          await postComment(
            config.octokit,
            config.repo,
            processedEvent.agentEvent.github,
            timeoutErrorMessage,
          );
        } catch (commentError) {
          core.error(
            `Failed to post timeout comment: ${
              commentError instanceof Error
                ? commentError.message
                : String(commentError)
            }`,
          );
        }
        return;
      }
      throw error;
    } finally {
      clearTimeout(timer!);
    }
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(`Action failed: ${error.message}\n${error.stack ?? ''}`);
    } else {
      core.setFailed(`An unknown error occurred: ${String(error)}`);
    }
  }
}
