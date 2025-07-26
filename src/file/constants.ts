/**
 * Default ignore patterns for file scanning.
 * Extracted for reuse and customization.
 * This array is frozen to prevent runtime mutation.
 */
export const DEFAULT_IGNORE_PATTERNS: string[] = Object.freeze([
  '.git/**',
  'node_modules/**',
]);
