import * as core from '@actions/core';
import type { Octokit } from 'octokit';
import type { GitHubEvent } from './github.js';
import { postComment } from './github.js';

/**
 * Creates GitHub issues based on a JSON feature plan output.
 */
export async function createIssuesFromFeaturePlan(
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
        `Created new feature issue #${issue.data.number} for \"${feature.title}\"`,
      );
    } catch (error) {
      core.warning(
        `Failed to create issue for feature \"${feature.title}\": ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}