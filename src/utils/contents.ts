/**
 * Content formatting utilities module.
 *
 * Provides functions to generate formatted content strings for GitHub comments.
 */

/** Author login string for GitHub Actions bot. */
const GITHUB_ACTIONS_BOT_LOGIN = 'github-actions[bot]';

/**
 * Represents a GitHub comment with body text and author login.
 */
export interface CommentContent {
  /** Raw body text of the comment. */
  body: string;
  /** Author login of the comment (e.g., "github-actions[bot]"). */
  login: string;
}

/**
 * Prefixes each line of the input text with "> ".
 *
 * @param text - The text to quote.
 * @returns Quoted text with each line prefixed by "> ".
 */
function quoteLines(text: string): string {
  return text
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
}

/**
 * Quote the comment body if it was authored by the GitHub Actions bot.
 *
 * @param comment - Comment to process.
 * @returns Quoted body string with each line prefixed by "> " and two trailing newlines,
 * or empty string if the body is empty or not authored by the GitHub Actions bot.
 */
export function genContentsString({ body, login }: CommentContent): string {
  const trimmed = body.trim();
  if (!trimmed || login.trim() !== GITHUB_ACTIONS_BOT_LOGIN) {
    return '';
  }
  return `${quoteLines(trimmed)}\n\n`;
}

/**
 * Generate a fully quoted content string.
 *
 * Prefixes each line of the body with "> " and retains all content.
 *
 * @param comment - Comment to process.
 * @returns Fully quoted body string with two trailing newlines or empty string if the body is empty.
 */
export function genFullContentsString({ body }: CommentContent): string {
  const trimmed = body.trim();
  if (!trimmed) {
    return '';
  }
  return `${quoteLines(trimmed)}\n\n`;
}
