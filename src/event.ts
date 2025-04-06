import * as core from '@actions/core';
import * as fs from 'fs';
import { AgentEvent, getEventType, extractText } from './github.js';
import { ActionConfig } from './config.js';

export interface ProcessedEvent {
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
 * @returns ProcessedEvent object containing the agent event and user prompt, or null if the event is unsupported or lacks the command.
 */
export function processEvent(config: ActionConfig): ProcessedEvent | null {
  const eventPayload = loadEventPayload(config.eventPath);
  const agentEvent = getEventType(eventPayload);

  if (!agentEvent) {
    core.info('Unsupported event type or payload structure.');
    return null; // Exit gracefully for unsupported events
  }
  core.info(`Detected event type: ${agentEvent.type}`);

  // Check for /claude command
  const text = extractText(agentEvent.github);
  if (!text || !text.includes('/claude')) {
    core.info('Command "/claude" not found in the event text.');
    return null; // Exit gracefully if command is not present
  }

  // Extract user prompt
  const userPrompt = text.substring(text.indexOf('/claude') + '/claude'.length).trim();
  if (!userPrompt) {
    core.info('No prompt found after "/claude" command.');
    return null; // Indicate missing prompt
  }
  core.info(`User prompt: ${userPrompt}`);

  return { agentEvent, userPrompt };
}
