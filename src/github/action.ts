/**
 * @fileoverview Core logic for executing the GitHub Action.
 *
 * Orchestrates cloning, prompt generation, Codex invocation,
 * change detection, and result handling including pull requests and comments.
 */
import * as core from '@actions/core';
import { GitHubError } from '../utils/errors.js';
import { execa } from 'execa';
import {
  cloneRepository,
  addEyeReaction,
  createPullRequest,
  commitAndPush,
  generatePrompt,
  removeEyeReaction,
  addThumbUpReaction,
  upsertComment,
} from './github.js';
import { generateCommitMessage as generateCommitMessageOpenAI } from '../api/openai.js';
import { captureFileState, detectChanges } from '../file/file.js';
import path from 'path';
import { promises as fs } from 'fs';
import { extractImageUrls, downloadImages } from '../file/images.js';
import type { ActionConfig } from '../config/config.js';
import type { ProcessedEvent } from './event.js';
import { maskSensitiveInfo } from '../security/security.js';
import { runCodex } from '../client/codex.js';
import type { Octokit } from 'octokit';
import type { GitHubEvent } from './github.js';
import AdmZip from 'adm-zip';
import axios from 'axios';

/**
 * Fetches the latest failed workflow run logs for the repository and returns their content.
 * @param octokit Octokit client
 * @param repo Repository context ({owner, repo})
 * @returns String of log content or an informational message
 */
async function fetchLatestFailedWorkflowLogs(
  octokit: Octokit,
  repo: { owner: string; repo: string },
): Promise<string> {
  core.info('[perf] fetchLatestFailedWorkflowLogs start');
  try {
    const runsResponse = await octokit.rest.actions.listWorkflowRunsForRepo({
      ...repo,
      status: 'completed',
      conclusion: 'failure',
      per_page: 1,
    });
    const runs = runsResponse.data.workflow_runs;
    if (!runs || runs.length === 0) {
      return 'No failed workflow runs found.';
    }
    // The workflow_runs array items are properly typed by Octokit
    const latest = runs[0];
    const runId: number = latest.id;
    core.info(`[perf] downloading logs for run ${runId}`);
    const downloadResponse = await octokit.request(
      'GET /repos/{owner}/{repo}/actions/runs/{run_id}/logs',
      {
        owner: repo.owner,
        repo: repo.repo,
        run_id: runId,
        request: { responseType: 'arraybuffer' },
      },
    );
    const buffer = Buffer.from(downloadResponse.data as ArrayBuffer);
    const zip = new AdmZip(buffer);
    const entries = zip.getEntries();
    if (!entries || entries.length === 0) {
      return 'No log files found in the logs archive.';
    }
    const logs: string[] = entries.map((entry) => {
      const name = entry.entryName;
      const content = entry.getData().toString('utf8');
      return `=== ${name} ===\n${content}`;
    });
    return logs.join('\n\n');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new GitHubError(`Error fetching workflow runs: ${msg}`);
  }
}
export { createIssuesFromFeaturePlan } from './createIssues.js';
/**
 * Escape special characters in a literal string so it can be used in a RegExp.
 * @param str - Input string containing potential RegExp metacharacters.
 * @returns A string where regex-meaningful characters are escaped.
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '$\\$&');
}
const PROGRESS_BAR_BLOCKS = 20;
/**
 * Title used for Codez progress comments.
 */
const PROGRESS_TITLE = '**🚀 Codez Progress**';

