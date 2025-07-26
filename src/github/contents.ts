/**
 * Utilities for retrieving changed files and content data for GitHub events.
 */
import * as core from '@actions/core';
import type { Octokit } from 'octokit';
import type { RepoContext, AgentEvent, GitHubContentsData } from './types';
import { GitHubError } from '../utils/errors';

// Helper types for GraphQL content fetching
type GraphQLContentNode = 'issue' | 'pullRequest';

interface GraphQLContentResp<Node extends GraphQLContentNode> {
  repository: {
    [K in Node]: {
      number: number;
      title: string;
      body: string | null;
      author: { login: string };
      comments: { nodes: { body: string | null; author: { login: string } }[] };
    };
  };
}

/**
 * Generic fetch for issue or pull request content and comments via GraphQL.
 */
async function fetchContentNode<Node extends GraphQLContentNode>(
  octokit: Octokit,
  repo: RepoContext,
  nodeType: Node,
  numberArg: number,
): Promise<GitHubContentsData> {
  const label = nodeType === 'issue' ? 'issue' : 'pull request';
  core.info(`Fetching data for ${label} #${numberArg} via GraphQL...`);
  const query = `
    query($owner: String!, $repo: String!, $numberArg: Int!) {
      repository(owner: $owner, name: $repo) {
        ${nodeType}(number: $numberArg) {
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
  try {
    const resp = await octokit.graphql<GraphQLContentResp<Node>>(query, {
      owner: repo.owner,
      repo: repo.repo,
      numberArg,
    });
    const node = resp.repository[nodeType];
    const content = {
      number: node.number,
      title: node.title,
      body: node.body ?? '',
      login: node.author.login,
    };
    const comments = node.comments.nodes.map((c) => ({
      body: c.body ?? '',
      login: c.author.login,
    }));
    core.info(`Fetched ${comments.length} comments for ${label} #${numberArg}.`);
    return { content, comments };
  } catch {
    core.error(`Failed to get data for ${label} #${numberArg}`);
    throw new GitHubError(`Could not retrieve data for ${label} #${numberArg}`);
  }
}

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
  const prNumber = (() => {
    switch (event.type) {
      case 'pullRequestCommentCreated':
        return event.github.issue.number;
      case 'pullRequestReviewCommentCreated':
        return event.github.pull_request.number;
      default:
        throw new GitHubError(`Cannot get changed files for event type: ${event.type}`);
    }
  })();

  const { data: files } = await octokit.rest.pulls.listFiles({
    ...repo,
    pull_number: prNumber,
  });
  return files.map(({ filename }) => filename);
}

/**
 * Retrieve issue or pull request content and associated comments.
 * @param octokit - Authenticated Octokit client.
 * @param repo - Repository owner and name context.
 * @param event - AgentEvent triggering the data retrieval.
 * @returns Promise resolving to content and comments data.
 */
/**
 * Retrieve content and comments for issues and pull requests based on the event.
 */
export async function getContentsData(
  octokit: Octokit,
  repo: RepoContext,
  event: AgentEvent,
): Promise<GitHubContentsData> {
  switch (event.type) {
    case 'issuesOpened':
    case 'issueCommentCreated':
      return fetchContentNode(octokit, repo, 'issue', event.github.issue.number);

    case 'pullRequestCommentCreated':
      return fetchContentNode(octokit, repo, 'pullRequest', event.github.issue.number);

    case 'pullRequestReviewCommentCreated':
      return getPullRequestReviewCommentsData(
        octokit,
        repo,
        event.github.pull_request.number,
        event.github.comment.in_reply_to_id ?? event.github.comment.id,
      );

    default:
      throw new GitHubError(`Invalid event type for data retrieval: ${event.type}`);
  }
}



async function getPullRequestReviewCommentsData(
  octokit: Octokit,
  repo: RepoContext,
  pullNumber: number,
  targetCommentId: number,
): Promise<GitHubContentsData> {
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
