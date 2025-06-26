import { escapeRegExp, createProgressComment, updateProgressComment, createIssuesFromFeaturePlan } from '../../../src/github/action';
import * as githubHelpers from '../../../src/github/github';
import type { Octokit } from 'octokit';
import type { GitHubEvent } from '../../../src/github/github';

describe('escapeRegExp', () => {
  it('escapes special regex characters', () => {
    const input = '.*+?^${}()|[]\\';
    const output = escapeRegExp(input);
    const expected = '\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\\\|\\[\\]\\\\';
    expect(output).toBe(expected);
    // strings without special characters remain unchanged
    expect(escapeRegExp('abc123')).toBe('abc123');
  });
});

describe('createProgressComment', () => {
  const repo = { owner: 'owner', repo: 'repo' };
  const steps = ['step1', 'step2'];

  it('posts an issue comment with unchecked steps and returns comment id', async () => {
    const mockCreate = jest.fn().mockResolvedValue({ data: { id: 123 } });
    const octokit = { rest: { issues: { createComment: mockCreate } } } as unknown as Octokit;
    const event = { issue: { number: 1 } } as unknown as GitHubEvent;
    const id = await createProgressComment(octokit, repo, event, steps);
    expect(id).toBe(123);
    expect(mockCreate).toHaveBeenCalledWith({
      ...repo,
      issue_number: 1,
      body: expect.stringContaining('**🚀 Codez Progress**'),
    });
    const body = mockCreate.mock.calls[0][0].body;
    expect(body).toContain('- [ ] step1');
    expect(body).toContain('- [ ] step2');
  });

  it('posts a PR review reply comment with unchecked steps and returns comment id', async () => {
    const mockReply = jest.fn().mockResolvedValue({ data: { id: 456 } });
    const octokit = { rest: { pulls: { createReplyForReviewComment: mockReply } } } as unknown as Octokit;
    const event = { pull_request: { number: 2 }, comment: { id: 10, in_reply_to_id: undefined } } as unknown as GitHubEvent;
    const id = await createProgressComment(octokit, repo, event, ['s1']);
    expect(id).toBe(456);
    expect(mockReply).toHaveBeenCalledWith({
      ...repo,
      pull_number: 2,
      comment_id: 10,
      body: expect.stringContaining('- [ ] s1'),
    });
  });
});

describe('updateProgressComment', () => {
  const repo = { owner: 'owner', repo: 'repo' };
  const steps = ['- [x] done', '- [ ] todo'];

  it('updates an issue comment with provided steps', async () => {
    const mockUpdate = jest.fn().mockResolvedValue({});
    const octokit = { rest: { issues: { updateComment: mockUpdate } } } as unknown as Octokit;
    const event = { issue: { number: 5 } } as unknown as GitHubEvent;
    await updateProgressComment(octokit, repo, event, 789, steps);
    expect(mockUpdate).toHaveBeenCalledWith({
      ...repo,
      comment_id: 789,
      body: expect.stringContaining('**🚀 Codez Progress**'),
    });
    const body = mockUpdate.mock.calls[0][0].body;
    expect(body).toContain(steps[0]);
    expect(body).toContain(steps[1]);
  });

  it('updates a PR review comment with provided steps', async () => {
    const mockReview = jest.fn().mockResolvedValue({});
    const octokit = { rest: { pulls: { updateReviewComment: mockReview } } } as unknown as Octokit;
    const event = { pull_request: { number: 7 } } as unknown as GitHubEvent;
    await updateProgressComment(octokit, repo, event, 321, steps);
    expect(mockReview).toHaveBeenCalledWith({
      ...repo,
      comment_id: 321,
      body: expect.stringContaining('**🚀 Codez Progress**'),
    });
  });
});

describe('createIssuesFromFeaturePlan', () => {
  const repo = { owner: 'owner', repo: 'repo' };
  const event = { issue: { number: 1 } } as unknown as GitHubEvent;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('creates issues for valid JSON feature plan', async () => {
    const features = [
      { title: 'T1', description: 'D1' },
      { title: 'T2', description: 'D2' },
    ];
    const mockCreate = jest.fn()
      .mockResolvedValueOnce({ data: { number: 11 } })
      .mockResolvedValueOnce({ data: { number: 22 } });
    const octokit = { rest: { issues: { create: mockCreate } } } as unknown as Octokit;
    const postSpy = jest.spyOn(githubHelpers, 'postComment').mockResolvedValue();
    await createIssuesFromFeaturePlan(octokit, repo, event, JSON.stringify(features));
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(mockCreate).toHaveBeenNthCalledWith(1, { ...repo, title: 'T1', body: 'D1' });
    expect(mockCreate).toHaveBeenNthCalledWith(2, { ...repo, title: 'T2', body: 'D2' });
    expect(postSpy).toHaveBeenCalledWith(octokit, repo, event, 'Created new feature issue #11 for "T1"');
    expect(postSpy).toHaveBeenCalledWith(octokit, repo, event, 'Created new feature issue #22 for "T2"');
  });

  it('posts error comment for invalid JSON', async () => {
    const octokit = { rest: { issues: { create: jest.fn() } } } as unknown as Octokit;
    const postSpy = jest.spyOn(githubHelpers, 'postComment').mockResolvedValue();
    await createIssuesFromFeaturePlan(octokit, repo, event, 'not json');
    expect(postSpy).toHaveBeenCalledTimes(1);
    const msg = postSpy.mock.calls[0][3] as string;
    expect(msg).toMatch(/^Failed to parse feature plan JSON:/);
  });

  it('posts error comment for wrong format', async () => {
    const octokit = { rest: { issues: { create: jest.fn() } } } as unknown as Octokit;
    const postSpy = jest.spyOn(githubHelpers, 'postComment').mockResolvedValue();
    // valid JSON but not an array
    await createIssuesFromFeaturePlan(octokit, repo, event, JSON.stringify({ title: 'X' }));
    expect(postSpy).toHaveBeenCalledWith(
      octokit,
      repo,
      event,
      'Feature plan JSON is not an array. Please output an array of feature objects.',
    );
  });