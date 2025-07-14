import * as core from '@actions/core';
import { execa } from 'execa';

import { runCodex } from '../../../src/client/codex';

import type { ActionConfig } from '../../../src/config/config';

jest.mock('execa', () => ({
  execa: jest.fn(),
}));
jest.mock('@actions/core', () => ({
  info: jest.fn(),
  warning: jest.fn(),
  error: jest.fn(),
}));

describe('runCodex', () => {
  const workspace = '/workspace';
  const timeout = 5000;
  let config: ActionConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    config = {
      openaiModel: 'test-model',
      openaiApiKey: 'api-key',
      codexEnv: {},
      openaiBaseUrl: '',
    } as unknown as ActionConfig;
  });

  it('parses JSON from stdout and returns text result', async () => {
    const jsonLine = JSON.stringify({
      type: 'message',
      content: [{ text: 'Hello' }],
    });
    const stdout = 'some log\n' + jsonLine;
    (execa as jest.Mock).mockResolvedValue({
      exitCode: 0,
      stdout,
      stderr: '',
      failed: false,
    });

    const result = await runCodex(
      workspace,
      config,
      'prompt with "quotes"',
      timeout,
    );
    expect(result).toBe('Hello\n\n');
    expect(execa).toHaveBeenCalledWith(
      'codex',
      expect.any(Array),
      expect.objectContaining({ timeout, cwd: workspace }),
    );
    // CLI arguments should include timeout flag for model runtime budget
    const cliArgs = (execa as jest.Mock).mock.calls[0][1] as string[];
    expect(cliArgs).toEqual(expect.arrayContaining(['--timeout', timeout.toString()]));
    expect(core.info).toHaveBeenCalled();
  });

  it('logs warning when stderr with exitCode 0 and returns text result', async () => {
    const jsonLine = JSON.stringify({
      type: 'message',
      content: [{ text: 'World' }],
    });
    (execa as jest.Mock).mockResolvedValue({
      exitCode: 0,
      stdout: jsonLine,
      stderr: 'warning occurred',
      failed: false,
    });

    const result = await runCodex(workspace, config, 'prompt', timeout);
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('produced stderr'),
    );
    expect(result).toBe('World\n\n');
  });

  it('throws error on non-zero exit code with stderr', async () => {
    (execa as jest.Mock).mockResolvedValue({
      exitCode: 1,
      stdout: '',
      stderr: 'error occurred',
      failed: true,
    });

    await expect(
      runCodex(workspace, config, 'prompt', timeout),
    ).rejects.toThrow(
      'Codex command failed with exit code 1. Stderr: error occurred',
    );
    expect(core.error).toHaveBeenCalledWith(
      expect.stringContaining('Codex command failed with stderr'),
    );
  });

  it('throws timeout error when execa rejects with timedOut', async () => {
    const error = new Error('timed out');
    (error as any).timedOut = true;
    (execa as jest.Mock).mockRejectedValue(error);

    await expect(
      runCodex(workspace, config, 'prompt', timeout),
    ).rejects.toThrow(`Codex command timed out after ${timeout}ms.`);
  });
  it('throws error on non-zero exit code without stderr', async () => {
    (execa as jest.Mock).mockResolvedValue({
      exitCode: 2,
      stdout: 'output only',
      stderr: '',
      failed: false,
    });
    await expect(
      runCodex(workspace, config, 'prompt', timeout),
    ).rejects.toThrow(
      'Codex command failed with exit code 2. Stdout: output only',
    );
  });
  it('throws error when JSON parse fails', async () => {
    (execa as jest.Mock).mockResolvedValue({
      exitCode: 0,
      stdout: 'not a valid json',
      stderr: '',
      failed: false,
    });
    await expect(
      runCodex(workspace, config, 'prompt', timeout),
    ).rejects.toThrow(/Failed to parse JSON output from Codex/);
    expect(core.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to parse JSON output from Codex'),
    );
  });
  it('throws general CliError on other execa rejection', async () => {
    (execa as jest.Mock).mockRejectedValue(new Error('command failed'));
    await expect(
      runCodex(workspace, config, 'prompt', timeout),
    ).rejects.toThrow('Failed to execute Codex command: command failed');
  });
});
