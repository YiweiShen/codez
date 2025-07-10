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
 *
 * @param input - The input string containing flags and content.
 * @param flagNames - Array of flag names (without leading dashes) to parse.
 * @returns An object with flags map and remaining content string.
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
