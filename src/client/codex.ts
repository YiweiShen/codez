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
 * Build command-line arguments for Codex CLI invocation.
 */
function buildCliArgs(
  prompt: string,
  model: string,
  images: string[],
): string[] {
  const imageArgs = images.flatMap((img) => ['-i', img]);
  return [
    ...imageArgs,
    '--model',
    model,
    'exec',
    '--dangerously-bypass-approvals-and-sandbox',
    prompt,
  ];
}

/**
 * Build environment variables for Codex CLI process.
 */
function buildEnvVars(config: ActionConfig): NodeJS.ProcessEnv {
  const { openaiApiKey, openaiBaseUrl, codexEnv } = config;
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    OPENAI_API_KEY: openaiApiKey,
    CODEX_QUIET_MODE: '1',
    ...codexEnv,
  };
  if (openaiBaseUrl) {
    env.OPENAI_API_BASE_URL = openaiBaseUrl;
  }
  return env;
}

/**
 * Extract the text block between the second-last and last timestamped lines in stdout.
 */
function extractCodexOutput(stdout: string): string {
  const lines = stdout.split('\n');
  const timestampRegex = /^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}]/;
  const indices = lines.reduce<number[]>((acc, line, idx) => {
    if (timestampRegex.test(line)) {
      acc.push(idx);
    }
    return acc;
  }, []);
  if (indices.length < 2) {
    throw new Error('Not enough timestamped blocks found in Codex output.');
  }
  const start = indices[indices.length - 2];
  const end = indices[indices.length - 1];
  return lines
    .slice(start + 1, end)
    .join('\n')
    .trim();
}

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
  const cliArgs = buildCliArgs(prompt, config.openaiModel, images);
  const envVars = buildEnvVars(config);

  core.info(`Executing Codex CLI in ${workspace} with timeout ${timeout}ms`);

  try {
    core.info(`Run command: codex ${cliArgs.join(' ')}`);
    const result = await execa('codex', cliArgs, {
      timeout,
      cwd: workspace,
      env: envVars,
      stdio: 'pipe',
      reject: false,
    });

    core.info(`Codex CLI exited with code ${result.exitCode}`);

    if (result.stderr && result.exitCode !== 0) {
      core.error(
        `Codex command failed with stderr. Exit code: ${result.exitCode}, stderr: ${result.stderr}`,
      );
      throw new CliError(
        `Codex command failed with exit code ${result.exitCode}. Stderr: ${result.stderr}`,
      );
    } else if (result.stderr) {
      core.warning(
        `Codex command exited successfully but produced stderr: ${result.stderr}`,
      );
    }

    if (result.failed || result.exitCode !== 0) {
      core.error(
        `Codex command failed. Exit code: ${result.exitCode}, stdout: ${result.stdout}`,
      );
      throw new CliError(
        `Codex command failed with exit code ${result.exitCode}. ${
          result.stderr
            ? `Stderr: ${result.stderr}`
            : `Stdout: ${result.stdout}`
        }`,
      );
    }

    core.info('Codex command executed successfully.');

    return extractCodexOutput(result.stdout);
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
    if (error instanceof Error && (error as ExecaError).timedOut) {
      throw new TimeoutError(`Codex command timed out after ${timeout}ms.`);
    }
    throw new CliError(
      `Failed to execute Codex command: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
