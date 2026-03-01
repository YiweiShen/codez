import path from 'path';
import { promises as fs } from 'fs';
import * as core from '@actions/core';
import { execa } from 'execa';

import { handleResult } from '../../../src/github/result-handler';
import { createPullRequest, commitAndPush } from '../../../src/github/git';
import { upsertComment } from '../../../src/github/comments';
import { generateCommitMessage } from '../../../src/api/openai';

import type { ActionConfig } from '../../../src/config/config';
import type { ProcessedEvent } from '../../../src/github/event';

jest.mock('@actions/core', () => ({
  info: jest.fn(),
  warning: jest.fn(),
}));

jest.mock('execa', () => ({
  execa: jest.fn(),
}));

jest.mock('../../../src/github/git', () => ({
  createPullRequest: jest.fn(),
  commitAndPush: jest.fn(),
}));

jest.mock('../../../src/github/comments', () => ({
  upsertComment: jest.fn(),
}));

jest.mock('../../../src/api/openai', () => ({
  generateCommitMessage: jest.fn(),
}));

describe('handleResult', () => {
  const workspace = '/tmp/workspace';
  const config = {
    workspace,
    octokit: {},
    repo: { owner: 'owner', repo: 'repo' },
  } as unknown as ActionConfig;

  const issueEvent = {
    type: 'codex',
    agentEvent: {
      type: 'issuesOpened',
      github: {
        action: 'opened',
        issue: { number: 42, title: 'Issue', body: 'Body', pull_request: null },
      },
    },
    userPrompt: 'please fix this',
    includeFullHistory: false,
    createIssues: false,
    noPr: false,
    includeFixBuild: false,
    includeFetch: false,
  } as unknown as ProcessedEvent;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('runs one post-processing pipeline before creating a PR', async () => {
    const rmSpy = jest.spyOn(fs, 'rm').mockResolvedValue(undefined);
    (execa as jest.Mock).mockResolvedValue({ stdout: '' });
    (generateCommitMessage as jest.Mock).mockResolvedValue('commit message');

    await handleResult(
      config,
      issueEvent,
      'final output',
      [
        '.github/workflows/ci.yml',
        'codex-comment-images/img.png',
        'src/index.ts',
      ],
      123,
    );

    expect(execa).toHaveBeenCalledWith(
      'git',
      ['checkout', 'HEAD', '--', '.github/workflows'],
      { cwd: workspace, stdio: 'inherit' },
    );
    expect(rmSpy).toHaveBeenCalledWith(
      path.join(workspace, 'codex-comment-images'),
      {
        recursive: true,
        force: true,
      },
    );
    expect(generateCommitMessage).toHaveBeenCalledWith(
      ['src/index.ts'],
      'please fix this',
      { issueNumber: 42, prNumber: undefined },
      config,
    );
    expect(createPullRequest).toHaveBeenCalledTimes(1);
    expect(commitAndPush).not.toHaveBeenCalled();
    expect(upsertComment).not.toHaveBeenCalled();
  });

  it('uses filtered files for --no-pr diff comments', async () => {
    (execa as jest.Mock).mockImplementation((_cmd: string, args: string[]) => {
      if (args[0] === 'checkout') return Promise.resolve({ stdout: '' });
      if (args[0] === 'diff') return Promise.resolve({ stdout: 'diff body' });
      return Promise.resolve({ stdout: '' });
    });

    await handleResult(
      config,
      { ...issueEvent, noPr: true },
      'result body',
      [
        '.github/workflows/ci.yml',
        'codex-comment-images/img.png',
        'src/index.ts',
        'README.md',
      ],
      123,
    );

    expect(execa).toHaveBeenCalledWith(
      'git',
      ['diff', 'HEAD', '--', 'src/index.ts', 'README.md'],
      { cwd: workspace },
    );
    expect(upsertComment).toHaveBeenCalledWith(
      config.octokit,
      config.repo,
      issueEvent.agentEvent.github,
      123,
      expect.stringContaining('**Proposed changes:**'),
    );
    expect(generateCommitMessage).not.toHaveBeenCalled();
    expect(createPullRequest).not.toHaveBeenCalled();
    expect(commitAndPush).not.toHaveBeenCalled();
  });

  it('posts raw output when only ignored files changed', async () => {
    jest.spyOn(fs, 'rm').mockResolvedValue(undefined);
    (execa as jest.Mock).mockResolvedValue({ stdout: '' });

    await handleResult(
      config,
      issueEvent,
      'no publishable changes',
      ['.github/workflows/ci.yml', 'codex-comment-images/img.png'],
      456,
    );

    expect(generateCommitMessage).not.toHaveBeenCalled();
    expect(createPullRequest).not.toHaveBeenCalled();
    expect(commitAndPush).not.toHaveBeenCalled();
    expect(upsertComment).toHaveBeenCalledWith(
      config.octokit,
      config.repo,
      issueEvent.agentEvent.github,
      456,
      'no publishable changes',
    );
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('Ignoring changes to workflow files:'),
    );
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('Ignoring changes to codex-comment-images folder:'),
    );
  });
});
