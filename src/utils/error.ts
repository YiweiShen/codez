/**
 * @param error
 * @file Error handling utilities module.
 * Provides functions to convert unknown errors safely to message and stack strings.
 */

/**
 *
 * @param error
 */

/**
 *
 * @param error
 */

/**
 *
 * @param error
 */
export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 *
 * @param error
 */

/**
 *
 * @param error
 */

/**
 *
 * @param error
 */

/**
 *
 */
export function toErrorStack(error: unknown): string | undefined {
  if (error instanceof Error) {
    return error.stack;
  }
  return undefined;
}
