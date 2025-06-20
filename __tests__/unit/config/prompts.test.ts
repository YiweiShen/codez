import {
  conventionalCommitsSystemPrompt,
  promptBuilderConfig,
} from '../../../src/config/prompts';

describe('conventionalCommitsSystemPrompt', () => {
  it('should be a non-empty string', () => {
    expect(typeof conventionalCommitsSystemPrompt).toBe('string');
    expect(conventionalCommitsSystemPrompt.trim().length).toBeGreaterThan(0);
  });

  it('should include the commit header format instruction', () => {
    expect(conventionalCommitsSystemPrompt).toContain(
      '<type>(<scope>): <subject>',
    );
  });

  it('should list valid Conventional Commit types', () => {
    const types = [
      'feat',
      'fix',
      'docs',
      'style',
      'refactor',
      'perf',
      'test',
      'chore',
      'revert',
    ];
    types.forEach((type) => {
      expect(conventionalCommitsSystemPrompt).toContain(type);
    });
  });
});

describe('promptBuilderConfig defaults', () => {
  it('should have the expected default labels and separator', () => {
    expect(promptBuilderConfig).toEqual({
      titleLabel: '[Title]',
      historyLabel: '[History]',
      contextLabel: '[Context]',
      changedFilesLabel: '[Changed Files]',
      promptSeparator: '---',
    });
  });
});
