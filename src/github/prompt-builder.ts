/**
 * Builds the AI prompt by optionally fetching URLs, logs, and images based on flags.
 */
import * as core from '@actions/core';
import axios from 'axios';
import AdmZip from 'adm-zip';
import path from 'path';

import type { Octokit } from 'octokit';
import type { ActionConfig } from '../config/config';
import type { ProcessedEvent } from './event';
import { GitHubError } from '../utils/errors';
import { extractImageUrls, downloadImages } from '../file/images';
import { generatePrompt } from './prompt';
import { escapeRegExp } from './progress';

/**
 * Fetch the latest failed workflow run logs and return combined text.
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
    // Limit number of files and size per entry to prevent zip-slip and resource exhaustion
    const MAX_ENTRIES = 100;
    const MAX_ENTRY_SIZE = 10 * 1024 * 1024; // 10MB
    if (entries.length > MAX_ENTRIES) {
      throw new GitHubError(
        `Logs archive contains too many files: ${entries.length}`,
      );
    }
    const logs: string[] = [];
    for (const entry of entries) {
      const entryName = entry.entryName;
      const normalized = path.normalize(entryName);
      if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
        throw new GitHubError(
          `Unsafe entry name in logs archive: ${entryName}`,
        );
      }
      const data = entry.getData();
      if (data.length > MAX_ENTRY_SIZE) {
        throw new GitHubError(
          `Log file ${entryName} is too large: ${data.length} bytes`,
        );
      }
      logs.push(`=== ${entryName} ===\n${data.toString('utf8')}`);
    }
    return logs.join('\n\n');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new GitHubError(`Error fetching workflow runs: ${msg}`);
  }
}

/**
 * Prepare the prompt for Codex based on flags and event data, including optionally fetching URLs,
 * adding build logs, and extracting images.
 * @param config - The ActionConfig containing context and clients.
 * @param processedEvent - The normalized event data triggering the action.
 * @returns The final prompt string and a list of downloaded image file paths.
 */
const URL_REGEX = /(https?:\/\/[^\s)]+)/g;
const IMAGE_ALLOWED_PREFIX = 'https://github.com/user-attachments/assets/';

/**
 * Fetch text contents for a list of URLs via an external reader service.
 */
async function fetchUrlContents(urls: string[]): Promise<string[]> {
  return Promise.all(
    urls.map(async (url) => {
      try {
        const readerUrl = `https://r.jina.ai/${url}`;
        const response = await axios.get<string>(readerUrl, {
          responseType: 'text',
          timeout: 60_000,
        });
        const data = typeof response.data === 'string'
          ? response.data
          : JSON.stringify(response.data);
        return `=== ${url} ===\n${data}`;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return `Failed to fetch ${url}: ${msg}`;
      }
    }),
  );
}

/**
 * Assemble and return the effective user prompt, handling fetch, build-fix, and create-issues flags.
 */
async function buildEffectivePrompt(
  processed: ProcessedEvent,
  octokit: Octokit,
  repo: { owner: string; repo: string },
): Promise<string> {
  let prompt = processed.userPrompt;
  if (processed.includeFetch) {
    core.info('Fetching contents of URLs for --fetch flag');
    const urls = Array.from(new Set(prompt.match(URL_REGEX) ?? []));
    core.info(`Matched URLs for --fetch: ${urls.join(', ')}`);
    if (urls.length > 0) {
      const parts = await fetchUrlContents(urls);
      prompt = `Contents from URLs:\n\n${parts.join('\n\n')}\n\n${prompt}`;
    } else {
      core.info('No URLs found to fetch for --fetch flag');
    }
  }
  if (processed.includeFixBuild) {
    core.info('Fetching latest failed CI build logs for --fix-build flag');
    let logs: string;
    try {
      logs = await fetchLatestFailedWorkflowLogs(octokit, repo);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      core.warning(`Failed to fetch build logs: ${msg}`);
      logs = `Failed to fetch logs: ${msg}`;
    }
    prompt = `Latest failed build logs:\n\n${logs}\n\nPlease suggest changes to fix the build errors above.`;
  } else if (processed.createIssues) {
    prompt =
      `Please output only a JSON array of feature objects, each with a ` +
      `"title" (concise summary) and "description" (detailed explanation or examples). ` +
      processed.userPrompt;
  }
  return prompt;
}

/**
 * Prepare the prompt for Codex based on flags and event data,
 * including optional URL fetch, build logs, history, and images.
 */
export async function preparePrompt(
  config: ActionConfig,
  processedEvent: ProcessedEvent,
): Promise<{ prompt: string; downloadedImageFiles: string[] }> {
  const { octokit, repo, workspace } = config;
  const { agentEvent, includeFullHistory } = processedEvent;

  const effective = await buildEffectivePrompt(processedEvent, octokit, repo);

  core.info('[perf] generatePrompt start');
  const start = Date.now();
  let prompt = await generatePrompt(
    octokit,
    repo,
    agentEvent,
    effective,
    includeFullHistory,
  );
  core.info(`[perf] generatePrompt end - ${Date.now() - start}ms`);

  const imageUrls = extractImageUrls(prompt);
  let downloadedImageFiles: string[] = [];
  if (imageUrls.length > 0) {
    const imagesDir = path.join(workspace, 'codex-comment-images');
    const downloadUrls = imageUrls.filter((url) =>
      url.startsWith(IMAGE_ALLOWED_PREFIX),
    );
    downloadedImageFiles = await downloadImages(downloadUrls, imagesDir);
    for (const [i, url] of imageUrls.entries()) {
      const placeholder = `<image_${i}>`;
      const esc = escapeRegExp(url);
      prompt = prompt
        .replace(new RegExp(`!\\[[\\s\\S]*?\\]\\(${esc}\\)`, 'g'), placeholder)
        .replace(new RegExp(`<img[^>]*src=[\\"']${esc}[\\"'][^>]*>`, 'g'), placeholder);
    }
  }
  return { prompt, downloadedImageFiles };
}
