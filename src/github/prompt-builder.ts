import * as core from '@actions/core';
import axios from 'axios';
import AdmZip from 'adm-zip';
import path from 'path';

import type { Octokit } from 'octokit';
import type { ActionConfig } from '../config/config';
import type { ProcessedEvent } from './event';
import { GitHubError } from '../utils/errors';
import { extractImageUrls, downloadImages } from '../file/images';
import { generatePrompt } from './github';
import { escapeRegExp } from './progress';

/**
 * Fetches the latest failed workflow run logs for the repository and returns their content.
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
    const logs: string[] = entries.map((entry: any) => {
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

/**
 * Prepare the prompt for Codex based on flags and event data, including optionally fetching URLs,
 * adding build logs, and extracting images.
 * @param config - The ActionConfig containing context and clients.
 * @param processedEvent - The normalized event data triggering the action.
 * @returns The final prompt string and a list of downloaded image file paths.
 */
export async function preparePrompt(
  config: ActionConfig,
  processedEvent: ProcessedEvent,
): Promise<{ prompt: string; downloadedImageFiles: string[] }> {
  const { octokit, repo, workspace } = config;
  const {
    agentEvent,
    userPrompt,
    includeFullHistory,
    includeFetch,
    includeFixBuild,
    createIssues,
  } = processedEvent;
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
          const readerUrl = `https://r.jina.ai/${url}`;
          const response = await axios.get<string>(readerUrl, {
            responseType: 'text',
            timeout: 60000,
          });
          const data =
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
    effectiveUserPrompt = `Please output only a JSON array of feature objects, each with a \"title\" (concise summary) and \"description\" (detailed explanation or examples). ${userPrompt}`;
  }

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
  return { prompt, downloadedImageFiles };
}
