/**
 * Core logic for executing the GitHub Action.
 *
 * Orchestrates cloning, prompt generation, Codex invocation,
 * change detection, and result handling including pull requests and comments.
 */
import * as core from '@actions/core';
import { execa } from 'execa';
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
import path from 'path';
import { extractImageUrls, downloadImages } from '../file/images.js';
import { ActionConfig } from '../config/config.js';
import { ProcessedEvent } from './event.js';
import { maskSensitiveInfo } from '../security/security.js';
import { runCodex } from '../client/codex.js';
import type { Octokit } from 'octokit';
import type { GitHubEvent } from './github.js';
// Helper to escape strings for RegExp
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
const PROGRESS_BAR_BLOCKS = 20;

/**
 * Creates a progress comment with initial unchecked steps.
 * @returns comment id
 */
async function createProgressComment(
  octokit: Octokit,
  repo: { owner: string; repo: string },
  event: GitHubEvent,
  steps: string[],
): Promise<number> {
  // Build initial progress display with emoji title, bar, and unchecked steps
  const total = steps.length;
  const barBlocks = PROGRESS_BAR_BLOCKS;
  const emptyBar = '░'.repeat(barBlocks);
  const title = '**🚀 Codez Progress**';
  const bodyLines: string[] = [
    title,
    '',
    `Progress: [${emptyBar}] 0%`,
    ''
  ];
  for (const step of steps) {
    bodyLines.push(`- [ ] ${step}`);
  }
  bodyLines.push('');
  const body = bodyLines.join('\n');
  if ('issue' in event) {
    const { data } = await octokit.rest.issues.createComment({
      ...repo,
      issue_number: event.issue.number,
      body,
    });
    return data.id;
  } else if ('pull_request' in event && 'comment' in event) {
    const inReplyTo = event.comment.in_reply_to_id ?? event.comment.id;
    const { data } = await octokit.rest.pulls.createReplyForReviewComment({
      ...repo,
      pull_number: event.pull_request.number,
      comment_id: inReplyTo,
      body,
    });
    return data.id;
  }
  throw new Error('Unsupported event for progress comment');
}

/**
 * Updates an existing progress comment by comment id.
 */
