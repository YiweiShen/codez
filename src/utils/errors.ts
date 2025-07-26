/**
 * Custom error subclasses for specific failure modes.
 * These error types allow more granular error handling and clearer error semantics.
 * @module utils/errors
 */
/**
 * Base class for custom errors that automatically sets the error name
 * and maintains proper prototype chain for `instanceof` checks.
 */
export abstract class CustomError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Error thrown when configuration inputs are invalid or missing. */
export class ConfigError extends CustomError {}

/** Error thrown when a CLI command fails or returns an unexpected result. */
export class CliError extends CustomError {}

/** Error thrown when an operation times out. */
export class TimeoutError extends CustomError {}

/** Error thrown when parsing of data (e.g., JSON) fails. */
export class ParseError extends CustomError {}

/** Error thrown for GitHub API or operation failures. */
export class GitHubError extends CustomError {}
