/**
 * Escape special characters in a literal string so it can be used in a RegExp.
 * @param str - Input string containing potential RegExp metacharacters.
 * @returns A string where regex-meaningful characters are escaped.
 */
export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '$\\$&');
}
