import * as core from '@actions/core';

import * as github from '@actions/github';

import { Octokit } from 'octokit';

import { defaultModel } from '../../../src/api/openai';
import {
  parseKeyValueMap,
  parseStringList,
  getConfig,
} from '../../../src/config/config';

describe('parseKeyValueMap', () => {
  it('returns empty object for empty input', () => {
    expect(parseKeyValueMap('')).toEqual({});
  });

  it('parses comma-separated key=value pairs', () => {
    expect(parseKeyValueMap('VAR1=value1,VAR2=value2')).toEqual({
      VAR1: 'value1',
      VAR2: 'value2',
    });
  });

  it('trims whitespace around keys and values', () => {
    expect(parseKeyValueMap('VAR1 = value1 , VAR2= value2 ')).toEqual({
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
    expect(parseKeyValueMap(input)).toEqual({
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
    expect(parseKeyValueMap(input)).toEqual({ VAR1: 'value1', VAR2: 'value2' });
  });
  it('parses single env var without comma or newline', () => {
    expect(parseKeyValueMap('KEY=value')).toEqual({ KEY: 'value' });
  });
  it('parses YAML mapping value containing colon', () => {
    const input = 'KEY: value:with:colon\n';
    expect(parseKeyValueMap(input)).toEqual({ KEY: 'value:with:colon' });
  });
});

describe('parseStringList', () => {
  it('returns empty array for empty input', () => {
    expect(parseStringList('')).toEqual([]);
  });

  it('parses comma-separated list', () => {
    expect(parseStringList('a,b, c ,, d')).toEqual(['a', 'b', 'c', 'd']);
  });

  it('parses newline-separated list', () => {
    const input = `
  a
  b

  c
  `;
    expect(parseStringList(input)).toEqual(['a', 'b', 'c']);
  });

  it('parses single-item input', () => {
    expect(parseStringList('single')).toEqual(['single']);
  });
  it('returns empty array for separators only', () => {
    expect(parseStringList(' , , ')).toEqual([]);
  });
  it('parses input with no separators as single item including spaces', () => {
    expect(parseStringList(' a b c ')).toEqual(['a b c']);
  });
  it('parses newline-separated list even if items contain commas', () => {
    expect(parseStringList('a\nb,c')).toEqual(['a', 'b,c']);
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
