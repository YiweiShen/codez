import * as core from '@actions/core';
import { getConfig } from './config.js';
import { processEvent } from './event.js';
import { runAction } from './action.js';

/**
 * Main function for the GitHub Action.
 */
export async function run(): Promise<void> {
  try {
    // 1. Get Configuration
    const config = getConfig();

    // 2. Process Event
    const processedEvent = processEvent(config);

    // 3. Execute Action Logic or Handle Edge Cases
    if (!processedEvent) {
      return;
    }

    // Event is valid and prompt exists, run the main action logic
    await runAction(config, processedEvent);

  } catch (error) {
    // Catch errors from anywhere in the run function
    if (error instanceof Error) {
      core.setFailed(`Action failed: ${error.message}\n${error.stack}`);
    } else {
      core.setFailed(`An unknown error occurred: ${error}`);
    }
  }
}
