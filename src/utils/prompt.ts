import { parseFlags } from './flags.js';

export interface PromptFlagOptions {
  /** Include full conversation history */
  includeFullHistory: boolean;
  /** Create issues based on the output */
  createIssues: boolean;
  /** Do not open a pull request */
  noPr: boolean;
  /** Include latest failed CI build logs */
  includeFixBuild: boolean;
  /** Fetch and include known URLs referenced in the prompt */
  includeFetch: boolean;
  /** Remaining prompt text after flags */
  prompt: string;
}

/**
 * Extract prompt flags and remaining prompt text for direct or trigger-based prompts.
 * @param input - The raw input string containing flags and prompt text.
 * @param isDirect - Whether this is a direct prompt (true) or trigger-based (false).
 * @returns Parsed prompt options and cleaned prompt text.
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