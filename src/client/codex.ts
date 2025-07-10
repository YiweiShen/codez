/**
 * @file Codex CLI integration module.
 * Provides a function to invoke the Codex CLI tool with configured parameters
 * and return its output.
 */

import * as core from '@actions/core';

import { execa } from 'execa';

import type { ActionConfig } from '../config/config.js';
import { CliError, TimeoutError } from '../utils/errors.js';

/**
 * Invoke the Codex CLI with the specified parameters.
 * @param workspace - Directory in which to run the Codex CLI.
 * @param config - Configuration containing API keys and environment settings.
 * @param prompt - User-provided prompt string for Codex.
 * @param timeout - Maximum time in milliseconds to wait for the CLI to complete.
 * @param [images] - Optional array of image file paths to include in the invocation.
 * @returns A promise resolving to the formatted output from Codex.
 */

/**
 *
 * @param workspace
 * @param config
 * @param prompt
 * @param timeout
 * @param images
 */

/**
 *
 * @param workspace
 * @param config
 * @param prompt
 * @param timeout
 * @param images
 */

/**
 *
 * @param workspace
 * @param config
 * @param prompt
 * @param timeout
 * @param images
 */
export async function runCodex(
  workspace: string,
  config: ActionConfig,
  prompt: string,
  timeout: number,
  images: string[] = [],
): Promise<string> {
  core.info(`Executing Codex CLI in ${workspace} with timeout ${timeout}ms`);
  try {
    // Build CLI arguments (let execa handle argument quoting)
    const cliArgs: string[] = [];
    // Include image flags if provided
    if (images.length > 0) {
      for (const imgPath of images) {
        cliArgs.push('-i', imgPath);
      }
    }
    // Model and auto flags
    cliArgs.push('--model', config.openaiModel);
    cliArgs.push(
      'exec', // headless
      '--dangerously-bypass-approvals-and-sandbox',
      prompt,
    );

    // Set up environment variables
    const envVars: Record<string, string> = {
      ...process.env,
      OPENAI_API_KEY: config.openaiApiKey,
      CODEX_QUIET_MODE: '1',
      ...config.codexEnv,
    };
    if (config.openaiBaseUrl) {
      envVars.OPENAI_API_BASE_URL = config.openaiBaseUrl;
    }

    core.info(`Run command: codex ${cliArgs.join(' ')}`);
    const result = await execa(
      'codex', // Assuming 'codex' is in the PATH
      cliArgs,
      {
        timeout: timeout,
        cwd: workspace,
        env: envVars,
        stdio: 'pipe', // Capture stdout/stderr
        reject: false, // Don't throw on non-zero exit code, handle it below
      },
    );

    core.info(`Codex CLI exited with code ${result.exitCode}`);

    // Adjusted error handling for async execa and stderr presence
    if (result.stderr) {
      // Log stderr even if exit code is 0, but only throw if non-zero
      if (result.exitCode !== 0) {
        core.error(
          `Codex command failed with stderr. Exit code: ${result.exitCode}, stderr: ${result.stderr}`,
        );
        throw new CliError(
          `Codex command failed with exit code ${result.exitCode}. Stderr: ${result.stderr}`,
        );
      } else {
        core.warning(
          `Codex command exited successfully but produced stderr: ${result.stderr}`,
        );
      }
    }

    if (result.failed || result.exitCode !== 0) {
      core.error(
        `Codex command failed. Exit code: ${result.exitCode}, stdout: ${result.stdout}`,
      );
      const errorMessage = result.stderr
        ? `Stderr: ${result.stderr}`
        : `Stdout: ${result.stdout}`; // Use already captured stderr if available
      throw new CliError(
        `Codex command failed with exit code ${result.exitCode}. ${errorMessage}`,
      );
    }

    core.info('Codex command executed successfully.');

    // stdout parse
    const codeResult = `\`\`\`\n${result.stdout}\n\`\`\``;
    // core.info(`Codex output:\n${codeResult}`);

    const lines = codeResult.split('\n');

    // Find all timestamp line indices
    const timestampRegex = /^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}]/;
    const timestampIndices = lines
      .map((line, index) => (timestampRegex.test(line) ? index : -1))
      .filter((index) => index !== -1);

    if (timestampIndices.length < 2) {
      throw new Error('Not enough timestamped blocks found in Codex output.');
    }

    // Get range for second-last timestamp block
    const startIndex = timestampIndices[timestampIndices.length - 2];
    const endIndex = timestampIndices[timestampIndices.length - 1];

    const blockLines = lines.slice(startIndex + 1, endIndex);
    const textResult = blockLines.join('\n').trim();

    // core.info(`Extracted second-last block:\n${textResult}`);

    return textResult;
  } catch (error) {
    // Log the full error for debugging
    core.error(
      `Error executing Codex command: ${
        error instanceof Error ? error.stack : String(error)
      }`,
    );
    if (
      error instanceof Error &&
      error.message.startsWith('Failed to parse JSON output')
    ) {
      throw error;
    }
    if (
      error instanceof Error &&
      'timedOut' in error &&
      // Cast through a typed interface to avoid untyped any
      (error as { timedOut?: boolean }).timedOut
    ) {
      throw new TimeoutError(`Codex command timed out after ${timeout}ms.`);
    }
    throw new CliError(
      `Failed to execute Codex command: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
