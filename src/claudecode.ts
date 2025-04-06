import { execaSync } from 'execa';
import * as core from '@actions/core';

/**
 * Executes the Claude CLI command.
 * @param workspace The directory to run the command in.
 * @param apiKey Anthropic API Key.
 * @param prompt The user prompt for Claude.
 * @param timeout Timeout in milliseconds.
 * @returns The stdout from the Claude CLI.
 */
export function runClaudeCode(workspace: string, apiKey: string, prompt: string, timeout: number): string {
    core.info(`Executing Claude CLI in ${workspace} with timeout ${timeout}ms`);
    try {
      // Ensure API key and prompt are securely passed and handled
      // Consider security implications of passing prompts directly if they contain sensitive info.
      const claudeResult = execaSync(
          'claude', // Assuming 'claude' is in the PATH
          ['-p', prompt, '--allowedTools', 'Bash,Edit,Write'],
          {
              // shell: '/bin/zsh', // Avoid specifying shell unless necessary; execa handles PATH resolution
              timeout: timeout,
              cwd: workspace,
              env: { ...process.env, ANTHROPIC_API_KEY: apiKey }, // Pass API key via environment variable
              stdio: 'pipe', // Capture stdout/stderr
              reject: false // Don't throw on non-zero exit code, handle it below
          }
      );
  
      core.info(`Claude CLI exited with code ${claudeResult.exitCode}`);
  
      if (claudeResult.stderr) {
        core.warning(`Claude command stderr: ${claudeResult.stderr}`);
        // Check for specific errors like credit balance
        if (claudeResult.stderr.includes('Credit balance is too low')) {
            throw new Error('Credit balance is too low');
        }
        throw new Error(`${claudeResult.stderr}`);
      }
  
      if (claudeResult.failed || claudeResult.exitCode !== 0) {
          core.error(`Claude command failed. Exit code: ${claudeResult.exitCode}, stdout: ${claudeResult.stdout}, stderr: ${claudeResult.stderr}`);
          throw new Error(`Claude command failed with exit code ${claudeResult.exitCode}. Check logs for details.`);
      }
  
      core.info('Claude command executed successfully.');
      return claudeResult.stdout || ''; // Return stdout, ensuring it's a string
  
    } catch (error) {
      // Log the full error for debugging
      core.error(`Error executing claude command: ${error instanceof Error ? error.stack : String(error)}`);
  
      // Provide a clearer error message for the action failure
      if (error instanceof Error && error.message.includes('Credit balance is too low')) {
          // Already handled by setFailed above, just re-throw
           throw error;
      } else {
          throw new Error(`Failed to execute claude command: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  