/**
 * @file Event processing module.
 *
 * Provides functions and types to load GitHub event payloads and normalize
 * them into a consistent format for the action workflow.
 */

import { promises as fs } from 'fs';
import * as core from '@actions/core';

import type { ActionConfig } from '../config/config';
import { DEFAULT_TRIGGER_PHRASE } from '../constants';
import { toErrorMessage } from '../utils/error';
import { ParseError } from '../utils/errors';
import { extractPromptFlags } from '../utils/prompt';
import type { AgentEvent } from './types';
import { getEventType, extractText } from './event-utils';
import { z } from 'zod';

const RawRecordSchema = z
  .unknown()
  .refine(
    (x): x is Record<string, unknown> => typeof x === 'object' && x !== null,
    { message: 'Expected JSON object' },
  );

/**
 * Represents a normalized event to trigger the Codex workflow.
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
  noPr: boolean;
  includeFixBuild: boolean;
  includeFetch: boolean;
}

/**
 * Load and parse the event payload from the specified file path, validating its shape.
 * @param eventPath - Path to the event payload file.
 * @returns Parsed event payload object as a generic record.
 * @throws If the file cannot be read, parsed, or validated.
 */
export async function loadEventPayload(
  eventPath: string,
): Promise<Record<string, unknown>> {
  try {
    const content = await fs.readFile(eventPath, 'utf8');
    const raw = JSON.parse(content);
    const parsed = RawRecordSchema.parse(raw);
    return parsed;
  } catch (error) {
    throw new ParseError(
      `Failed to read or parse event payload at ${eventPath}: ${toErrorMessage(
        error,
      )}`,
    );
  }
}

/**
 * Handle a direct prompt override, bypassing GitHub event triggers.
 */
function handleDirectPrompt(directPrompt: string): ProcessedEvent {
  const { prompt: userPrompt, includeFixBuild, includeFetch } = extractPromptFlags(
    directPrompt,
    true,
  );
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

/**
 * Handle issue-assigned events, triggering only for configured assignees.
 */
function handleIssuesAssigned(
  agentEvent: AgentEvent & { type: 'issuesAssigned' },
  assigneeTrigger: string[],
): ProcessedEvent | null {
  const assignee = agentEvent.github.assignee.login;
  if (!assigneeTrigger.includes(assignee)) {
    core.info(
      `Issue assigned to '${assignee}', not in assignee-trigger list. Skipping.`,
    );
    return null;
  }
  core.info(`Assignee-trigger matched for '${assignee}'. Invoking Codez.`);
  const { title, body } = agentEvent.github.issue;
  const userPrompt = `${title.trim()}

${body.trim()}`;
  return {
    type: 'codex',
    agentEvent,
    userPrompt,
    includeFullHistory: false,
    createIssues: false,
    noPr: false,
    includeFixBuild: false,
    includeFetch: false,
  };
}

/**
 * Handle events with a trigger phrase in the body or title/comment.
 */
function handleTriggerPhrase(
  agentEvent: AgentEvent,
  trigger: string,
): ProcessedEvent | null {
  const text = extractText(agentEvent.github);
  if (!text || !text.startsWith(trigger)) {
    core.info(`Command "${trigger}" not found in the event text.`);
    return null;
  }
  const args = text.slice(trigger.length).trim();
  const {
    includeFullHistory,
    createIssues,
    noPr,
    includeFixBuild,
    includeFetch,
    prompt: promptRest,
  } = extractPromptFlags(args, false);

  const title =
    'issue' in agentEvent.github
      ? agentEvent.github.issue.title
      : 'pull_request' in agentEvent.github
      ? agentEvent.github.pull_request.title
      : undefined;
  const userPrompt = title
    ? `${title.trim()}

${promptRest}`
    : promptRest;

  if (!userPrompt) {
    core.info(`No prompt found after "${DEFAULT_TRIGGER_PHRASE}" command.`);
    return null;
  }

  return {
    type: 'codex',
    agentEvent,
    userPrompt,
    includeFullHistory,
    createIssues,
    noPr,
    includeFixBuild,
    includeFetch,
  };
}

/**
 * Process the GitHub event to determine the type and extract the user prompt.
 * @param config - Action configuration object.
 * @returns The processed event data or null if unsupported.
 */
export async function processEvent(
  config: ActionConfig,
): Promise<ProcessedEvent | null> {
  const { directPrompt, eventPath, assigneeTrigger, triggerPhrase } = config;

  if (directPrompt) {
    return handleDirectPrompt(directPrompt);
  }

  const payload = await loadEventPayload(eventPath);
  const agentEvent = getEventType(payload);

  if (!agentEvent) {
    core.info('Unsupported event type detected.');
    return null;
  }
  core.info(`Detected event type: ${agentEvent.type}`);

  if (agentEvent.type === 'issuesAssigned') {
    return handleIssuesAssigned(agentEvent, assigneeTrigger);
  }

  return handleTriggerPhrase(agentEvent, triggerPhrase);
}
