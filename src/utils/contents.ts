/**
 * Content formatting utilities module.
 *
 * Provides functions to generate formatted content strings for GitHub comments.
 */
/**
 * Generate a quoted content string for bot comments.
 *
 * Prefixes each line of the body with "> " if the author is the GitHub Actions bot.
 *
 * @param {{ body: string; login: string }} content - Object containing body text and user login.
 * @returns {string} Quoted body string for bot comments or empty string otherwise.
 */
export function genContentsString(content: {
  body: string;
  login: string;
}): string {
  let body = content.body.trim();
  const login = content.login.trim();
  if (!body) {
    return '';
  }

  if (login === 'github-actions[bot]') {
    // Add ">" to the beginning of the body, considering line breaks
    body = body
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n');
    return body + '\n\n';
  }

  return '';
}

/**
 * Generate a fully quoted content string.
 *
 * Prefixes each line of the body with "> " and retains all content.
 *
 * @param {{ body: string; login: string }} content - Object containing body text and user login.
 * @returns {string} Fully quoted body string or empty string if the body is empty.
 */
export function genFullContentsString(content: {
  body: string;
  login: string;
}): string {
  const body = content.body.trim();
  if (!body) {
    return '';
  }
  const formatted = body
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
  return formatted + '\n\n';
}
