/**
 * @file Configuration for prompts used in the Codex CLI and OpenAI integration.
 */

/**
 * System prompt for generating Conventional Commits-style commit messages.
 * Loaded from an external template file for easier maintenance and syntax highlighting.
 */

export { default as conventionalCommitsSystemPrompt } from './promptTemplates/conventionalCommitsSystemPrompt.mustache';

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
