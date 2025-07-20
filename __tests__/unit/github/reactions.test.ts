import { jest, describe, it, expect } from '@jest/globals';
import type { Octokit } from 'octokit';
import { addThumbUpReaction } from '../../../src/github/reactions';

describe('addThumbUpReaction', () => {
  const repo = { owner: 'owner', repo: 'repo' };

  it('removes eyes reaction and adds thumbs up to issue', async () => {
    const reactions = { data: [{ content: 'eyes', id: 1, user: { login: 'github-actions[bot]' } }] };
    const octokit = {
      rest: {
        reactions: {
          listForIssue: jest.fn().mockResolvedValue(reactions),
          deleteForIssue: jest.fn().mockResolvedValue({}),
          createForIssue: jest.fn().mockResolvedValue({}),
        },
      },
    } as unknown as Octokit;
    const event: any = { action: 'opened', issue: { number: 5 } };
    await addThumbUpReaction(octokit, repo, event);
    expect(octokit.rest.reactions.deleteForIssue).toHaveBeenCalledWith({
      ...repo,
      issue_number: 5,
      reaction_id: 1,
    });
    expect(octokit.rest.reactions.createForIssue).toHaveBeenCalledWith({
      ...repo,
      issue_number: 5,
      content: '+1',
    });
  });

  it('removes eyes reaction and adds thumbs up to issue comment', async () => {
    const reactions = { data: [{ content: 'eyes', id: 2, user: { login: 'github-actions[bot]' } }] };
    const octokit = {
      rest: {
        reactions: {
          listForIssueComment: jest.fn().mockResolvedValue(reactions),
          deleteForIssueComment: jest.fn().mockResolvedValue({}),
          createForIssueComment: jest.fn().mockResolvedValue({}),
        },
      },
    } as unknown as Octokit;
    const event: any = { action: 'created', comment: { id: 10 }, issue: { number: 6 } };
    await addThumbUpReaction(octokit, repo, event);
    expect(octokit.rest.reactions.deleteForIssueComment).toHaveBeenCalledWith({
      ...repo,
      comment_id: 10,
      reaction_id: 2,
    });
    expect(octokit.rest.reactions.createForIssueComment).toHaveBeenCalledWith({
      ...repo,
      comment_id: 10,
      content: '+1',
    });
  });

  it('removes eyes reaction and adds thumbs up to review comment', async () => {
    const reactions = { data: [{ content: 'eyes', id: 3, user: { login: 'github-actions[bot]' } }] };
    const octokit = {
      rest: {
        reactions: {
          listForPullRequestReviewComment: jest.fn().mockResolvedValue(reactions),
          deleteForPullRequestReviewComment: jest.fn().mockResolvedValue({}),
          createForPullRequestReviewComment: jest.fn().mockResolvedValue({}),
        },
      },
    } as unknown as Octokit;
    const event: any = { action: 'created', comment: { id: 20 }, pull_request: { number: 7 } };
    await addThumbUpReaction(octokit, repo, event);
    expect(octokit.rest.reactions.deleteForPullRequestReviewComment).toHaveBeenCalledWith({
      ...repo,
      comment_id: 20,
      reaction_id: 3,
    });
    expect(octokit.rest.reactions.createForPullRequestReviewComment).toHaveBeenCalledWith({
      ...repo,
      comment_id: 20,
      content: '+1',
    });
  });
});
