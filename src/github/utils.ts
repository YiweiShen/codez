import * as core from '@actions/core';

/**
 * Infer a branch type keyword from a commit message header.
 */
export function getBranchType(commitMessage: string): string {
  const cm = commitMessage.toLowerCase();
  if (/^(add|create|implement|introduce)/.test(cm)) return 'feat';
  if (/^(fix|correct|resolve|patch|repair)/.test(cm)) return 'fix';
  if (/(docs?|documentation)/.test(cm)) return 'docs';
  if (/^(style|format|lint)/.test(cm)) return 'styles';
  return 'chore';
}

/**
 * Convert text into a URL-friendly slug.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Truncate output if it exceeds GitHub's body size limits.
 */
export function truncateOutput(output: string): string {
  if (output.length > 60000) {
    core.warning(`Output exceeds 60000 characters, truncating...`);
    return output.substring(0, 60000);
  }
  return output;
}
