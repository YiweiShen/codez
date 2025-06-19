/**
 * Configuration for prompts used in the Codex CLI and OpenAI integration.
 */

/**
 * System prompt for generating Conventional Commits-style commit messages.
 */
export const conventionalCommitsSystemPrompt = `Based on the following file changes and user request, generate a concise and clear Git commit message following the Conventional Commits format:
<type>(<scope>): <short description>

Where type is one of: feat, fix, docs, style, refactor, perf, test, chore.
The summary (short description) should be 50 characters or less and should not include any additional text or line breaks.`;

/**
 * Configuration for building prompts in the Codex CLI.
 */
export interface PromptBuilderConfig {
  /** Label used for the title section */
  titleLabel: string;
  /** Label used for the history section */
  historyLabel: string;
  /** Label used for the context section */
  contextLabel: string;
  /** Label used for the changed files section */
  changedFilesLabel: string;
  /** Separator inserted before the user prompt */
  promptSeparator: string;
}

/**
 * Default configuration for the prompt builder.
 */
export const promptBuilderConfig: PromptBuilderConfig = {
  titleLabel: '[Title]',
  historyLabel: '[History]',
  contextLabel: '[Context]',
  changedFilesLabel: '[Changed Files]',
  promptSeparator: '---',
};