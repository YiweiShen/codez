import { execaSync } from 'execa';
import * as core from '@actions/core';

/**
 * Executes the Claude Code CLI command.
 * @param workspace The directory to run the command in.
 * @param apiKey Anthropic API Key.
 * @param prompt The user prompt for Claude Code.
 * @param timeout Timeout in milliseconds.
 * @returns The stdout from the Claude Code CLI.
 */
export function runClaudeCode(workspace: string, apiKey: string, prompt: string, timeout: number): string {
    core.info(`Executing Claude Code CLI in ${workspace} with timeout ${timeout}ms`);
    try {
      // Ensure API key and prompt are securely passed and handled
      // Consider security implications of passing prompts directly if they contain sensitive info.
      const result = execaSync(
          'claude', // Assuming 'claude' is in the PATH
          ['-p', prompt, '--allowedTools', 'Bash,Edit,Write,Replace'],
          {
              // shell: '/bin/zsh', // Avoid specifying shell unless necessary; execa handles PATH resolution
              timeout: timeout,
              cwd: workspace,
              env: { ...process.env, ANTHROPIC_API_KEY: apiKey }, // Pass API key via environment variable
              stdio: 'pipe', // Capture stdout/stderr
              reject: false // Don't throw on non-zero exit code, handle it below
          }
      );
  
      core.info(`Claude Code CLI exited with code ${result.exitCode}`);
  
      if (result.stderr) {
        core.warning(`Claude Code command stderr: ${result.stderr}`);
        // Check for specific errors like credit balance
        if (result.stderr.includes('Credit balance is too low')) {
            throw new Error('Credit balance is too low');
        }
        throw new Error(`${result.stderr}`);
      }
  
      if (result.failed || result.exitCode !== 0) {
          core.error(`Claude Code command failed. Exit code: ${result.exitCode}, stdout: ${result.stdout}, stderr: ${result.stderr}`);
          throw new Error(`Claude Code command failed with exit code ${result.exitCode}. Check logs for details.`);
      }
  
      core.info('Claude Code command executed successfully.');
      return result.stdout || ''; // Return stdout, ensuring it's a string
  
    } catch (error) {
      // Log the full error for debugging
      core.error(`Error executing Claude Code command: ${error instanceof Error ? error.stack : String(error)}`);
  
      // Provide a clearer error message for the action failure
      if (error instanceof Error && error.message.includes('Credit balance is too low')) {
          // Already handled by setFailed above, just re-throw
           throw error;
      } else {
          throw new Error(`Failed to execute Claude Code command: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  