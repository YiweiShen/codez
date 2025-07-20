import * as core from '@actions/core';
import AdmZip from 'adm-zip';
import type { Octokit } from 'octokit';
import { GitHubError } from '../utils/errors.js';

/**
 * Fetches the latest failed workflow run logs for the repository and returns their content.
 * @param octokit Octokit client
 * @param repo Repository context ({owner, repo})
 * @param repo.owner
 * @param repo.repo
 * @returns String of log content or an informational message
 */
export async function fetchLatestFailedWorkflowLogs(
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
