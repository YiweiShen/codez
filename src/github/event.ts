/**
 * @fileoverview Event processing module.
 *
 * Provides functions and types to load GitHub event payloads and normalize
 * them into a consistent format for the action workflow.
 */
import * as core from '@actions/core';
import { toErrorMessage } from '../utils/error.js';
import { extractPromptFlags } from '../utils/prompt.js';
import { ParseError } from '../utils/errors.js';
import { promises as fs } from 'fs';
import { getEventType, extractText } from './github.js';
import { DEFAULT_TRIGGER_PHRASE } from '../constants.js';
import type { AgentEvent } from './github.js';
import type { ActionConfig } from '../config/config.js';

/**
 * Represents a normalized event to trigger the Codex workflow.
 *
 * @property type - The type of agent event (e.g., 'codex').
 * @property agentEvent - The original GitHub event information.
 * @property userPrompt - Extracted prompt text for processing.
 * @property includeFullHistory - Whether to include full conversation history.
 * @property createIssues - Whether to create issues based on the output.
 * @property noPr - Whether to skip pull request creation and only post AI output as a comment.
 * @property includeFixBuild - Whether to fetch and include the latest failed CI build logs as context.
 * @property includeFetch - Whether to fetch known URLs referenced in the prompt and include their contents.
 */
export interface ProcessedEvent {
  type: 'codex';
  agentEvent: AgentEvent;
  userPrompt: string;
  includeFullHistory: boolean;
  createIssues: boolean;
  /**
   * Whether to skip pull request creation and only post AI output as a comment.
   */
  noPr: boolean;
  /**
   * Whether to fetch and include the latest failed CI build logs as context.
   */
  includeFixBuild: boolean;
  /**
   * Whether to fetch known URLs referenced in the prompt and include their contents.
   */
  includeFetch: boolean;
}

/**
 * Load and parse the event payload from the specified file path.
 *
 * @param eventPath - Path to the event payload file.
 * @returns Parsed event payload object as a generic record.
 * @throws If the file cannot be read or parsed.
 */
export async function loadEventPayload(
  eventPath: string,
): Promise<Record<string, unknown>> {
  try {
    const content = await fs.readFile(eventPath, 'utf8');
    // JSON.parse returns any; cast to a generic object to avoid untyped any
    return JSON.parse(content) as Record<string, unknown>;
  } catch (error) {
    throw new ParseError(
      `Failed to read or parse event payload at ${eventPath}: ${toErrorMessage(
        error,
      )}`,
    );
  }
}

/**
 * Process the GitHub event to determine the type and extract the user prompt.
 *
 * @param config - Action configuration object.
 * @returns The processed event data or null if unsupported.
 */
export async function processEvent(
  config: ActionConfig,
): Promise<ProcessedEvent | null> {
  if (config.directPrompt) {
    const {
      prompt: userPrompt,
      includeFixBuild,
      includeFetch,
    } = extractPromptFlags(config.directPrompt, true);
    core.info('Direct prompt provided. Bypassing GitHub event trigger.');
    return {
      type: 'codex',
      agentEvent: {
        type: 'issuesOpened',
        github: {
          action: 'opened',
          issue: { number: 0, title: '', body: '', pull_request: null },
        },
      },
      userPrompt,
      includeFullHistory: false,
      createIssues: false,
      noPr: false,
      includeFixBuild,
      includeFetch,
    };
  }
  const eventPayload = await loadEventPayload(config.eventPath);
  const agentEvent = getEventType(eventPayload);

  if (!agentEvent) {
    core.info('Unsupported event type or payload structure.');
    return null; // Exit gracefully for unsupported events
  }
  core.info(`Detected event type: ${agentEvent.type}`);

  // Handle assignee-based triggers
  if (agentEvent.type === 'issuesAssigned') {
    const assignee = agentEvent.github.assignee.login;
    if (!config.assigneeTrigger.includes(assignee)) {
      core.info(
        `Issue assigned to '${assignee}', not in assignee-trigger list. Skipping.`,
      );
      return null;
    }
    core.info(`Assignee-trigger matched for '${assignee}'. Invoking Codez.`);
    const issue = agentEvent.github.issue;
    const prompt = `${issue.title.trim()}\n\n${issue.body.trim()}`;
    return {
      type: 'codex',
      agentEvent,
      userPrompt: prompt,
      includeFullHistory: false,
      createIssues: false,
      noPr: false,
      includeFixBuild: false,
      includeFetch: false,
    };
  }

  // Check for configured trigger phrase only
  const trigger = config.triggerPhrase;
  const text = extractText(agentEvent.github);
  if (!text || !text.startsWith(trigger)) {
    core.info(`Command "${trigger}" not found in the event text.`);
    return null;
  }

  const args = text.replace(trigger, '').trim();
  const {
    includeFullHistory,
    createIssues,
    noPr,
    includeFixBuild,
    includeFetch,
    prompt: promptRest,
  } = extractPromptFlags(args, false);
  let userPrompt = promptRest;

  let title: string | undefined;
  if ('issue' in agentEvent.github) {
    title = agentEvent.github.issue.title;
  } else if ('pull_request' in agentEvent.github) {
    title = agentEvent.github.pull_request.title;
  }
  if (title) {
    userPrompt = `${title.trim()}\n\n${userPrompt}`;
  }

  if (!userPrompt) {
    core.info(`No prompt found after "${DEFAULT_TRIGGER_PHRASE}" command.`);
    return null;
  }

  const type: 'codex' = 'codex';
  return {
    type,
    agentEvent,
    userPrompt,
    includeFullHistory,
    createIssues,
    noPr,
    includeFixBuild,
    includeFetch,
  };
}