async function updateProgressComment(
  octokit: Octokit,
  repo: { owner: string; repo: string },
  event: GitHubEvent,
  commentId: number,
  steps: string[],
): Promise<void> {
  // Build updated progress display with emoji title, dynamic bar, and step statuses
  const total = steps.length;
  const completed = steps.filter(s => s.startsWith('- [x]')).length;
  const barBlocks = PROGRESS_BAR_BLOCKS;
  const filled = Math.round((completed / total) * barBlocks);
  const bar = '█'.repeat(filled) + '░'.repeat(barBlocks - filled);
  const percent = Math.round((completed / total) * 100);
  const title = '**🚀 Codez Progress**';
  const bodyLines: string[] = [
    title,
    '',
    `Progress: [${bar}] ${percent}%${percent === 100 ? ' ✅' : ''}`,
    ''
  ];
  for (const s of steps) {
    bodyLines.push(s);
  }
  bodyLines.push('');
  const body = bodyLines.join('\n');
  if ('issue' in event) {
    await octokit.rest.issues.updateComment({
      ...repo,
      comment_id: commentId,
      body,
    });
  } else if ('pull_request' in event) {
    await octokit.rest.pulls.updateReviewComment({
      ...repo,
      comment_id: commentId,
      body,
    });
  } else {
    throw new Error('Unsupported event for updating progress comment');
  }
}

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

  // Skip any changes to workflow files to avoid requiring workflow permissions
  const workflowFiles = changedFiles.filter((f) =>
    f.startsWith('.github/workflows/'),
  );
  if (workflowFiles.length > 0) {
    core.warning(
      `Ignoring changes to workflow files: ${workflowFiles.join(', ')}`,
    );
    // Revert workflow file changes
    await execa(
      'git',
      ['checkout', 'HEAD', '--', '.github/workflows'],
      { cwd: workspace, stdio: 'inherit' },
    );
  }
  const effectiveChangedFiles = changedFiles.filter(
    (f) => !f.startsWith('.github/workflows/'),
  );

  if (effectiveChangedFiles.length > 0) {
    core.info(
      `Detected changes in ${effectiveChangedFiles.length} files:\n${effectiveChangedFiles.join(
        '\n',
      )}`,
    );

    const generateCommitMessage = generateCommitMessageOpenAI;
    // Generate commit message
    const commitMessage = await generateCommitMessage(
      effectiveChangedFiles,
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
    // No non-workflow file changes, post AI output as a comment
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

  // Initialize progress UI
  // Define progress steps with emojis for clarity
  const progressSteps = [
    '🔍 Gathering context',
    '📝 Planning',
    '✨ Applying edits',
    '🧪 Testing',
  ];
  let progressCommentId: number | undefined;
  try {
    progressCommentId = await createProgressComment(octokit, repo, agentEvent.github, progressSteps);
  } catch (e) {
    core.warning(`Failed to create progress comment: ${e instanceof Error ? e.message : e}`);
  }

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

  let prompt = await generatePrompt(
    octokit,
    repo,
    agentEvent,
    effectiveUserPrompt,
    includeFullHistory,
  );

  // Handle any images in the prompt by downloading and replacing embeds with placeholders
  const imageUrls = extractImageUrls(prompt);
  let downloadedImageFiles: string[] = [];
  if (imageUrls.length > 0) {
    const imagesDir = path.join(workspace, 'codex-comment-images');
    downloadedImageFiles = await downloadImages(imageUrls, imagesDir);
    for (let i = 0; i < imageUrls.length; i++) {
      const url = imageUrls[i];
      const placeholder = `<image_${i}>`;
      prompt = prompt.replace(new RegExp(`!\\[[\\s\\S]*?\\]\\(${escapeRegExp(url)}\\)`, 'g'), placeholder);
      prompt = prompt.replace(new RegExp(`<img[^>]*src=[\\"']${escapeRegExp(url)}[\\"'][^>]*>`, 'g'), placeholder);
    }
  }
  core.info(`Prompt: \n${prompt}`);
  // Update progress: context gathering complete
  if (progressCommentId) {
    try {
      const steps = progressSteps.map((s, i) => `- [${i <= 0 ? 'x' : ' '}] ${s}`);
      await updateProgressComment(octokit, repo, agentEvent.github, progressCommentId, steps);
    } catch (e) {
      core.warning(`Failed to update progress to 'Gathering context' complete: ${e instanceof Error ? e.message : e}`);
    }
  }
  let output;
  try {
    const allImages = [...config.images, ...downloadedImageFiles];
    const rawOutput: string = await runCodex(
      workspace,
      config,
      prompt,
      timeoutSeconds * 1000,
      allImages,
    );
  output = maskSensitiveInfo(rawOutput, config);
  // Update progress: planning complete
  if (progressCommentId) {
    try {
      const steps = progressSteps.map((s, i) => `- [${i <= 1 ? 'x' : ' '}] ${s}`);
      await updateProgressComment(octokit, repo, agentEvent.github, progressCommentId, steps);
    } catch (e) {
      core.warning(`Failed to update progress to 'Planning' complete: ${e instanceof Error ? e.message : e}`);
    }
  }
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

  // Update progress: applying edits complete
  if (progressCommentId) {
    try {
      const steps = progressSteps.map((s, i) => `- [${i <= 2 ? 'x' : ' '}] ${s}`);
      await updateProgressComment(octokit, repo, agentEvent.github, progressCommentId, steps);
    } catch (e) {
      core.warning(`Failed to update progress to 'Applying edits' complete: ${e instanceof Error ? e.message : e}`);
    }
  }

  // Update progress: testing complete
  if (progressCommentId) {
    try {
      const steps = progressSteps.map((s, i) => `- [${i <= 3 ? 'x' : ' '}] ${s}`);
      await updateProgressComment(octokit, repo, agentEvent.github, progressCommentId, steps);
    } catch (e) {
      core.warning(`Failed to update progress to 'Testing' complete: ${e instanceof Error ? e.message : e}`);
    }
  }

  core.info('Action completed successfully.');
}
