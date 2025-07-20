import { jest } from '@jest/globals';

import { run } from '../../../src/main';

// Mock @actions/core first so imports in run() pick it up
jest.mock('@actions/core', () => ({
  setFailed: jest.fn(),
  warning: jest.fn(),
  info: jest.fn(),
}));
// Mock all collaborators of run()
jest.mock('../../../src/config/config.js', () => ({ getConfig: jest.fn() }));
jest.mock('../../../src/github/event.js', () => ({ processEvent: jest.fn() }));
jest.mock('../../../src/security/security.js', () => ({
  checkPermission: jest.fn(),
}));
jest.mock('../../../src/github/action.js', () => ({ runAction: jest.fn() }));
// Mock OpenAI client to prevent real API calls during tests
jest.mock('../../../src/api/openai.js', () => ({ getOpenAIClient: jest.fn() }));

import * as core from '@actions/core';

import { getConfig } from '../../../src/config/config.ts';
import { processEvent } from '../../../src/github/event.ts';
import { checkPermission } from '../../../src/security/security.ts';
import { runAction } from '../../../src/github/action.ts';
import { getOpenAIClient } from '../../../src/api/openai.ts';

describe('run (src/main.ts)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Ensure OpenAI client mock returns a valid retrieve() method
    (getOpenAIClient as jest.Mock).mockReturnValue({
      models: { retrieve: jest.fn().mockResolvedValue({}) },
    });
  });

  it('calls core.setFailed if getConfig throws', async () => {
    const err = new Error('config error');
    (getConfig as jest.Mock).mockImplementation(() => {
      throw err;
    });
    await run();
    expect(core.setFailed).toHaveBeenCalledWith(
      `Action failed: ${err.message}\n${err.stack}`,
    );
  });

  it('calls core.setFailed if processEvent throws', async () => {
    const cfg = {};
    (getConfig as jest.Mock).mockReturnValue(cfg);
    const err = new Error('process error');
    (processEvent as jest.Mock).mockImplementation(() => {
      throw err;
    });
    await run();
    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining(`Action failed: ${err.message}`),
    );
  });

  it('calls core.setFailed if checkPermission throws', async () => {
    const cfg = {};
    (getConfig as jest.Mock).mockReturnValue(cfg);
    (processEvent as jest.Mock).mockReturnValue({});
    const err = new Error('permission error');
    (checkPermission as jest.Mock).mockImplementation(() => {
      throw err;
    });
    await run();
    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining(`Action failed: ${err.message}`),
    );
  });

  it('calls core.setFailed if runAction throws', async () => {
    const cfg = {};
    const evt = {};
    (getConfig as jest.Mock).mockReturnValue(cfg);
    (processEvent as jest.Mock).mockReturnValue(evt);
    (checkPermission as jest.Mock).mockResolvedValue(true);
    const err = new Error('runAction error');
    (runAction as jest.Mock).mockImplementation(() => {
      throw err;
    });
    await run();
    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining(`Action failed: ${err.message}`),
    );
  });

  it('handles non-Error throws as unknown errors', async () => {
    const cfg = {};
    const evt = {};
    (getConfig as jest.Mock).mockReturnValue(cfg);
    (processEvent as jest.Mock).mockReturnValue(evt);
    (checkPermission as jest.Mock).mockResolvedValue(true);
    (runAction as jest.Mock).mockRejectedValue('oops');
    await run();
    expect(core.setFailed).toHaveBeenCalledWith(
      `An unknown error occurred: oops`,
    );
  });
});
