import * as core from '@actions/core';
import * as fs from 'fs';
import { AgentEvent, getEventType, extractText } from './github.js';
import { ActionConfig } from '../config/config.js';

export interface ProcessedEvent {
  type: 'codex';
  agentEvent: AgentEvent;
  userPrompt: string;
  includeFullHistory: boolean;
}

/**
 * Reads and parses the event payload from the specified path.
 * @param eventPath Path to the event payload file.
 * @returns Parsed event payload object.
 * @throws Error if the file cannot be read or parsed.
 */
function loadEventPayload(eventPath: string): any {
  try {
    return JSON.parse(fs.readFileSync(eventPath, 'utf8'));
  } catch (error) {
    throw new Error(
      `Failed to read or parse event payload at ${eventPath}: ${error}`,
    );
  }
}

/**
 * Processes the GitHub event to determine the type and extract the user prompt.
 * @param config Action configuration.
 * @returns ProcessedEvent
 */
export function processEvent(config: ActionConfig): ProcessedEvent | null {
  if (config.directPrompt) {
    core.info('Direct prompt provided. Bypassing GitHub event trigger.');
    return {
      type: 'codex',
      agentEvent: {
        type: 'issuesOpened',
        github: { action: 'opened', issue: { number: 0, title: '', body: '', pull_request: null } },
      },
      userPrompt: config.directPrompt,
      includeFullHistory: false,
    };
  }
  const eventPayload = loadEventPayload(config.eventPath);
  const agentEvent = getEventType(eventPayload);

  if (!agentEvent) {
    core.info('Unsupported event type or payload structure.');
    return null; // Exit gracefully for unsupported events
  }
  core.info(`Detected event type: ${agentEvent.type}`);

  // Check for /codex command only
  const text = extractText(agentEvent.github);
  if (!text || !text.startsWith('/codex')) {
    core.info('Command "/codex" not found in the event text.');
    return null;
  }

  let args = text.replace('/codex', '').trim();
  const includeFullHistory = args.split(/\s+/).includes('--full-history');
  args = args.replace(/--full-history\b/, '').trim();
  let userPrompt = args;

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
    core.info('No prompt found after "/codex" command.');
    return null;
  }

  const type: 'codex' = 'codex';
  return { type, agentEvent, userPrompt, includeFullHistory };
}
