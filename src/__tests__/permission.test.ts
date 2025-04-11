import { maskSensitiveInfo } from '../permission';
import { ActionConfig } from '../config'; // Assuming ActionConfig is exported from config.ts

// Mock ActionConfig for testing purposes
const createMockConfig = (githubToken?: string, anthropicApiKey?: string): ActionConfig => ({
    githubToken: githubToken ?? '',
    anthropicApiKey: anthropicApiKey ?? '',
    anthropicBaseUrl: '',
    anthropicModel: '',
    anthropicSmallFastModel: '',
    claudeCodeUseBedrock: '',
    anthropicBedrockBaseUrl: '',
    awsAccessKeyId: '',
    awsSecretAccessKey: '',
    awsRegion: '',
    disablePromptCaching: '',
    eventPath: 'dummy/path',
    workspace: '/dummy/workspace',
    timeoutSeconds: 300,
    octokit: {} as any, // Mocked Octokit - not used by maskSensitiveInfo
    context: {} as any, // Mocked context - not used by maskSensitiveInfo
    repo: { owner: 'test-owner', repo: 'test-repo' }, // Mocked repo info


});

describe('maskSensitiveInfo', () => {
    const GITHUB_TOKEN = 'ghp_1234567890abcdefghijklmnopqrstuvwx';
    const ANTHROPIC_KEY = 'sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx-xxxxxxxx';

    it('should mask GitHub token', () => {
        const config = createMockConfig(GITHUB_TOKEN);
        const text = `This text contains a GitHub token: ${GITHUB_TOKEN}.`;
        const expected = 'This text contains a GitHub token: ***.';
        expect(maskSensitiveInfo(text, config)).toBe(expected);
    });

    it('should mask Anthropic API key', () => {
        const config = createMockConfig(undefined, ANTHROPIC_KEY);
        const text = `Anthropic API Key: ${ANTHROPIC_KEY} is used here.`;
        const expected = 'Anthropic API Key: *** is used here.';
        expect(maskSensitiveInfo(text, config)).toBe(expected);
    });

    it('should mask both GitHub token and Anthropic API key', () => {
        const config = createMockConfig(GITHUB_TOKEN, ANTHROPIC_KEY);
        const text = `Token: ${GITHUB_TOKEN}, Key: ${ANTHROPIC_KEY}.`;
        const expected = 'Token: ***, Key: ***.';
        expect(maskSensitiveInfo(text, config)).toBe(expected);
    });

    it('should not mask anything if text does not contain sensitive info', () => {
        const config = createMockConfig(GITHUB_TOKEN, ANTHROPIC_KEY);
        const text = 'This is a safe text without any secrets.';
        expect(maskSensitiveInfo(text, config)).toBe(text);
    });

    it('should not mask anything if config does not contain sensitive keys', () => {
        const config = createMockConfig(); // No keys provided
        const text = `Token: ${GITHUB_TOKEN}, Key: ${ANTHROPIC_KEY}.`;
        expect(maskSensitiveInfo(text, config)).toBe(text);
    });

    it('should mask multiple occurrences of sensitive info', () => {
        const config = createMockConfig(GITHUB_TOKEN, ANTHROPIC_KEY);
        const text = `First token: ${GITHUB_TOKEN}. Second key: ${ANTHROPIC_KEY}. Token again: ${GITHUB_TOKEN}.`;
        const expected = 'First token: ***. Second key: ***. Token again: ***.';
        expect(maskSensitiveInfo(text, config)).toBe(expected);
    });

    it('should handle empty string input', () => {
        const config = createMockConfig(GITHUB_TOKEN, ANTHROPIC_KEY);
        const text = '';
        expect(maskSensitiveInfo(text, config)).toBe('');
    });

    it('should handle config with only one key defined', () => {
        const config = createMockConfig(GITHUB_TOKEN); // Only GitHub token
        const text = `Token: ${GITHUB_TOKEN}, Key: ${ANTHROPIC_KEY}.`;
        const expected = `Token: ***, Key: ${ANTHROPIC_KEY}.`; // Key should not be masked
        expect(maskSensitiveInfo(text, config)).toBe(expected);
    });
});
