/**
 * Entry point for the GitHub Action runner.
 * Imports and executes the main orchestration logic, ensuring proper error handling.
 */

import * as core from '@actions/core';
import { run } from './main';

/**
 * Executes the main action logic and handles any uncaught errors.
 */
async function main(): Promise<void> {
  try {
    await run();
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

// Invoke the main execution workflow
void main();
