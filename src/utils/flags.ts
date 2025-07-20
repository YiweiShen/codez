/**
 * @file Utility for parsing boolean flags from input strings.
 *
 * Provides functions to parse flags and return remaining content.
 */

export interface ParsedFlags {

  /**
   * Map of flag names to boolean indicating presence.
   */

  flags: Record<string, boolean>;

  /**
   * Remaining input string after removing flags.
   */

  rest: string;
}

/**
 * Parses the input string for boolean flags and returns the remaining content.
 * @param {string} input - The input string containing flags and content.
 * @param {string[]} flagNames - Array of flag names (without leading dashes) to parse.
 * @returns {ParsedFlags} An object with flags map and remaining content string.
 */

/**
 *
 * @param input
 * @param flagNames
 */

/**
 *
 * @param input
 * @param flagNames
 */

/**
 *
 * @param input
 * @param flagNames
 */

/**
 *
 * @param input
 * @param flagNames
 */

/**
 *
 * @param input
 * @param flagNames
 */

/**
 *
 * @param input
 * @param flagNames
 */

/**
 *
 */
export function parseFlags(input: string, flagNames: string[]): ParsedFlags {
  const tokens = input.split(/\s+/).filter(Boolean);
  const flags: Record<string, boolean> = {};
  flagNames.forEach((name) => {
    flags[name] = false;
  });
  const restTokens: string[] = [];
  for (const token of tokens) {
    if (token.startsWith('--')) {
      const name = token.slice(2);
      if (flagNames.includes(name)) {
        flags[name] = true;
        continue;
      }
    }
    restTokens.push(token);
  }
  return { flags, rest: restTokens.join(' ') };
}

/**
 * Options for prompt flag parsing.
 */

export interface PromptFlagOptions {

  /** Include full conversation history */

  includeFullHistory: boolean;

  /** Create issues based on the output */

  createIssues: boolean;

  /** Do not open a pull request */

  noPr: boolean;

  /** Include latest failed CI build logs */

  includeFixBuild: boolean;

  /** Fetch and include contents from known URLs */

  includeFetch: boolean;

  /** Remaining prompt text after flags */

  prompt: string;
}

/**
 * Extract prompt flags and remaining prompt text for direct or trigger-based prompts.
 * @param input The raw input string containing flags and prompt text.
 * @param isDirect Whether this is a direct prompt (true) or trigger-based (false).
 * @returns Parsed prompt options and cleaned prompt text.
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
