import fs from 'fs';
import os from 'os';
import path from 'path';

import { loadEventPayload, processEvent } from '../../../src/github/event';

describe('loadEventPayload', () => {
  it('parses valid JSON', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ev-'));
    const filePath = path.join(tmpDir, 'valid.json');
    const data = { hello: 'world' };
    fs.writeFileSync(filePath, JSON.stringify(data));
    const result = await loadEventPayload(filePath);
    expect(result).toEqual(data);
  });

  it('throws error for invalid JSON', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ev-'));
    const filePath = path.join(tmpDir, 'invalid.json');
    fs.writeFileSync(filePath, '{ invalid json }');
    await expect(loadEventPayload(filePath)).rejects.toThrow(
      /Failed to read or parse event payload/,
    );
  });
});

describe('processEvent', () => {
  it('returns direct prompt bypass', async () => {
    const config: any = { directPrompt: 'my-prompt' };
    const result = await processEvent(config);
    expect(result).not.toBeNull();
    expect(result).toEqual({
      type: 'codex',
      agentEvent: {
        type: 'issuesOpened',
        github: {
          action: 'opened',
          issue: { number: 0, title: '', body: '', pull_request: null },
        },
      },
      userPrompt: 'my-prompt',
      includeFullHistory: false,
      createIssues: false,
      noPr: false,
      includeFixBuild: false,
      includeFetch: false,
    });
  });

  it('returns null for unsupported payload', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ev-'));
    const filePath = path.join(tmpDir, 'unsupported.json');
    fs.writeFileSync(filePath, JSON.stringify({}));
    const config: any = {
      directPrompt: '',
      eventPath: filePath,
      triggerPhrase: '/codex',
      assigneeTrigger: [],
    };
    const result = await processEvent(config);
    expect(result).toBeNull();
  });

  it('skips issuesAssigned when assignee not in trigger list', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ev-'));
    const filePath = path.join(tmpDir, 'assigned.json');
    const payload = {
      action: 'assigned',
      issue: { number: 1, title: 'T', body: 'B', pull_request: null },
      assignee: { login: 'user1' },
    };
    fs.writeFileSync(filePath, JSON.stringify(payload));
    const config: any = {
      directPrompt: '',
      eventPath: filePath,
      triggerPhrase: '/codex',
      assigneeTrigger: ['other'],
    };
    const result = await processEvent(config);
    expect(result).toBeNull();
  });

  it('triggers issuesAssigned when assignee in trigger list', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ev-'));
    const filePath = path.join(tmpDir, 'assigned2.json');
    const payload = {
      action: 'assigned',
      issue: { number: 2, title: 'Title', body: 'Body', pull_request: null },
      assignee: { login: 'user2' },
    };
    fs.writeFileSync(filePath, JSON.stringify(payload));
    const config: any = {
      directPrompt: '',
      eventPath: filePath,
      triggerPhrase: '/codex',
      assigneeTrigger: ['user2'],
    };
    const result = await processEvent(config);
    expect(result).toEqual({
      type: 'codex',
      agentEvent: { type: 'issuesAssigned', github: payload },
      userPrompt: 'Title\n\nBody',
      includeFullHistory: false,
      createIssues: false,
      noPr: false,
      includeFixBuild: false,
      includeFetch: false,
    });
  });

  it('returns null for comment event without trigger phrase', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ev-'));
    const filePath = path.join(tmpDir, 'comment.json');
    const payload = {
      action: 'created',
      issue: { number: 3, title: 'T', body: 'B', pull_request: null },
      comment: { id: 5, body: 'hello' },
    };
    fs.writeFileSync(filePath, JSON.stringify(payload));
    const config: any = {
      directPrompt: '',
      eventPath: filePath,
      triggerPhrase: '/codex',
      assigneeTrigger: [],
    };
    const result = await processEvent(config);
    expect(result).toBeNull();
  });

  it('processes comment event with flags and prompt', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ev-'));
    const filePath = path.join(tmpDir, 'comment2.json');
    const payload = {
      action: 'created',
      issue: {
        number: 4,
        title: 'Test Title',
        body: 'Body text',
        pull_request: null,
      },
      comment: {
        id: 20,
        body: '/codex --full-history --create-issues do something',
      },
    };
    fs.writeFileSync(filePath, JSON.stringify(payload));
    const config: any = {
      directPrompt: '',
      eventPath: filePath,
      triggerPhrase: '/codex',
      assigneeTrigger: [],
    };
    const result = (await processEvent(config))!;
    expect(result.type).toBe('codex');
    expect(result.includeFullHistory).toBe(true);
    expect(result.createIssues).toBe(true);
    expect(result.userPrompt).toBe('Test Title\n\ndo something');
    expect(result.agentEvent).toEqual({
      type: 'issueCommentCreated',
      github: payload,
    });
  });
  it('returns null when only trigger phrase without prompt', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ev-'));
    const filePath = path.join(tmpDir, 'comment3.json');
    const payload = {
      action: 'created',
      issue: { number: 5, title: 'T5', body: 'B5', pull_request: null },
      comment: { id: 6, body: '/codex' },
    };
    fs.writeFileSync(filePath, JSON.stringify(payload));
    const config: any = {
      directPrompt: '',
      eventPath: filePath,
      triggerPhrase: '/codex',
      assigneeTrigger: [],
    };
    const result = await processEvent(config);
    expect(result).toBeNull();
  });
  it('parses no-pr, fix-build, and fetch flags in comment event', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ev-'));
    const filePath = path.join(tmpDir, 'comment4.json');
    const payload = {
      action: 'created',
      issue: { number: 7, title: 'Title7', body: 'Body7', pull_request: null },
      comment: { id: 8, body: '/codex --no-pr --fix-build --fetch do it' },
    };
    fs.writeFileSync(filePath, JSON.stringify(payload));
    const config: any = {
      directPrompt: '',
      eventPath: filePath,
      triggerPhrase: '/codex',
      assigneeTrigger: [],
    };
    const result = (await processEvent(config))!;
    expect(result.noPr).toBe(true);
    expect(result.includeFixBuild).toBe(true);
    expect(result.includeFetch).toBe(true);
    expect(result.includeFullHistory).toBe(false);
    expect(result.createIssues).toBe(false);
    expect(result.userPrompt).toBe('Title7\n\ndo it');
  });
  it('parses directPrompt with fix-build and fetch flags', async () => {
    const config: any = {
      directPrompt: '--fix-build --fetch my direct prompt',
    };
    const result = await processEvent(config);
    expect(result).not.toBeNull();
    expect(result!.includeFixBuild).toBe(true);
    expect(result!.includeFetch).toBe(true);
    expect(result!.userPrompt).toBe('my direct prompt');
    expect(result!.includeFullHistory).toBe(false);
    expect(result!.createIssues).toBe(false);
    expect(result!.noPr).toBe(false);
  });
});