/**
 * Create a GitHub comment to display initial progress steps with checkboxes.
 * @param octokit - Authenticated Octokit client.
 * @param repo - Repository owner and name context.
 * @param event - The GitHubEvent where the comment will be posted.
 * @param steps - Array of markdown step descriptions to render.
 * @returns Promise resolving to the created comment ID.
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
  const title = PROGRESS_TITLE;
  const bodyLines: string[] = [title, '', `Progress: [${emptyBar}] 0%`, ''];
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const prefix = `- [ ] ${step}`;
    const spinnerSuffix =
      i === 0
        ? ' <img src="https://github.com/user-attachments/assets/082dfba3-0ee2-4b6e-9606-93063bcc7590" alt="spinner" width="16" height="16"/>'
        : '';
    bodyLines.push(prefix + spinnerSuffix);
  }
  bodyLines.push('');
  const body = bodyLines.join('\n');
  if ('issue' in event) {
    const { data } = await octokit.rest.issues.createComment({
      ...repo,
      issue_number: event.issue.number,
      body,
    });
    core.info(`Created progress comment with id: ${data.id}`);
    return data.id;
  } else if ('pull_request' in event && 'comment' in event) {
    const inReplyTo = event.comment.in_reply_to_id ?? event.comment.id;
    const { data } = await octokit.rest.pulls.createReplyForReviewComment({
      ...repo,
      pull_number: event.pull_request.number,
      comment_id: inReplyTo,
      body,
    });
    core.info(`Created progress comment with id: ${data.id}`);
    return data.id;
  }
  throw new GitHubError('Unsupported event for progress comment');
}

/**
 * Update the content of an existing GitHub progress comment.
 * @param octokit - Authenticated Octokit client.
 * @param repo - Repository owner and name context.
 * @param event - The GitHubEvent that the comment belongs to.
 * @param commentId - ID of the comment to update.
 * @param steps - Array of markdown-formatted step lines to render.
 * @returns Promise resolving when the comment update is complete.
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
  const title = PROGRESS_TITLE;
  const bodyLines: string[] = [
    title,
    '',
    `Progress: ${bar} ${percent}%${percent === 100 ? ' ✅' : ''}`,
    '',
  ];
  for (let i = 0; i < steps.length; i++) {
    let line = steps[i];
    if (i === completed && completed !== total) {
      line =
        line +
        ' <img src="https://github.com/user-attachments/assets/082dfba3-0ee2-4b6e-9606-93063bcc7590" alt="spinner" width="16" height="16"/>';
    }
    bodyLines.push(line);
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
    throw new GitHubError('Unsupported event for updating progress comment');
  }
}

/**
 * Process and publish the action's results: push commits, open PR, or post comments.
 * @param config - The ActionConfig with context and clients.
 * @param processedEvent - Normalized event data triggering the action.
 * @param output - The raw text output generated by Codex or fallback.
 * @param changedFiles - List of relative file paths that were modified.
 * @param progressCommentId - Optional ID of the progress comment to update.
 * @returns Promise resolving when all result handling is complete.
 */
