/**
 * @file Prompt utilities module.
 *
 * Extracts flags and remaining prompt text from user input.
 */

import { parseFlags } from './flags.js';

/**
 * @interface PromptFlagOptions
 * @property {boolean} includeFullHistory Include full conversation history
 * @property {boolean} createIssues Create issues based on the output
 * @property {boolean} noPr Do not open a pull request
 * @property {boolean} includeFixBuild Include latest failed CI build logs
 * @property {boolean} includeFetch Fetch and include known URLs referenced
 * in the prompt
 * @property {string} prompt Remaining prompt text after flags
 */

export interface PromptFlagOptions {
  includeFullHistory: boolean;
  createIssues: boolean;
  noPr: boolean;
  includeFixBuild: boolean;
  includeFetch: boolean;
  prompt: string;
}

/**
 * Extract prompt flags and remaining prompt text for direct or trigger-based
 * prompts.
 * @param {string} input The raw input string containing flags and prompt
 * text.
 * @param {boolean} isDirect Whether this is a direct prompt (true) or
 * trigger-based (false).
 * @returns {PromptFlagOptions} Parsed prompt options and cleaned prompt text.
 */

/**
 *
 * @param input
 * @param isDirect
 */

/**
 *
 * @param input
 * @param isDirect
 */

/**
 *
 * @param input
 * @param isDirect
 */

/**
 *
 */
export function extractPromptFlags(
  input: string,
  isDirect: boolean,
): PromptFlagOptions {
  const flagNames = isDirect
    ? ['fix-build', 'fetch']
    : ['full-history', 'create-issues', 'no-pr', 'fix-build', 'fetch'];
  const { flags, rest } = parseFlags(input, flagNames);

  return {
    includeFullHistory: !!flags['full-history'],
    createIssues: !!flags['create-issues'],
    noPr: !!flags['no-pr'],
    includeFixBuild: !!flags['fix-build'],
    includeFetch: !!flags['fetch'],
    prompt: rest,
  };
}
