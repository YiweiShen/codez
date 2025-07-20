/**
 * Utilities for retrieving changed files and content data for GitHub events.
 */
import * as core from '@actions/core';
import type { Octokit } from 'octokit';
import type { RepoContext, AgentEvent, GithubContentsData } from './types';
import { GitHubError } from '../utils/errors';

/**
 * Get the list of changed files for a pull request comment event.
 * @param octokit - Authenticated Octokit client.
 * @param repo - Repository owner and name context.
 * @param event - AgentEvent describing the GitHub comment event.
 * @returns Promise resolving to an array of changed file paths.
 */
export async function getChangedFiles(
  octokit: Octokit,
  repo: RepoContext,
  event: AgentEvent,
): Promise<string[]> {
  let prNumber: number;
  if (event.type === 'pullRequestCommentCreated') {
    prNumber = event.github.issue.number;
  } else if (event.type === 'pullRequestReviewCommentCreated') {
    prNumber = event.github.pull_request.number;
  } else {
    throw new GitHubError(
      `Cannot get changed files for event type: ${event.type}`,
    );
  }
  const prFilesResponse = await octokit.rest.pulls.listFiles({
    ...repo,
    pull_number: prNumber,
  });
  return prFilesResponse.data.map((file) => file.filename);
}

/**
 * Retrieve issue or pull request content and associated comments.
 * @param octokit - Authenticated Octokit client.
 * @param repo - Repository owner and name context.
 * @param event - AgentEvent triggering the data retrieval.
 * @returns Promise resolving to content and comments data.
 */
export async function getContentsData(
  octokit: Octokit,
  repo: RepoContext,
  event: AgentEvent,
): Promise<GithubContentsData> {
  if (event.type === 'issuesOpened' || event.type === 'issueCommentCreated') {
    return getIssueData(octokit, repo, event.github.issue.number);
  } else if (event.type === 'pullRequestCommentCreated') {
    return getPullRequestData(octokit, repo, event.github.issue.number);
  } else if (event.type === 'pullRequestReviewCommentCreated') {
    return getPullRequestReviewCommentsData(
      octokit,
      repo,
      event.github.pull_request.number,
      event.github.comment.in_reply_to_id ?? event.github.comment.id,
    );
  }
  throw new GitHubError('Invalid event type for data retrieval');
}

async function getIssueData(
  octokit: Octokit,
  repo: RepoContext,
  issueNumber: number,
): Promise<GithubContentsData> {
  core.info(`Fetching data for issue #${issueNumber}...`);
  try {
    // Fetch issue and its comments via GraphQL in a single request
    core.info(`Fetching data for issue #${issueNumber} via GraphQL...`);
    const query = `
      query($owner: String!, $repo: String!, $issueNumber: Int!) {
        repository(owner: $owner, name: $repo) {
          issue(number: $issueNumber) {
            number
            title
            body
            author { login }
            comments(first: 100) {
              nodes { body author { login } }
            }
          }
        }
      }
    `;
    const resp = await octokit.graphql<{
      repository: {
        issue: {
          number: number;
          title: string;
          body: string | null;
          author: { login: string };
          comments: {
            nodes: { body: string | null; author: { login: string } }[];
          };
        };
      };
    }>(query, {
      owner: repo.owner,
      repo: repo.repo,
      issueNumber,
    });
    const issue = resp.repository.issue;
    const content = {
      number: issue.number,
      title: issue.title,
      body: issue.body ?? '',
      login: issue.author.login,
    };
    const comments = issue.comments.nodes.map((c) => ({
      body: c.body ?? '',
      login: c.author.login,
    }));
    core.info(`Fetched ${comments.length} comments for issue #${issueNumber}.`);
    return { content, comments };
  } catch (error) {
    core.error(`Failed to get data for issue #${issueNumber}: }`);
    throw new GitHubError(`Could not retrieve data for issue #${issueNumber}`);
  }
}

async function getPullRequestData(
  octokit: Octokit,
  repo: RepoContext,
  pullNumber: number,
): Promise<GithubContentsData> {
  core.info(`Fetching data for pull request #${pullNumber} via GraphQL...`);
  try {
    // Fetch PR and its issue‐thread comments via GraphQL
    const query = `
      query($owner: String!, $repo: String!, $prNumber: Int!) {
        repository(owner: $owner, name: $repo) {
          pullRequest(number: $prNumber) {
            number
            title
            body
            author { login }
            comments(first: 100) {
              nodes { body author { login } }
            }
          }
        }
      }
    `;
    const resp = await octokit.graphql<{
      repository: {
        pullRequest: {
          number: number;
          title: string;
          body: string | null;
          author: { login: string };
          comments: {
            nodes: { body: string | null; author: { login: string } }[];
          };
        };
      };
    }>(query, {
      owner: repo.owner,
      repo: repo.repo,
      prNumber: pullNumber,
    });
    const pr = resp.repository.pullRequest;
    const content = {
      number: pr.number,
      title: pr.title,
      body: pr.body ?? '',
      login: pr.author.login,
    };
    const comments = pr.comments.nodes.map((c) => ({
      body: c.body ?? '',
      login: c.author.login,
    }));
    core.info(`Fetched ${comments.length} comments for PR #${pullNumber}.`);
    return { content, comments };
  } catch (error) {
    core.error(`Failed to get data for pull request #${pullNumber}`);
    throw new GitHubError(
      `Could not retrieve data for pull request #${pullNumber}`,
    );
  }
}

async function getPullRequestReviewCommentsData(
  octokit: Octokit,
  repo: RepoContext,
  pullNumber: number,
  targetCommentId: number,
): Promise<GithubContentsData> {
  core.info(`Fetching data for pull request review comments #${pullNumber}...`);
  try {
    // Get PR body
    const prResponse = await octokit.rest.pulls.get({
      ...repo,
      pull_number: pullNumber,
    });
    const content = {
      number: prResponse.data.number,
      title: prResponse.data.title,
      body: prResponse.data.body ?? '',
      login: prResponse.data.user?.login ?? 'anonymous',
    };

    // Get PR review comments
    const commentsData = await octokit.paginate(
      octokit.rest.pulls.listReviewComments,
      {
        ...repo,
        pull_number: pullNumber,
        per_page: 100, // Fetch 100 per page for efficiency
      },
    );

    // Filter comments to include only those related to the target comment ID
    const comments = commentsData
      .filter(
        (comment) =>
          comment.id === targetCommentId ||
          comment.in_reply_to_id === targetCommentId,
      )
      .map((comment) => ({
        body: comment.body ?? '',
        login: comment.user?.login ?? 'anonymous',
      }));
    core.info(
      `Fetched ${commentsData.length} review comments for PR #${pullNumber}.`,
    );

    return { content, comments };
  } catch (error) {
    core.error(
      `Failed to get data for pull request review comments #${pullNumber}`,
    );
    throw new GitHubError(
      `Could not retrieve data for pull request review comments #${pullNumber}`,
    );
  }
}
