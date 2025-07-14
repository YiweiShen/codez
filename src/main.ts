/**
 * @file Core orchestration and workflow logic for the GitHub Action.
 * This module initializes configuration, processes events, checks permissions,
 * and triggers the main action logic.
 */

import * as core from '@actions/core';

import { getConfig } from './config/config.js';
import { getOpenAIClient } from './api/openai.js';
import { runAction } from './github/action.js';

import { processEvent } from './github/event.js';
import { postComment } from './github/github.js';

import { checkPermission } from './security/security.js';

/**
 * Orchestrate the action's workflow.
 *
 * Retrieves configuration, processes the event, checks permissions,
 * and executes the main action logic.
 * @returns A promise that resolves when the action completes.
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
      const errMsg = error instanceof Error ? error.message : String(error);
      const failureMessage =
        `OPENAI_API_KEY invalid or no access to model "${config.openaiModel}": ${errMsg}`;
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
            commentError instanceof Error ? commentError.message : String(commentError)
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

    // Event is valid and prompt exists, run the main action logic
    await runAction(config, processedEvent);
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(`Action failed: ${error.message}\n${error.stack ?? ''}`);
    } else {
      core.setFailed(`An unknown error occurred: ${String(error)}`);
    }
  }
}
