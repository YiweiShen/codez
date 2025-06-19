import { parseEnvInput, parseListInput, getConfig } from '../../../src/config/config';
import * as core from '@actions/core';
import * as github from '@actions/github';
import { defaultModel } from '../../../src/api/openai';
import { Octokit } from 'octokit';

describe('parseEnvInput', () => {
  it('returns empty object for empty input', () => {
    expect(parseEnvInput('')).toEqual({});
  });

  it('parses comma-separated key=value pairs', () => {
    expect(parseEnvInput('VAR1=value1,VAR2=value2')).toEqual({
      VAR1: 'value1',
      VAR2: 'value2',
    });
  });

  it('trims whitespace around keys and values', () => {
    expect(parseEnvInput('VAR1 = value1 , VAR2= value2 ')).toEqual({
      VAR1: 'value1',
      VAR2: 'value2',
    });
  });

  it('parses multiline YAML mapping', () => {
    const input = `
VAR1: value1
VAR2: "value2"
VAR3: 'value3'
`;
    expect(parseEnvInput(input)).toEqual({
      VAR1: 'value1',
      VAR2: 'value2',
      VAR3: 'value3',
    });
  });

  it('ignores invalid lines in YAML mapping', () => {
    const input = `
VAR1: value1
invalid line
VAR2: value2
`;
    expect(parseEnvInput(input)).toEqual({ VAR1: 'value1', VAR2: 'value2' });
  });
});

describe('parseListInput', () => {
  it('returns empty array for empty input', () => {
    expect(parseListInput('')).toEqual([]);
  });

  it('parses comma-separated list', () => {
    expect(parseListInput('a,b, c ,, d')).toEqual(['a', 'b', 'c', 'd']);
  });

  it('parses newline-separated list', () => {
    const input = `
  a
  b

  c
  `;
    expect(parseListInput(input)).toEqual(['a', 'b', 'c']);
  });

  it('parses single-item input', () => {
    expect(parseListInput('single')).toEqual(['single']);
  });
});

describe('getConfig', () => {
  let getInputMock: jest.SpyInstance;
  beforeEach(() => {
    jest.resetAllMocks();
    getInputMock = jest.spyOn(core, 'getInput');
    (github as any).context = { repo: { owner: 'owner', repo: 'repo' } };
  });

  it('throws when openai-api-key is missing', () => {
    getInputMock.mockImplementation((name: string) => {
      if (name === 'github-token') return 'token';
      if (name === 'event-path') return 'path';
      if (name === 'openai-api-key') return '';
      return '';
    });
    expect(() => getConfig()).toThrow('OpenAI API key is required.');
  });

  it('throws when github-token is missing', () => {
    getInputMock.mockImplementation((name: string) => {
      if (name === 'github-token') return '';
      if (name === 'event-path') return 'path';
      if (name === 'openai-api-key') return 'key';
      return '';
    });
    expect(() => getConfig()).toThrow('GitHub Token is required.');
  });

  it('throws when event-path is missing', () => {
    getInputMock.mockImplementation((name: string) => {
      if (name === 'github-token') return 'token';
      if (name === 'event-path') return '';
      if (name === 'openai-api-key') return 'key';
      return '';
    });
    expect(() => getConfig()).toThrow('GitHub event path is missing.');
  });

  it('throws on invalid timeout non-numeric', () => {
    getInputMock.mockImplementation((name: string) => {
      if (name === 'github-token') return 'token';
      if (name === 'event-path') return 'path';
      if (name === 'timeout') return 'abc';
      if (name === 'openai-api-key') return 'key';
      return '';
    });
    expect(() => getConfig()).toThrow(
      'Invalid timeout value: abc. Timeout must be a positive integer.',
    );
  });

  it('throws on invalid timeout <= 0', () => {
    getInputMock.mockImplementation((name: string) => {
      if (name === 'github-token') return 'token';
      if (name === 'event-path') return 'path';
      if (name === 'timeout') return '0';
      if (name === 'openai-api-key') return 'key';
      return '';
    });
    expect(() => getConfig()).toThrow(
      'Invalid timeout value: 0. Timeout must be a positive integer.',
    );
  });

  it('applies default values when optional inputs are absent', () => {
    getInputMock.mockImplementation((name: string) => {
      if (name === 'github-token') return 'gh-token';
      if (name === 'event-path') return 'event.json';
      if (name === 'openai-api-key') return 'openai-key';
      return '';
    });
    const config = getConfig();
    expect(config.githubToken).toBe('gh-token');
    expect(config.eventPath).toBe('event.json');
    expect(config.workspace).toBe('/workspace/app');
    expect(config.timeoutSeconds).toBe(600);
    expect(config.octokit).toBeInstanceOf(Octokit);
    expect(config.context).toEqual((github as any).context);
    expect(config.repo).toEqual({ owner: 'owner', repo: 'repo' });
    expect(config.openaiApiKey).toBe('openai-key');
    expect(config.openaiBaseUrl).toBe('');
    expect(config.openaiModel).toBe(defaultModel);
    expect(config.directPrompt).toBe('');
    expect(config.triggerPhrase).toBe('/codex');
    expect(config.assigneeTrigger).toEqual([]);
    expect(config.codexEnv).toEqual({});
    expect(config.images).toEqual([]);
  });
});