/**
 * @file Module for creating GitHub issues from a feature plan JSON output.
 */

import * as core from '@actions/core';
import type { Octokit } from 'octokit';

import type { GitHubEvent } from './types';
import { postComment, upsertComment } from './comments';

type Feature = {
  title: string;
  description: string;
};

/**
 * Parse the feature plan output into an array of Feature objects.
 * Attempts a fallback match of the first JSON array in the output if the initial parse fails.
 * @throws Error with a descriptive message on failure.
 */
function parseFeatures(output: string): Feature[] {
  try {
    return JSON.parse(output);
  } catch (error) {
    const match = output.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (parseError) {
        throw new Error(
          `Failed to parse feature plan JSON: ${
            parseError instanceof Error ? parseError.message : parseError
          }`
        );
      }
    }
    throw new Error(
      `Failed to parse feature plan JSON: ${
        error instanceof Error ? error.message : error
      }`
    );
  }
}

/**
 * Validate that the parsed data is an array of Feature objects.
 * @throws Error with a descriptive message on invalid format.
 */
function validateFeatures(features: unknown): Feature[] {
  if (!Array.isArray(features)) {
    throw new Error(
      'Feature plan JSON is not an array. Please output an array of feature objects.'
    );
  }

  features.forEach((feature, index) => {
    if (
      typeof feature !== 'object' ||
      feature === null ||
      typeof (feature as any).title !== 'string' ||
      typeof (feature as any).description !== 'string'
    ) {
      throw new Error(
        `Invalid feature format at index ${index}. Each feature must be an object with 'title' (string) and 'description' (string).`
      );
    }
  });

  return features as Feature[];
}

/**
 * Creates GitHub issues based on a JSON feature plan output.
 * @param octokit - Authenticated Octokit client.
 * @param repo - Repository owner and repository name.
 * @param event - GitHubEvent triggering issue creation.
 * @param output - JSON string containing the feature plan.
 * @param progressCommentId - Optional ID of a progress comment to update.
 * @returns Promise that resolves when issues are created.
 */
export async function createIssuesFromFeaturePlan(
  octokit: Octokit,
  repo: { owner: string; repo: string },
  event: GitHubEvent,
  output: string,
  progressCommentId?: number,
): Promise<void> {
  let features: Feature[];
  try {
    features = parseFeatures(output);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await postComment(octokit, repo, event, message);
    return;
  }

  try {
    features = validateFeatures(features);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await postComment(octokit, repo, event, message);
    return;
  }

  for (const [index, feature] of features.entries()) {
    try {
      const issue = await octokit.rest.issues.create({
        ...repo,
        title: feature.title,
        body: feature.description,
      });
      core.info(`Created feature issue #${issue.data.number}: ${feature.title}`);

      const commentBody = `Created new feature issue #${issue.data.number} for "${feature.title}"`;

      if (index === 0 && progressCommentId) {
        await upsertComment(octokit, repo, event, progressCommentId, commentBody);
      } else {
        await postComment(octokit, repo, event, commentBody);
      }
    } catch (error) {
      core.warning(
        `Failed to create issue for feature "${feature.title}": ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
