import * as core from '@actions/core';
import {
  cloneRepository,
  addEyeReaction,
  createPullRequest,
  commitAndPush,
  postComment,
  generatePrompt,
} from './github.js';
import { generateCommitMessage as generateCommitMessageOpenAI } from '../api/openai.js';
import { captureFileState, detectChanges } from '../file/file.js';
import { ActionConfig } from '../config/config.js';
import { ProcessedEvent } from './event.js';
import { maskSensitiveInfo } from '../security/security.js';
import { runCodex } from '../client/codex.js';
import type { Octokit } from 'octokit';
import type { GitHubEvent } from './github.js';

/**
 * Handles the result of execution.
 * @param config Action configuration.
 * @param processedEvent Processed event data.
 * @param output
 * @param changedFiles Array of changed file paths.
 */
async function handleResult(
  config: ActionConfig,
  processedEvent: ProcessedEvent,
  output: string,
  changedFiles: string[],
): Promise<void> {
  const { octokit, repo, workspace } = config;
  const { agentEvent, userPrompt } = processedEvent;

  if (changedFiles.length > 0) {
    core.info(
      `Detected changes in ${changedFiles.length} files:\n${changedFiles.join(
        '\n',
      )}`,
    );

    const generateCommitMessage = generateCommitMessageOpenAI;
    // Generate commit message
    const commitMessage = await generateCommitMessage(
      changedFiles,
      userPrompt,
      {
        issueNumber:
          agentEvent.type === 'issuesOpened' ||
          agentEvent.type === 'issueCommentCreated' ||
          agentEvent.type === 'issuesAssigned'
            ? agentEvent.github.issue.number
            : undefined,
        prNumber:
          agentEvent.type === 'pullRequestCommentCreated'
            ? agentEvent.github.issue.number
            : agentEvent.type === 'pullRequestReviewCommentCreated'
            ? agentEvent.github.pull_request.number
            : undefined,
      },
      config,
    );

    // Handle changes based on event type
    if (
      agentEvent.type === 'issuesOpened' ||
      agentEvent.type === 'issueCommentCreated' ||
      agentEvent.type === 'issuesAssigned'
    ) {
      await createPullRequest(
        workspace,
        octokit,
        repo,
        agentEvent.github,
        commitMessage,
        output,
      );
    } else if (
      agentEvent.type === 'pullRequestCommentCreated' ||
      agentEvent.type === 'pullRequestReviewCommentCreated'
    ) {
      await commitAndPush(
        workspace,
        octokit,
        repo,
        agentEvent.github,
        commitMessage,
        output,
      );
    }
  } else {
    // No files changed, post AI output as a comment
    await postComment(octokit, repo, agentEvent.github, `${output}`);
  }
}

/**
 * Creates GitHub issues based on a JSON feature plan output.
 */
async function createIssuesFromFeaturePlan(
  octokit: Octokit,
  repo: { owner: string; repo: string },
  event: GitHubEvent,
  output: string,
): Promise<void> {
  let features: Array<{ title: string; description: string }>;
  try {
    features = JSON.parse(output);
  } catch (error) {
    const arrayMatch = output.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      try {
        features = JSON.parse(arrayMatch[0]);
      } catch (error2) {
        await postComment(
          octokit,
          repo,
          event,
          `Failed to parse feature plan JSON: ${
            error2 instanceof Error ? error2.message : String(error2)
          }`,
        );
        return;
      }
    } else {
      await postComment(
        octokit,
        repo,
        event,
        `Failed to parse feature plan JSON: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return;
    }
  }

  if (!Array.isArray(features)) {
    await postComment(
      octokit,
      repo,
      event,
      'Feature plan JSON is not an array. Please output an array of feature objects.',
    );
    return;
  }
  for (const [index, feature] of features.entries()) {
    if (
      typeof feature !== 'object' ||
      feature === null ||
      typeof feature.title !== 'string' ||
      typeof feature.description !== 'string'
    ) {
      await postComment(
        octokit,
        repo,
        event,
        `Invalid feature format at index ${index}. Each feature must be an object with 'title' (string) and 'description' (string).`,
      );
      return;
    }
  }
  for (const feature of features) {
    try {
      const issue = await octokit.rest.issues.create({
        ...repo,
        title: feature.title,
        body: feature.description,
      });
      core.info(`Created feature issue #${issue.data.number}: ${feature.title}`);
      await postComment(
        octokit,
        repo,
        event,
        `Created new feature issue #${issue.data.number} for "${feature.title}"`,
      );
    } catch (error) {
      core.warning(
        `Failed to create issue for feature "${feature.title}": ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}

/**
 * Executes the main logic of the GitHub Action.
 * @param config Action configuration.
 * @param processedEvent Processed event data.
 */
export async function runAction(
  config: ActionConfig,
  processedEvent: ProcessedEvent,
): Promise<void> {
  const { octokit, repo, workspace, githubToken, context, timeoutSeconds } =
    config;
  const { agentEvent, userPrompt, includeFullHistory, createIssues } = processedEvent;

  // Add eyes reaction
  await addEyeReaction(octokit, repo, agentEvent.github);

  // Clone repository
  await cloneRepository(
    workspace,
    githubToken,
    repo,
    context,
    octokit,
    agentEvent,
  );

  // Capture initial file state
  const originalFileState = captureFileState(workspace);

  // generate Prompt (with special handling for create issues)
  let effectiveUserPrompt = userPrompt;
  if (createIssues) {
    effectiveUserPrompt =
      `Please output only a JSON array of feature objects, each with a "title" (concise summary) and "description" (detailed explanation or examples). ${userPrompt}`;
  }

  const prompt = await generatePrompt(
    octokit,
    repo,
    agentEvent,
    effectiveUserPrompt,
    includeFullHistory,
  );

  core.info(`Prompt: \n${prompt}`);
  let output;
  try {
    const rawOutput: string = await runCodex(
      workspace,
      config,
      prompt,
      timeoutSeconds * 1000,
    );
    output = maskSensitiveInfo(rawOutput, config);
  } catch (error) {
    await postComment(
      octokit,
      repo,
      agentEvent.github,
      `CLI execution failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return;
  }
  core.info(`Output: \n${output}`);

  // Handle create issues intent: create issues from JSON output
  if (createIssues) {
    await createIssuesFromFeaturePlan(octokit, repo, agentEvent.github, output);
    return;
  }

  // Detect file changes
  const changedFiles = detectChanges(workspace, originalFileState);

  // Handle the results
  await handleResult(config, processedEvent, output, changedFiles);

  core.info('Action completed successfully.');
}
