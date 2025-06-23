import { jest } from '@jest/globals';
import { generatePrompt } from '../../../src/github/github.js';

// We will spy on these in‐module helpers
import * as githubModule from '../../../src/github/github.js';

describe('generatePrompt', () => {
  const fakeOctokit = {} as any;
  const fakeRepo = { owner: 'o', repo: 'r' } as any;
  const USER_PROMPT = 'Please do the thing.';

  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('no history, no files → returns just userPrompt', async () => {
    jest.spyOn(githubModule, 'getContentsData').mockResolvedValue({
      content: { body: '', title: '', login: 'u' },
      comments: [],
    });
    jest.spyOn(githubModule, 'getChangedFiles').mockResolvedValue([]);

    const result = await generatePrompt(
      fakeOctokit,
      fakeRepo,
      {
        type: 'issueCommentCreated',
        github: { comment: {}, issue: { number: 1 } },
      } as any,
      USER_PROMPT,
      false,
    );
    expect(result).toBe(USER_PROMPT);
  });

  it('partial history → includes [History] with only bot‐comments', async () => {
    const content = { body: 'body text', title: 'T', login: 'user1' };
    const comments = [
      { body: 'first', login: 'github-actions[bot]' },
      { body: 'second', login: 'alice' },
    ];
    jest
      .spyOn(githubModule, 'getContentsData')
      .mockResolvedValue({ content, comments });
    jest.spyOn(githubModule, 'getChangedFiles').mockResolvedValue([]);

    const result = await generatePrompt(
      fakeOctokit,
      fakeRepo,
      {
        type: 'issueCommentCreated',
        github: { comment: {}, issue: { number: 1 } },
      } as any,
      USER_PROMPT,
      false,
    );
    // should include [History], quoted 'body text' and 'first', but not 'second'
    expect(result).toMatch(/\[History\]/);
    expect(result).toMatch(/> first/);
    expect(result).not.toMatch(/second/);
    expect(result.endsWith(USER_PROMPT)).toBe(true);
  });

  it('full history → includes [History] with all comments', async () => {
    const content = { body: 'X', title: 'T', login: 'user1' };
    const comments = [
      { body: 'A', login: 'bob' },
      { body: 'B', login: 'carol' },
    ];
    jest
      .spyOn(githubModule, 'getContentsData')
      .mockResolvedValue({ content, comments });
    jest.spyOn(githubModule, 'getChangedFiles').mockResolvedValue([]);

    const result = await generatePrompt(
      fakeOctokit,
      fakeRepo,
      {
        type: 'issueCommentCreated',
        github: { comment: {}, issue: { number: 1 } },
      } as any,
      USER_PROMPT,
      true,
    );
    expect(result).toMatch(/\[History\]/);
    expect(result).toMatch(/> A/);
    expect(result).toMatch(/> B/);
  });

  it('review‐comment event → includes [Context] section', async () => {
    jest.spyOn(githubModule, 'getContentsData').mockResolvedValue({
      content: { body: '', title: '', login: 'u' },
      comments: [],
    });
    jest.spyOn(githubModule, 'getChangedFiles').mockResolvedValue([]);
    const evt = {
      type: 'pullRequestReviewCommentCreated',
      github: {
        comment: { path: 'foo.ts', line: 42 },
        pull_request: { number: 7 },
      },
    } as any;
    const result = await generatePrompt(
      fakeOctokit,
      fakeRepo,
      evt,
      USER_PROMPT,
      false,
    );
    expect(result).toMatch(/\[Context\]/);
    expect(result).toMatch(/Comment on file: foo.ts, line: 42/);
  });

  it('with changed files → includes [Changed Files] list', async () => {
    jest.spyOn(githubModule, 'getContentsData').mockResolvedValue({
      content: { body: '', title: '', login: 'u' },
      comments: [],
    });
    jest
      .spyOn(githubModule, 'getChangedFiles')
      .mockResolvedValue(['a.ts', 'b.js']);
    const evt = {
      type: 'pullRequestCommentCreated',
      github: { comment: {}, issue: { number: 99 } },
    } as any;
    const result = await generatePrompt(
      fakeOctokit,
      fakeRepo,
      evt,
      USER_PROMPT,
      false,
    );
    expect(result).toMatch(/\[Changed Files\]/);
    expect(result).toMatch(/a\.ts/);
    expect(result).toMatch(/b\.js/);
  });
});
