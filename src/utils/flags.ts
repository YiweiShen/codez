/**
 * @file Utility for parsing boolean flags from input strings.
 *
 * Provides functions to parse flags and return remaining content.
 */
export interface ParsedFlags<T extends string = string> {
  /** Map of flag names to boolean indicating presence. */
  flags: Record<T, boolean>;
  /** Remaining input string after removing flags. */
  rest: string;
}

/**
 * Parses the input string for boolean flags and returns the remaining content.
 *
 * @param input - The input string containing flags and content.
 * @param flagNames - Array of flag names (without leading dashes) to parse.
 * @returns An object with a flags map and the remaining content string.
 */
export function parseFlags<T extends string>(
  input: string,
  flagNames: readonly T[],
): ParsedFlags<T> {
  const tokens = input.split(/\s+/).filter(Boolean);
  const flagSet = new Set(flagNames);
  const flags = Object.fromEntries(
    flagNames.map((name) => [name, false]),
  ) as Record<T, boolean>;
  const restTokens: string[] = [];

  for (const token of tokens) {
    if (token.startsWith('--')) {
      const name = token.slice(2) as T;
      if (flagSet.has(name)) {
        flags[name] = true;
        continue;
      }
    }
    restTokens.push(token);
  }

  return { flags, rest: restTokens.join(' ') };
}

/** Options for prompt flag parsing. */
export interface PromptFlagOptions {
  includeFullHistory: boolean;
  createIssues: boolean;
  noPr: boolean;
  includeFixBuild: boolean;
  includeFetch: boolean;
  prompt: string;
}

const DIRECT_FLAGS = ['fix-build', 'fetch'] as const;
const TRIGGER_FLAGS = [
  'full-history',
  'create-issues',
  'no-pr',
  'fix-build',
  'fetch',
] as const;

/**
 * Extracts prompt flags and remaining prompt text for direct or trigger-based prompts.
 *
 * @param input - The raw input string containing flags and prompt text.
 * @param isDirect - Whether this is a direct prompt (true) or trigger-based (false).
 * @returns Parsed prompt options and cleaned prompt text.
 */
export function extractPromptFlags(
  input: string,
  isDirect: boolean,
): PromptFlagOptions {
  const flagNames = isDirect ? DIRECT_FLAGS : TRIGGER_FLAGS;
  const { flags, rest } = parseFlags(input, flagNames);

  const {
    'full-history': includeFullHistory = false,
    'create-issues': createIssues = false,
    'no-pr': noPr = false,
    'fix-build': includeFixBuild = false,
    fetch: includeFetch = false,
  } = flags;

  return {
    includeFullHistory,
    createIssues,
    noPr,
    includeFixBuild,
    includeFetch,
    prompt: rest,
  };
}
