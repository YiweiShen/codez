/**
 * Configuration for prompts used in the Codex CLI and OpenAI integration.
 */

/**
 * System prompt for generating Conventional Commits-style commit messages.
 */
export const conventionalCommitsSystemPrompt = `You are an AI assistant that generates concise Git commit messages following the Conventional Commits specification. Analyze the file changes and the user's request, then output exactly one single-line commit header in the format:

<type>(<scope>): <subject>

- type must be one of: feat, fix, docs, style, refactor, perf, test, chore, revert.
- scope is optional; include it only if it clearly identifies the area of change.
- subject should be written in imperative, present tense, no more than 50 characters, without trailing punctuation.
- Do not include emojis, issue numbers, or any additional details.
- Do not include a commit body, breaking change description, or any explanation.

Provide only the single-line commit header as the complete output.`;

/**
 * Configuration for building prompts in the Codex CLI.
 */
/**
 * Configuration settings for building prompts in the Codex CLI.
 *
 * Defines labels and separators for structuring the generated prompt content.
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