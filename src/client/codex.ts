/**
 * @file Codex CLI integration module.
 * Provides a function to invoke the Codex CLI tool with configured parameters
 * and return its output.
 */

import * as core from '@actions/core';

import { execa } from 'execa';

import type { ExecaError } from 'execa';
import type { ActionConfig } from '../config/config';
import { CliError, TimeoutError } from '../utils/errors';

/**
 * Invoke the Codex CLI with the specified parameters.
 * @param workspace - Directory in which to run the Codex CLI.
 * @param config - Configuration containing API keys and environment settings.
 * @param prompt - User-provided prompt string for Codex.
 * @param timeout - Maximum time in milliseconds to wait for the CLI to complete.
 * @param [images] - Optional array of image file paths to include in the invocation.
 * @returns A promise resolving to the formatted output from Codex.
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

    // Parse JSON output from Codex stdout
    const stdoutLines = result.stdout.split('\n');
    const jsonLine = stdoutLines.find((l) => {
      const t = l.trim();
      return t.startsWith('{') || t.startsWith('[');
    });
    if (!jsonLine) {
      throw new Error('Failed to parse JSON output from Codex: JSON not found in stdout');
    }
    let parsed: any;
    try {
      parsed = JSON.parse(jsonLine);
    } catch (e) {
      throw new Error(
        `Failed to parse JSON output from Codex: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
    if (!parsed || !Array.isArray(parsed.content)) {
      throw new Error(
        'Failed to parse JSON output from Codex: Invalid JSON structure',
      );
    }
    const texts = parsed.content.map((item: any) => item.text);
    const textResult = texts.join('\n\n') + '\n\n';
    return textResult;
  } catch (error: unknown) {
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
    const isExecaError = (e: unknown): e is ExecaError =>
      e instanceof Error && 'timedOut' in e;
    if (isExecaError(error) && error.timedOut) {
      throw new TimeoutError(`Codex command timed out after ${timeout}ms.`);
    }
    throw new CliError(
      `Failed to execute Codex command: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
