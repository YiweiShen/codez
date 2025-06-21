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
export { createIssuesFromFeaturePlan } from './createIssues.js';
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
  const bodyLines: string[] = [title, '', `Progress: [${emptyBar}] 0%`, ''];
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
  const completed = steps.filter((s) => s.startsWith('- [x]')).length;
  const barBlocks = PROGRESS_BAR_BLOCKS;
  const filled = Math.round((completed / total) * barBlocks);
  const bar = '█'.repeat(filled) + '░'.repeat(barBlocks - filled);
  const percent = Math.round((completed / total) * 100);
  const title = '**🚀 Codez Progress**';
  const bodyLines: string[] = [
    title,
    '',
    `Progress: [${bar}] ${percent}%${percent === 100 ? ' ✅' : ''}`,
    '',
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
  const { agentEvent, userPrompt, noPr } = processedEvent;
  if (noPr) {
    core.info('Flag --no-pr detected; skipping pull request creation.');
  }

  // Skip any changes to workflow files to avoid requiring workflow permissions
  const workflowFiles = changedFiles.filter((f) =>
    f.startsWith('.github/workflows/'),
  );
  if (workflowFiles.length > 0) {
    core.warning(
      `Ignoring changes to workflow files: ${workflowFiles.join(', ')}`,
    );
    // Revert workflow file changes
    await execa('git', ['checkout', 'HEAD', '--', '.github/workflows'], {
      cwd: workspace,
      stdio: 'inherit',
    });
  }
  const effectiveChangedFiles = changedFiles.filter(
    (f) => !f.startsWith('.github/workflows/'),
  );

  if (!noPr && effectiveChangedFiles.length > 0) {
    core.info(
      `Detected changes in ${
        effectiveChangedFiles.length
      } files:\n${effectiveChangedFiles.join('\n')}`,
    );

    const generateCommitMessage = generateCommitMessageOpenAI;
    // Generate commit message
    // Generate commit message via OpenAI (instrumented)
    core.info('[perf] generateCommitMessage start');
    const _t_commitMsg = Date.now();
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
    core.info(
      `[perf] generateCommitMessage end - ${Date.now() - _t_commitMsg}ms`,
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
  } else if (noPr && effectiveChangedFiles.length > 0) {
    core.info(`--no-pr flag used and detected changes in ${effectiveChangedFiles.length} files; posting diff in comment.`);
    let diffOutput = '';
    try {
      const { stdout } = await execa(
        'git',
        ['diff', 'HEAD', '--', ...effectiveChangedFiles],
        { cwd: workspace }
      );
      diffOutput = stdout;
    } catch (err) {
      core.warning(`Failed to generate diff for comment: ${err instanceof Error ? err.message : String(err)}`);
    }
    const commentBody = `${output}\n\n**Proposed changes:**\n\`\`\`diff\n${diffOutput}\n\`\`\``;
    await postComment(octokit, repo, agentEvent.github, commentBody);
  } else {
    // No non-workflow file changes, post AI output as a comment
    await postComment(octokit, repo, agentEvent.github, `${output}`);
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
  const { agentEvent, userPrompt, includeFullHistory, createIssues } =
    processedEvent;

  // Add eyes reaction (instrumented)
  core.info('[perf] addEyeReaction start');
  const _t_addEye = Date.now();
  await addEyeReaction(octokit, repo, agentEvent.github);
  core.info(`[perf] addEyeReaction end - ${Date.now() - _t_addEye}ms`);

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
    progressCommentId = await createProgressComment(
      octokit,
      repo,
      agentEvent.github,
      progressSteps,
    );
  } catch (e) {
    core.warning(
      `Failed to create progress comment: ${
        e instanceof Error ? e.message : e
      }`,
    );
  }

  // Clone repository (instrumented)
  core.info('[perf] cloneRepository start');
  const _t_clone = Date.now();
  await cloneRepository(
    workspace,
    githubToken,
    repo,
    context,
    octokit,
    agentEvent,
  );
  core.info(`[perf] cloneRepository end - ${Date.now() - _t_clone}ms`);

  // Capture initial file state (instrumented)
  core.info('[perf] captureFileState start');
  const _t_captureState = Date.now();
  const originalFileState = await captureFileState(workspace);
  core.info(`[perf] captureFileState end - ${Date.now() - _t_captureState}ms`);

  // generate Prompt (with special handling for create issues)
  let effectiveUserPrompt = userPrompt;
  if (createIssues) {
    effectiveUserPrompt = `Please output only a JSON array of feature objects, each with a "title" (concise summary) and "description" (detailed explanation or examples). ${userPrompt}`;
  }

  // Generate prompt for Codex (instrumented)
  core.info('[perf] generatePrompt start');
  const _t_prompt = Date.now();
  let prompt = await generatePrompt(
    octokit,
    repo,
    agentEvent,
    effectiveUserPrompt,
    includeFullHistory,
  );
  core.info(`[perf] generatePrompt end - ${Date.now() - _t_prompt}ms`);

  // Handle any images in the prompt by downloading and replacing embeds with placeholders
  const imageUrls = extractImageUrls(prompt);
  let downloadedImageFiles: string[] = [];
  if (imageUrls.length > 0) {
    const imagesDir = path.join(workspace, 'codex-comment-images');
    downloadedImageFiles = await downloadImages(imageUrls, imagesDir);
    for (let i = 0; i < imageUrls.length; i++) {
      const url = imageUrls[i];
      const placeholder = `<image_${i}>`;
      prompt = prompt.replace(
        new RegExp(`!\\[[\\s\\S]*?\\]\\(${escapeRegExp(url)}\\)`, 'g'),
        placeholder,
      );
      prompt = prompt.replace(
        new RegExp(`<img[^>]*src=[\\"']${escapeRegExp(url)}[\\"'][^>]*>`, 'g'),
        placeholder,
      );
    }
  }
  core.info(`Prompt: \n${prompt}`);
  // Update progress: context gathering complete
  if (progressCommentId) {
    try {
      const steps = progressSteps.map(
        (s, i) => `- [${i <= 0 ? 'x' : ' '}] ${s}`,
      );
      await updateProgressComment(
        octokit,
        repo,
        agentEvent.github,
        progressCommentId,
        steps,
      );
    } catch (e) {
      core.warning(
        `Failed to update progress to 'Gathering context' complete: ${
          e instanceof Error ? e.message : e
        }`,
      );
    }
  }
  let output;
  try {
    const allImages = [...config.images, ...downloadedImageFiles];
    // Execute Codex CLI (instrumented)
    core.info('[perf] runCodex start');
    const _t_codex = Date.now();
    const rawOutput: string = await runCodex(
      workspace,
      config,
      prompt,
      timeoutSeconds * 1000,
      allImages,
    );
    core.info(`[perf] runCodex end - ${Date.now() - _t_codex}ms`);
    output = maskSensitiveInfo(rawOutput, config);
    // Update progress: planning complete
    if (progressCommentId) {
      try {
        const steps = progressSteps.map(
          (s, i) => `- [${i <= 1 ? 'x' : ' '}] ${s}`,
        );
        await updateProgressComment(
          octokit,
          repo,
          agentEvent.github,
          progressCommentId,
          steps,
        );
      } catch (e) {
        core.warning(
          `Failed to update progress to 'Planning' complete: ${
            e instanceof Error ? e.message : e
          }`,
        );
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
    const { createIssuesFromFeaturePlan } = await import('./createIssues.js');
    await createIssuesFromFeaturePlan(octokit, repo, agentEvent.github, output);
    return;
  }

  // Detect file changes (instrumented)
  core.info('[perf] detectChanges start');
  const _t_detect = Date.now();
  const changedFiles = await detectChanges(workspace, originalFileState);
  core.info(`[perf] detectChanges end - ${Date.now() - _t_detect}ms`);

  // Handle the results
  await handleResult(config, processedEvent, output, changedFiles);

  // Update progress: applying edits complete
  if (progressCommentId) {
    try {
      const steps = progressSteps.map(
        (s, i) => `- [${i <= 2 ? 'x' : ' '}] ${s}`,
      );
      await updateProgressComment(
        octokit,
        repo,
        agentEvent.github,
        progressCommentId,
        steps,
      );
    } catch (e) {
      core.warning(
        `Failed to update progress to 'Applying edits' complete: ${
          e instanceof Error ? e.message : e
        }`,
      );
    }
  }

  // Update progress: testing complete
  if (progressCommentId) {
    try {
      const steps = progressSteps.map(
        (s, i) => `- [${i <= 3 ? 'x' : ' '}] ${s}`,
      );
      await updateProgressComment(
        octokit,
        repo,
        agentEvent.github,
        progressCommentId,
        steps,
      );
    } catch (e) {
      core.warning(
        `Failed to update progress to 'Testing' complete: ${
          e instanceof Error ? e.message : e
        }`,
      );
    }
  }

  core.info('Action completed successfully.');
}
