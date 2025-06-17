import * as core from '@actions/core';
import * as fs from 'fs';
import { AgentEvent, getEventType, extractText } from './github.js';
import { ActionConfig } from '../config/config.js';

export interface ProcessedEvent {
  type: 'codex';
  agentEvent: AgentEvent;
  userPrompt: string;
  includeFullHistory: boolean;
  createIssues: boolean;
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
      createIssues: false,
    };
  }
  const eventPayload = loadEventPayload(config.eventPath);
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
      core.info(`Issue assigned to '${assignee}', not in assignee-trigger list. Skipping.`);
      return null;
    }
    core.info(`Assignee-trigger matched for '${assignee}'. Invoking Codez.`);
    const issue = agentEvent.github.issue;
    const prompt = `${issue.title.trim()}\n\n${issue.body.trim()}`;
    return { type: 'codex', agentEvent, userPrompt: prompt, includeFullHistory: false, createIssues: false };
  }

  // Check for configured trigger phrase only
  const trigger = config.triggerPhrase;
  const text = extractText(agentEvent.github);
  if (!text || !text.startsWith(trigger)) {
    core.info(`Command "${trigger}" not found in the event text.`);
    return null;
  }

  let args = text.replace(trigger, '').trim();
  const includeFullHistory = args.split(/\s+/).includes('--full-history');
  args = args.replace(/--full-history\b/, '').trim();
  const createIssues = args.split(/\s+/).includes('--create-issues');
  args = args.replace(/--create-issues\b/, '').trim();
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
  return { type, agentEvent, userPrompt, includeFullHistory, createIssues };
}
