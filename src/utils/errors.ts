/**
 * @fileoverview Custom error subclasses for specific failure modes.
 * These error types allow more granular error handling and clearer error semantics.
 */
/** Error thrown when configuration inputs are invalid or missing. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}
/** Error thrown when a CLI command fails or returns an unexpected result. */
export class CliError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CliError';
  }
}
/** Error thrown when an operation times out. */
export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}
/** Error thrown when parsing of data (e.g., JSON) fails. */
export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParseError';
  }
}
/** Error thrown for GitHub API or operation failures. */
export class GitHubError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GitHubError';
  }
}