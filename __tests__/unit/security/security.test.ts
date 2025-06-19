import { checkPermission, maskSensitiveInfo } from '../../../src/security/security';
import type { ActionConfig } from '../../../src/config/config';

describe('checkPermission', () => {
  it('returns false if actor is undefined', async () => {
    const config = { context: { actor: undefined } } as unknown as ActionConfig;
    await expect(checkPermission(config)).resolves.toBe(false);
  });

  it('returns true for admin permission', async () => {
    const octokit = {
      rest: {
        repos: {
          getCollaboratorPermissionLevel: jest
            .fn()
            .mockResolvedValue({ data: { permission: 'admin' } }),
        },
      },
    } as any;
    const config = {
      context: { actor: 'user' },
      octokit,
      repo: { owner: 'owner', repo: 'repo' },
    } as unknown as ActionConfig;
    await expect(checkPermission(config)).resolves.toBe(true);
    expect(octokit.rest.repos.getCollaboratorPermissionLevel).toHaveBeenCalledWith({
      owner: 'owner',
      repo: 'repo',
      username: 'user',
    });
  });

  it('returns true for write permission', async () => {
    const octokit = {
      rest: {
        repos: {
          getCollaboratorPermissionLevel: jest
            .fn()
            .mockResolvedValue({ data: { permission: 'write' } }),
        },
      },
    } as any;
    const config = {
      context: { actor: 'user' },
      octokit,
      repo: { owner: 'owner', repo: 'repo' },
    } as unknown as ActionConfig;
    await expect(checkPermission(config)).resolves.toBe(true);
  });

  it('returns false for read or none permissions', async () => {
    for (const perm of ['read', 'none']) {
      const octokit = {
        rest: {
          repos: {
            getCollaboratorPermissionLevel: jest
              .fn()
              .mockResolvedValue({ data: { permission: perm } }),
          },
        },
      } as any;
      const config = {
        context: { actor: 'user' },
        octokit,
        repo: { owner: 'owner', repo: 'repo' },
      } as unknown as ActionConfig;
      await expect(checkPermission(config)).resolves.toBe(false);
    }
  });

  it('returns false if API throws', async () => {
    const octokit = {
      rest: {
        repos: {
          getCollaboratorPermissionLevel: jest
            .fn()
            .mockRejectedValue(new Error('API error')),
        },
      },
    } as any;
    const config = {
      context: { actor: 'user' },
      octokit,
      repo: { owner: 'owner', repo: 'repo' },
    } as unknown as ActionConfig;
    await expect(checkPermission(config)).resolves.toBe(false);
  });
});

describe('maskSensitiveInfo', () => {
  const sensitiveConfig = {
    githubToken: 'gh-token',
    openaiApiKey: 'openai-key',
    openaiBaseUrl: 'https://api.openai.com',
  } as unknown as ActionConfig;

  it('masks GitHub token', () => {
    const text = `This is a token: ${sensitiveConfig.githubToken}`;
    expect(maskSensitiveInfo(text, sensitiveConfig)).toBe(
      'This is a token: ***',
    );
  });

  it('masks OpenAI API key and Base URL', () => {
    const text = `Key: ${sensitiveConfig.openaiApiKey}, URL: ${
      sensitiveConfig.openaiBaseUrl
    }`;
    expect(maskSensitiveInfo(text, sensitiveConfig)).toBe(
      'Key: ***, URL: ***',
    );
  });

  it('leaves text without sensitive info unchanged', () => {
    const text = 'No secrets here';
    expect(maskSensitiveInfo(text, sensitiveConfig)).toBe(text);
  });
});