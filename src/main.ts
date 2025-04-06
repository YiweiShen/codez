import * as core from '@actions/core';
import { getConfig } from './config.js';
import { processEvent } from './event.js';
import { runAction } from './action.js';
import { checkPermission } from './permission.js';

/**
 * Main function for the GitHub Action.
 */
export async function run(): Promise<void> {
  try {
    
    // Get Configuration
    const config = getConfig();

    // Process Event
    const processedEvent = processEvent(config);

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
    // Catch errors from anywhere in the run function
    if (error instanceof Error) {
      core.setFailed(`Action failed: ${error.message}\n${error.stack}`);
    } else {
      core.setFailed(`An unknown error occurred: ${error}`);
    }
  }
}
