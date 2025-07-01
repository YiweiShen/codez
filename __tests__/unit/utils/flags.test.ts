import { parseFlags } from '../../../src/utils/flags';
import { extractPromptFlags } from '../../../src/utils/prompt';

describe('parseFlags', () => {
  it('parses known flags and returns remaining input', () => {
    const input = '--flag1 --unknown foo bar';
    const { flags, rest } = parseFlags(input, ['flag1']);
    expect(flags.flag1).toBe(true);
    expect(rest).toBe('--unknown foo bar');
  });
  it('handles no flags and returns full input as rest', () => {
    const input = 'some random input';
    const { flags, rest } = parseFlags(input, ['a', 'b']);
    expect(flags).toEqual({ a: false, b: false });
    expect(rest).toBe('some random input');
  });
});

describe('extractPromptFlags', () => {
  it('extracts fix-build and fetch flags for direct prompts', () => {
    const input = '--fix-build --fetch prompt text';
    const opts = extractPromptFlags(input, true);
    expect(opts.includeFixBuild).toBe(true);
    expect(opts.includeFetch).toBe(true);
    expect(opts.includeFullHistory).toBe(false);
    expect(opts.createIssues).toBe(false);
    expect(opts.noPr).toBe(false);
    expect(opts.prompt).toBe('prompt text');
  });
  it('extracts all flags for trigger-based prompts', () => {
    const input =
      '--full-history --create-issues --no-pr --fix-build --fetch do work';
    const opts = extractPromptFlags(input, false);
    expect(opts.includeFullHistory).toBe(true);
    expect(opts.createIssues).toBe(true);
    expect(opts.noPr).toBe(true);
    expect(opts.includeFixBuild).toBe(true);
    expect(opts.includeFetch).toBe(true);
    expect(opts.prompt).toBe('do work');
  });
});
