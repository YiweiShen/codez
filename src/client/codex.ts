import { execa } from 'execa'; // Changed from execaSync
import * as core from '@actions/core';
import { ActionConfig } from '../config/config.js';

/**
 * Executes the Codex CLI command.
 * @param workspace The directory to run the command in.
 * @param config The ActionConfig object containing API keys and configuration.
 * @param prompt The user prompt
 * @param timeout Timeout in milliseconds.
 * @returns A promise resolving to the stdout from the Codex CLI. // Changed return type description
 */
export async function runCodex(workspace: string, config: ActionConfig, prompt: string, timeout: number): Promise<string> { // Added async and Promise<>
  core.info(`Executing Codex CLI in ${workspace} with timeout ${timeout}ms`);
  try {
    prompt = prompt.replace(/"/g, '\\"');
    const cliArgs = ['--full-auto', '--dangerously-auto-approve-everything', '--quiet', '"' + prompt + '"'];

    // Set up environment variables
    const envVars: Record<string, string> = {
      ...process.env,
      OPENAI_API_KEY: config.openaiApiKey,
      OPENAI_API_BASE_URL: config.openaiBaseUrl,
      CODEX_QUIET_MODE: '1',
    };

    core.info(`Run command: codex ${cliArgs.join(' ')}`);
    // Changed execaSync to await execa
    const result = await execa(
      'codex', // Assuming 'codex' is in the PATH
      cliArgs,
      {
        timeout: timeout,
        cwd: workspace,
        env: envVars,
        stdio: 'pipe', // Capture stdout/stderr
        reject: false // Don't throw on non-zero exit code, handle it below
      }
    );

    core.info(`Codex CLI exited with code ${result.exitCode}`);

    // Adjusted error handling for async execa and stderr presence
    if (result.stderr) {
      // Log stderr even if exit code is 0, but only throw if non-zero
      if (result.exitCode !== 0) {
        core.error(`Codex command failed with stderr. Exit code: ${result.exitCode}, stderr: ${result.stderr}`);
        throw new Error(`Codex command failed with exit code ${result.exitCode}. Stderr: ${result.stderr}`);
      } else {
        core.warning(`Codex command exited successfully but produced stderr: ${result.stderr}`);
      }
    }

    if (result.failed || result.exitCode !== 0) {
      core.error(`Codex command failed. Exit code: ${result.exitCode}, stdout: ${result.stdout}`);
      const errorMessage = result.stderr ? `Stderr: ${result.stderr}` : `Stdout: ${result.stdout}`; // Use already captured stderr if available
      throw new Error(`Codex command failed with exit code ${result.exitCode}. ${errorMessage}`);
    }

    core.info('Codex command executed successfully.');

    // stdout parse
    const codeResult = `\`\`\`\n${result.stdout}\n\`\`\``;

    const lastLine = codeResult.split('\n').slice(-2, -1)[0];
    const jsonResult = JSON.parse(lastLine);
    let textResult = '';
    if (jsonResult && jsonResult.type === 'message' && jsonResult.content && jsonResult.content.length > 0) {
      textResult = jsonResult.content[0].text + '\n\n';
    }

    return textResult + "<details><summary>Codex Result</summary>\n" + codeResult + "\n</details>";

  } catch (error) {
    // Log the full error for debugging, check for timeout
    core.error(`Error executing Codex command: ${error instanceof Error ? error.stack : String(error)}`);
    if (error instanceof Error && 'timedOut' in error && (error as any).timedOut) {
      throw new Error(`Codex command timed out after ${timeout}ms.`);
    }
    throw new Error(`Failed to execute Codex command: ${error instanceof Error ? error.message : String(error)}`);
  }
}
