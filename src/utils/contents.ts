/**
 * @file Content formatting utilities module.
 * Provides functions to generate formatted content strings for GitHub comments.
 */
/**
 * Generate a quoted content string for bot comments.
 *
 * Prefixes each line of the body with "> " if the author is the GitHub Actions bot.
 * @param content - Object containing body text and user login.
 * @returns Quoted body string for bot comments or empty string otherwise.
 */
/**
 * Represents a GitHub comment with body text and author login.
 */

interface CommentContent {
  /** Raw body text of the comment. */

  body: string;

  /** Author login of the comment (e.g., "github-actions[bot]"). */

  login: string;
}

/**
 * Quote the comment body if authored by the GitHub Actions bot.
 * @param comment - Comment to process.
 * @returns Quoted body string with each line prefixed by "> ", or empty string.
 */

export function genContentsString(comment: CommentContent): string {
  const body = comment.body.trim();
  if (!body || comment.login.trim() !== 'github-actions[bot]') {
    return '';
  }
  const quoted = body
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
  return quoted + '\n\n';
}

/**
 * Generate a fully quoted content string.
 *
 * Prefixes each line of the body with "> " and retains all content.
 * @param content - Object containing body text and user login.
 * @returns Fully quoted body string or empty string if the body is empty.
 */
export function genFullContentsString(comment: CommentContent): string {
  const body = comment.body.trim();
  if (!body) {
    return '';
  }
  const quoted = body
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
  return quoted + '\n\n';
}
