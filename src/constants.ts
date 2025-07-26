/**
 * Centralized constants for the Codez GitHub Action.
 */

/**
 * Default trigger phrase to invoke Codez.
 */
export const DEFAULT_TRIGGER_PHRASE: string = '/codex';

/**
 * Default timeout for the GitHub Action in seconds.
 */
export const DEFAULT_TIMEOUT_SECONDS: number = 600;

/**
 * Default workspace path for the GitHub Action.
 */
export const DEFAULT_WORKSPACE_PATH: string = '/workspace/app';

/**
 * Number of blocks to render in the progress bar.
 */
export const PROGRESS_BAR_BLOCKS: number = 20;

/**
 * Title used for Codez progress comments.
 */
export const PROGRESS_TITLE: string = '**🚀 Codez Progress**';

/**
 * Loading phrases to display below the progress bar.
 */
export { default as LOADING_PHRASES } from './loadingPhrases';
