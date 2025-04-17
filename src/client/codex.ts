import { execaSync } from 'execa';
import * as core from '@actions/core';
import { ActionConfig } from '../config.js';

/**
 * Executes the Codex CLI command.
 * @param workspace The directory to run the command in.
 * @param config The ActionConfig object containing API keys and configuration.
 * @param prompt The user prompt
 * @param timeout Timeout in milliseconds.
 * @returns The stdout from the Codex CLI.
 */
export function runCodex(workspace: string, config: ActionConfig, prompt: string, timeout: number): string {
    core.info(`Executing Codex CLI in ${workspace} with timeout ${timeout}ms`);
    try {
      const cliArgs = ['--full-auto', '--dangerously-auto-approve-everything', '--quiet', prompt];
      
      // Set up environment variables
      const envVars: Record<string, string> = { 
        ...process.env, 
        OPENAI_API_KEY: config.openaiApiKey,
        OPENAI_API_BASE_URL: config.openaiBaseUrl,
      };
        
      const result = execaSync(
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
  
      if (result.stderr) {
        throw new Error(`${result.stderr}`);
      }
  
      if (result.failed || result.exitCode !== 0) {
          core.error(`Codex command failed. Exit code: ${result.exitCode}, stdout: ${result.stdout}, stderr: ${result.stderr}`);
          throw new Error(`Codex command failed with exit code ${result.exitCode}. Check logs for details.`);
      }
  
      core.info('Codex command executed successfully.');
      return result.stdout || ''; // Return stdout, ensuring it's a string
  
    } catch (error) {
      // Log the full error for debugging
      core.error(`Error executing Codex command: ${error instanceof Error ? error.stack : String(error)}`);
      throw new Error(`Failed to execute Claude Code command: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
