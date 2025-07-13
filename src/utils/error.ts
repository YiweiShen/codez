/**
 * @file Error handling utilities module.
 * Provides functions to convert unknown errors safely to message and stack strings.
 */

/**
 * Safely extracts the message from an unknown error object.
 * @param error - The caught error or value.
 * @returns The error message string.
 */
export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * Safely extracts the stack trace from an unknown error object.
 * @param error - The caught error or value.
 * @returns The error stack trace or undefined if unavailable.
 */
export function toErrorStack(error: unknown): string | undefined {
  if (error instanceof Error) {
    return error.stack;
  }
  return undefined;
}
