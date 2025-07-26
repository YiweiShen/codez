/**
 * @file Error handling utilities module.
 * Provides functions to convert unknown errors safely to message and stack strings.
 */

/**
 * Type guard to determine if a value is an Error.
 * @param error - The value to check.
 * @returns True if the value is an instance of Error.
 */
function isError(error: unknown): error is Error {
  return error instanceof Error;
}

/**
 * Safely extracts the message from an unknown error object.
 * @param error - The caught error or value.
 * @returns The error message string.
 */
export function toErrorMessage(error: unknown): string {
  return isError(error) ? error.message : String(error);
}

/**
 * Safely extracts the stack trace from an unknown error object.
 * @param error - The caught error or value.
 * @returns The error stack trace or undefined if unavailable.
 */
export function toErrorStack(error: unknown): string | undefined {
  return isError(error) ? error.stack : undefined;
}
