/**
 * Construct AI prompts based on GitHub event content and user input.
 */
import type { Octokit } from 'octokit';
import type { RepoContext, AgentEvent } from './types';
import { promptBuilderConfig } from '../config/prompts';
import { genContentsString, genFullContentsString } from '../utils/contents';
import { getContentsData, getChangedFiles } from './github';

/**
 * Generate the AI prompt based on event context and user input.
 * @param octokit - Authenticated Octokit client.
 * @param repo - Repository owner and name context.
 * @param event - AgentEvent containing the GitHub event data.
 * @param userPrompt - User-specified prompt text.
 * @param includeFullHistory - Whether to include the full conversation history.
 * @returns Promise resolving to the constructed prompt string.
 */
export async function generatePrompt(
  octokit: Octokit,
  repo: RepoContext,
  event: AgentEvent,
  userPrompt: string,
  includeFullHistory: boolean,
): Promise<string> {
  const contents = await getContentsData(octokit, repo, event);
  const filteredComments = contents.comments.filter(
    (comment) => !comment.body.trim().startsWith('**🚀 Codez Progress**'),
  );
  let prFiles: string[] = [];
  let contextInfo = '';
  if (
    event.type === 'pullRequestCommentCreated' ||
    event.type === 'pullRequestReviewCommentCreated'
  ) {
    prFiles = await getChangedFiles(octokit, repo, event);
  }
  if (event.type === 'pullRequestReviewCommentCreated') {
    const comment = event.github.comment;
    contextInfo = `Comment on file: ${comment.path}`;
    if (comment.line) {
      contextInfo += `, line: ${comment.line}`;
    }
  }
  const formatter = includeFullHistory
    ? genFullContentsString
    : genContentsString;
  let historyPrompt = formatter(contents.content);
  for (const comment of filteredComments) {
    historyPrompt += formatter(comment);
  }
  let prompt = '';
  if (
    (event.type === 'issuesOpened' || event.type === 'issueCommentCreated') &&
    contents.content.title
  ) {
    prompt +=
      `${promptBuilderConfig.titleLabel}\n${contents.content.title}\n\n`;
  }
  if (historyPrompt) {
    prompt += `${promptBuilderConfig.historyLabel}\n${historyPrompt}\n\n`;
  }
  if (contextInfo) {
    prompt += `${promptBuilderConfig.contextLabel}\n${contextInfo}\n\n`;
  }
  if (prFiles.length > 0) {
    prompt += `${promptBuilderConfig.changedFilesLabel}\n${prFiles.join(
      '\n',
    )}\n\n`;
  }
  if (prompt) {
    prompt += `${promptBuilderConfig.promptSeparator}\n\n${userPrompt}`;
  } else {
    prompt = userPrompt;
  }
  return prompt;
}
