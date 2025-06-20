import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock OpenAI client to capture options and simulate chat completions
const createMock = jest.fn();
class MockOpenAI {
  options: any;
  chat: any;
  constructor(options: any) {
    this.options = options;
    this.chat = { completions: { create: createMock } };
  }
}
jest.unstable_mockModule('openai', () => ({
  __esModule: true,
  default: MockOpenAI,
}));

// Import after mocking to ensure MockOpenAI is used
const { getOpenAIClient, defaultModel, generateCommitMessage } = await import(
  '../../src/api/openai.js'
);

beforeEach(() => {
  createMock.mockReset();
});

describe('getOpenAIClient', () => {
  it('sets apiKey and leaves baseURL undefined when openaiBaseUrl is empty', () => {
    const config = { openaiApiKey: 'test-key', openaiBaseUrl: '' } as any;
    const client = getOpenAIClient(config);
    expect(client.options.apiKey).toBe('test-key');
    expect(client.options.baseURL).toBeUndefined();
  });

  it('sets apiKey and baseURL when openaiBaseUrl is provided', () => {
    const config = {
      openaiApiKey: 'key2',
      openaiBaseUrl: 'https://api.example.com',
    } as any;
    const client = getOpenAIClient(config);
    expect(client.options.apiKey).toBe('key2');
    expect(client.options.baseURL).toBe('https://api.example.com');
  });
});

describe('generateCommitMessage', () => {
  const config = {
    openaiApiKey: 'key',
    openaiBaseUrl: '',
    openaiModel: 'model',
  } as any;
  const changedFiles = ['file1.ts', 'file2.ts'];
  const userPrompt = 'Test prompt';

  it('returns a valid one-line commit message', async () => {
    createMock.mockResolvedValueOnce({
      choices: [{ message: { content: 'feat: add feature\nDetails' } }],
    });
    const result = await generateCommitMessage(
      changedFiles,
      userPrompt,
      { prNumber: 10 },
      config,
    );
    expect(result).toBe('feat: add feature');
  });

  it('falls back to PR message on empty commit', async () => {
    createMock.mockResolvedValueOnce({
      choices: [{ message: { content: '' } }],
    });
    const result = await generateCommitMessage(
      changedFiles,
      userPrompt,
      { prNumber: 5 },
      config,
    );
    expect(result).toBe('chore: apply changes for PR #5');
  });

  it('falls back to Issue message on too long commit', async () => {
    const longContent = 'a'.repeat(101);
    createMock.mockResolvedValueOnce({
      choices: [{ message: { content: longContent } }],
    });
    const result = await generateCommitMessage(
      changedFiles,
      userPrompt,
      { issueNumber: 3 },
      config,
    );
    expect(result).toBe('chore: apply changes for Issue #3');
  });

  it('falls back to file count message when no context', async () => {
    createMock.mockResolvedValueOnce({
      choices: [{ message: { content: '' } }],
    });
    const result = await generateCommitMessage(
      changedFiles,
      userPrompt,
      {},
      config,
    );
    expect(result).toBe('chore: apply changes to 2 files');
    createMock.mockResolvedValueOnce({
      choices: [{ message: { content: '' } }],
    });
    const single = await generateCommitMessage(
      ['one.ts'],
      userPrompt,
      {},
      config,
    );
    expect(single).toBe('chore: apply changes to 1 file');
  });
});
