/**
 * Event processing module.
 *
 * Provides functions and types to load GitHub event payloads and normalize
 * them into a consistent format for the action workflow.
 */
import * as core from '@actions/core';
import { promises as fs } from 'fs';
import { AgentEvent, getEventType, extractText } from './github.js';
import { ActionConfig } from '../config/config.js';

/**
 * Represents a normalized event to trigger the Codex workflow.
 *
 * @property type - The type of agent event (e.g., 'codex').
 * @property agentEvent - The original GitHub event information.
 * @property userPrompt - Extracted prompt text for processing.
 * @property includeFullHistory - Whether to include full conversation history.
 * @property createIssues - Whether to create issues based on the output.
 */
export interface ProcessedEvent {
  type: 'codex';
  agentEvent: AgentEvent;
  userPrompt: string;
  includeFullHistory: boolean;
  createIssues: boolean;
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
 * @param {string} eventPath - Path to the event payload file.
 * @returns {any} Parsed event payload object.
 * @throws {Error} If the file cannot be read or parsed.
 */
export async function loadEventPayload(eventPath: string): Promise<any> {
  try {
    const content = await fs.readFile(eventPath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    throw new Error(
      `Failed to read or parse event payload at ${eventPath}: ${error}`,
    );
  }
}

/**
 * Process the GitHub event to determine the type and extract the user prompt.
 *
 * @param {ActionConfig} config - Action configuration object.
 * @returns {ProcessedEvent | null} The processed event data or null if unsupported.
 */
export async function processEvent(
  config: ActionConfig,
): Promise<ProcessedEvent | null> {
  if (config.directPrompt) {
    let prompt = config.directPrompt;
    let includeFixBuild = false;
    let includeFetch = false;
    if (prompt.split(/\s+/).includes('--fix-build')) {
      includeFixBuild = true;
      prompt = prompt.replace(/--fix-build\b/, '').trim();
    }
    if (prompt.split(/\s+/).includes('--fetch')) {
      includeFetch = true;
      prompt = prompt.replace(/--fetch\b/, '').trim();
    }
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
      userPrompt: prompt,
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

  let args = text.replace(trigger, '').trim();
  const includeFullHistory = args.split(/\s+/).includes('--full-history');
  args = args.replace(/--full-history\b/, '').trim();
  const createIssues = args.split(/\s+/).includes('--create-issues');
  args = args.replace(/--create-issues\b/, '').trim();
  const noPr = args.split(/\s+/).includes('--no-pr');
  args = args.replace(/--no-pr\b/, '').trim();
  // --fix-build: fetch latest failed CI build logs and include as context
  const includeFixBuild = args.split(/\s+/).includes('--fix-build');
  args = args.replace(/--fix-build\b/, '').trim();
  const includeFetch = args.split(/\s+/).includes('--fetch');
  args = args.replace(/--fetch\b/, '').trim();
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
