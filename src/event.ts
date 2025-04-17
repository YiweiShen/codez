import * as core from '@actions/core';
import * as fs from 'fs';
import { AgentEvent, getEventType, extractText } from './github.js';
import { ActionConfig } from './config.js';

export interface ProcessedEvent {
  type: "claude" | "codex";
  agentEvent: AgentEvent;
  userPrompt: string;
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
    throw new Error(`Failed to read or parse event payload at ${eventPath}: ${error}`);
  }
}

/**
 * Processes the GitHub event to determine the type and extract the user prompt.
 * @param config Action configuration.
 * @returns ProcessedEvent
 */
export function processEvent(config: ActionConfig): ProcessedEvent | null {
  const eventPayload = loadEventPayload(config.eventPath);
  const agentEvent = getEventType(eventPayload);

  if (!agentEvent) {
    core.info('Unsupported event type or payload structure.');
    return null; // Exit gracefully for unsupported events
  }
  core.info(`Detected event type: ${agentEvent.type}`);

  // Check for /claude and /codex command
  const text = extractText(agentEvent.github);
  if (!text || (!text.startsWith('/claude') && !text.startsWith('/codex'))) {
    core.info('Command "/claude" or "/codex" not found in the event text.');
    return null; // Exit gracefully if command is not present
  }

  let userPrompt = "";
  let type: "claude" | "codex" = "claude";
  if (text.startsWith('/claude')) {
    userPrompt = text.replace('/claude', '').trim();
  } else if (text.startsWith('/codex')) {
    userPrompt = text.replace('/codex', '').trim();
    type = "codex";
  }

  if (!userPrompt) {
    core.info('No prompt found after "/claude"or "/codex" command.');
    return null; // Indicate missing prompt
  }

  return { type, agentEvent, userPrompt };
}