async function handleResult(
  config: ActionConfig,
  processedEvent: ProcessedEvent,
  output: string,
  changedFiles: string[],
  progressCommentId?: number,
): Promise<void> {
  const { octokit, repo, workspace } = config;
  const { agentEvent, userPrompt, noPr } = processedEvent;
  const event = agentEvent.github;
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
  // Skip any changes in the codex-comment-images folder (downloaded artifacts)
  const imageFiles = changedFiles.filter((f) =>
    f.startsWith('codex-comment-images/'),
  );
  if (imageFiles.length > 0) {
    core.warning(
      `Ignoring changes to codex-comment-images folder: ${imageFiles.join(
        ', ',
      )}`,
    );
    // Remove any image folder changes (downloaded artifacts)
    const imagesDir = path.join(workspace, 'codex-comment-images');
    try {
      await fs.rm(imagesDir, { recursive: true, force: true });
      core.info(`Removed image artifacts directory: ${imagesDir}`);
    } catch (error) {
      core.warning(
        `Failed to remove image artifacts directory: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
  // Filter out workflow and image folder changes
  const effectiveChangedFiles = changedFiles.filter(
    (f) =>
      !f.startsWith('.github/workflows/') &&
      !f.startsWith('codex-comment-images/'),
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
    const startGenerateCommitMessage = Date.now();
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
      `[perf] generateCommitMessage end - ${
        Date.now() - startGenerateCommitMessage
      }ms`,
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
        progressCommentId,
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
        progressCommentId,
      );
    }
  } else if (noPr && effectiveChangedFiles.length > 0) {
    core.info(
      `--no-pr flag used and detected changes in ${effectiveChangedFiles.length} files; posting diff in comment.`,
    );
    let diffOutput = '';
    try {
      const { stdout } = await execa(
        'git',
        ['diff', 'HEAD', '--', ...effectiveChangedFiles],
        { cwd: workspace },
      );
      diffOutput = stdout;
    } catch (err) {
      core.warning(
        `Failed to generate diff for comment: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    const commentBody = `${output}\n\n**Proposed changes:**\n\`\`\`diff\n${diffOutput}\n\`\`\``;
    await upsertComment(octokit, repo, event, progressCommentId, commentBody);
  } else {
    // No non-workflow file changes, update progress comment with AI output
    await upsertComment(octokit, repo, event, progressCommentId, output);
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
  const {
    agentEvent,
    userPrompt,
    includeFullHistory,
    createIssues,
    includeFixBuild,
    includeFetch,
  } = processedEvent;
  core.info(
    `runAction flags: includeFullHistory=${includeFullHistory}, ` +
      `createIssues=${createIssues}, includeFixBuild=${includeFixBuild}, ` +
      `includeFetch=${includeFetch}`,
  );

  // Add eyes reaction (instrumented)
  core.info('[perf] addEyeReaction start');
  const startAddEyeReaction = Date.now();
  await addEyeReaction(octokit, repo, agentEvent.github);
  core.info(
    `[perf] addEyeReaction end - ${Date.now() - startAddEyeReaction}ms`,
  );

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
  core.info('[perf] cloneRepository start');
  const startCloneRepository = Date.now();
  await cloneRepository(
    workspace,
    githubToken,
    repo,
    context,
    octokit,
    agentEvent,
  );
  core.info(
    `[perf] cloneRepository end - ${Date.now() - startCloneRepository}ms`,
  );

  // Capture initial file state (instrumented)
  core.info('[perf] captureFileState start');
  const startCaptureFileState = Date.now();
  const originalFileState = await captureFileState(workspace);
  core.info(
    `[perf] captureFileState end - ${Date.now() - startCaptureFileState}ms`,
  );

  // generate Prompt (with special handling for --fetch, --fix-build, or create issues)
  let effectiveUserPrompt = userPrompt;
  if (includeFetch) {
    core.info('Fetching contents of URLs for --fetch flag');
    const urlRegex = /(https?:\/\/[^\s)]+)/g;
    const urls = userPrompt.match(urlRegex) || [];
    core.info(`Matched URLs for --fetch: ${urls.join(', ')}`);
    if (urls.length > 0) {
      const fetchedParts: string[] = [];
      for (const url of urls) {
        try {
          // Use Jina Reader API to fetch and preprocess content
          const readerUrl = `https://r.jina.ai/${url}`;
          const response = await axios.get<string>(readerUrl, {
            responseType: 'text',
            timeout: 60000,
          });
          let data =
            typeof response.data === 'string'
              ? response.data
              : JSON.stringify(response.data);
          fetchedParts.push(`=== ${url} ===\n${data}`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          fetchedParts.push(`Failed to fetch ${url}: ${msg}`);
        }
      }
      effectiveUserPrompt = `Contents from URLs:\n\n${fetchedParts.join(
        '\n\n',
      )}\n\n${effectiveUserPrompt}`;
    } else {
      core.info('No URLs found to fetch for --fetch flag');
    }
  }
  if (includeFixBuild) {
    core.info('Fetching latest failed CI build logs for --fix-build flag');
    let logs: string;
    try {
      logs = await fetchLatestFailedWorkflowLogs(octokit, repo);
    } catch (err) {
      core.warning(
        `Failed to fetch build logs: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      logs = `Failed to fetch logs: ${
        err instanceof Error ? err.message : String(err)
      }`;
    }
    effectiveUserPrompt = `Latest failed build logs:\n\n${logs}\n\nPlease suggest changes to fix the build errors above.`;
  } else if (createIssues) {
    effectiveUserPrompt = `Please output only a JSON array of feature objects, each with a "title" (concise summary) and "description" (detailed explanation or examples). ${userPrompt}`;
  }

  // Generate prompt for Codex (instrumented)
  core.info('[perf] generatePrompt start');
  const startGeneratePrompt = Date.now();
  let prompt = await generatePrompt(
    octokit,
    repo,
    agentEvent,
    effectiveUserPrompt,
    includeFullHistory,
  );
  core.info(
    `[perf] generatePrompt end - ${Date.now() - startGeneratePrompt}ms`,
  );

  // Handle any images in the prompt by downloading and replacing embeds with placeholders
  const imageUrls = extractImageUrls(prompt);
  let downloadedImageFiles: string[] = [];
  if (imageUrls.length > 0) {
    const imagesDir = path.join(workspace, 'codex-comment-images');
    const allowedPrefix = 'https://github.com/user-attachments/assets/';
    const downloadUrls = imageUrls.filter((url) =>
      url.startsWith(allowedPrefix),
    );
    downloadedImageFiles = await downloadImages(downloadUrls, imagesDir);
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
    const startRunCodex = Date.now();
    const rawOutput: string = await runCodex(
      workspace,
      config,
      prompt,
      timeoutSeconds * 1000,
      allImages,
    );
    core.info(`[perf] runCodex end - ${Date.now() - startRunCodex}ms`);
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
    const msg = error instanceof Error ? error.message : String(error);
    await upsertComment(
      octokit,
      repo,
      agentEvent.github,
      progressCommentId,
      `CLI execution failed: ${msg}`,
    );
    try {
      await removeEyeReaction(octokit, repo, agentEvent.github);
      await addThumbUpReaction(octokit, repo, agentEvent.github);
    } catch (reactionError) {
      core.warning(
        `Failed to update reaction on the original event: ${
          reactionError instanceof Error ? reactionError.message : reactionError
        }`,
      );
    }
    return;
  }
  core.info(`Output: \n${output}`);

  // Handle create issues intent: create issues from JSON output
  if (createIssues) {
    const { createIssuesFromFeaturePlan } = await import('./createIssues.js');
    await createIssuesFromFeaturePlan(
      octokit,
      repo,
      agentEvent.github,
      output,
      progressCommentId,
    );
    // Update reaction from eyes to thumbs up
    try {
      await removeEyeReaction(octokit, repo, agentEvent.github);
      await addThumbUpReaction(octokit, repo, agentEvent.github);
    } catch (reactionError) {
      core.warning(
        `Failed to update reaction on the original issue: ${
          reactionError instanceof Error ? reactionError.message : reactionError
        }`,
      );
    }
    return;
  }

  // Detect file changes (instrumented)
  core.info('[perf] detectChanges start');
  const startDetectChanges = Date.now();
  const changedFiles = await detectChanges(workspace, originalFileState);
  core.info(`[perf] detectChanges end - ${Date.now() - startDetectChanges}ms`);

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

  // Handle the results
  await handleResult(
    config,
    processedEvent,
    output,
    changedFiles,
    progressCommentId,
  );

  core.info('Action completed successfully.');
  // Update reaction from eyes to thumbs up for the original event
  try {
    await removeEyeReaction(octokit, repo, processedEvent.agentEvent.github);
    await addThumbUpReaction(octokit, repo, processedEvent.agentEvent.github);
  } catch (reactionError) {
    core.warning(
      `Failed to update reaction on the original event: ${
        reactionError instanceof Error ? reactionError.message : reactionError
      }`,
    );
  }
}
