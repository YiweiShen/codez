/**
 * Utility functions for branch naming, slug generation, and output truncation.
 */
import * as core from '@actions/core';

/** Maximum allowed length for GitHub output bodies. */
const MAX_OUTPUT_LENGTH = 60_000;

/** Patterns mapping for inferring branch types from commit messages. */
const BRANCH_TYPE_PATTERNS: { type: BranchType; pattern: RegExp }[] = [
  { type: 'feat', pattern: /^(add|create|implement|introduce)/ },
  { type: 'fix', pattern: /^(fix|correct|resolve|patch|repair)/ },
  { type: 'docs', pattern: /(docs?|documentation)/ },
  { type: 'styles', pattern: /^(style|format|lint)/ },
];

/** Regex for replacing non-alphanumeric characters in slugs. */
const NON_ALPHANUMERIC_REGEX = /[^a-z0-9]+/g;
/** Regex to trim leading and trailing dashes in slugs. */
const TRIM_DASHES_REGEX = /^-+|-+$/g;

/** Supported branch types inferred from commit messages. */
export type BranchType = 'feat' | 'fix' | 'docs' | 'styles' | 'chore';

/**
 * Infer a conventional branch type keyword from a commit message header.
 * @param commitMessage - The commit message to analyze.
 * @returns A branch type: 'feat', 'fix', 'docs', 'styles', or 'chore'.
 */
export function getBranchType(commitMessage: string): BranchType {
  const message = commitMessage.toLowerCase();
  const match = BRANCH_TYPE_PATTERNS.find(({ pattern }) => pattern.test(message));
  return match?.type ?? 'chore';
}

/**
 * Convert text into a URL-friendly slug.
 * @param text - The input text to slugify.
 * @returns A lowercase, alphanumeric-and-dash-only slug.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(NON_ALPHANUMERIC_REGEX, '-')
    .replace(TRIM_DASHES_REGEX, '');
}

/**
 * Truncate a string if it exceeds GitHub's maximum body length, logging a warning.
 * @param output - The text to potentially truncate.
 * @param maxLength - Optional maximum length (default: MAX_OUTPUT_LENGTH).
 * @returns The original or truncated string.
 */
export function truncateOutput(
  output: string,
  maxLength: number = MAX_OUTPUT_LENGTH,
): string {
  if (output.length <= maxLength) {
    return output;
  }

  core.warning(`Output exceeds ${maxLength} characters; truncating to ${maxLength}.`);
  return output.slice(0, maxLength);
}
