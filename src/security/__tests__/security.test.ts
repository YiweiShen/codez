import { maskSensitiveInfo } from '../security.js';
import { ActionConfig } from '../../config/config.js';

// Mock ActionConfig for testing purposes
const createMockConfig = (
    githubToken?: string, 
    anthropicApiKey?: string, 
    awsAccessKeyId?: string, 
    awsSecretAccessKey?: string,
    anthropicBaseUrl?: string,
    anthropicBedrockBaseUrl?: string,
    openaiApiKey?: string,
    openaiBaseUrl?: string
): ActionConfig => ({
    githubToken: githubToken ?? '',
    anthropicApiKey: anthropicApiKey ?? '',
    anthropicBaseUrl: anthropicBaseUrl ?? '',
    anthropicModel: '',
    anthropicSmallFastModel: '',
    claudeCodeUseBedrock: '',
    anthropicBedrockBaseUrl: anthropicBedrockBaseUrl ?? '',
    awsAccessKeyId: awsAccessKeyId ?? '',
    awsSecretAccessKey: awsSecretAccessKey ?? '',
    awsRegion: '',
    disablePromptCaching: '',
    eventPath: 'dummy/path',
    workspace: '/dummy/workspace',
    timeoutSeconds: 600,
    octokit: {} as any, // Mocked Octokit - not used by maskSensitiveInfo
    context: {} as any, // Mocked context - not used by maskSensitiveInfo
    repo: { owner: 'test-owner', repo: 'test-repo' },
    openaiApiKey: openaiApiKey ?? '',
    openaiBaseUrl: openaiBaseUrl ?? '',
});

describe('maskSensitiveInfo', () => {
    const GITHUB_TOKEN = 'ghp_1234567890abcdefghijklmnopqrstuvwx';
    const ANTHROPIC_KEY = 'sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx-xxxxxxxx';
    const AWS_ACCESS_KEY = 'AKIAIOSFODNN7EXAMPLE';
    const AWS_SECRET_KEY = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
    const ANTHROPIC_BASE_URL = 'https://api.anthropic.com/v1';
    const ANTHROPIC_BEDROCK_URL = 'https://bedrock-runtime.us-west-2.amazonaws.com';
    const OPENAI_API_KEY = 'sk-openai-123456789abcdefghijklmnopqrstuvwxyz';
    const OPENAI_BASE_URL = 'https://api.openai.com/v1';

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

    it('should mask AWS Access Key ID', () => {
        const config = createMockConfig(undefined, undefined, AWS_ACCESS_KEY);
        const text = `AWS Access Key: ${AWS_ACCESS_KEY} is sensitive.`;
        const expected = 'AWS Access Key: *** is sensitive.';
        expect(maskSensitiveInfo(text, config)).toBe(expected);
    });

    it('should mask AWS Secret Access Key', () => {
        const config = createMockConfig(undefined, undefined, undefined, AWS_SECRET_KEY);
        const text = `AWS Secret: ${AWS_SECRET_KEY} should be hidden.`;
        const expected = 'AWS Secret: *** should be hidden.';
        expect(maskSensitiveInfo(text, config)).toBe(expected);
    });

    it('should mask Anthropic Base URL', () => {
        const config = createMockConfig(undefined, undefined, undefined, undefined, ANTHROPIC_BASE_URL);
        const text = `Base URL: ${ANTHROPIC_BASE_URL} is configured.`;
        const expected = 'Base URL: *** is configured.';
        expect(maskSensitiveInfo(text, config)).toBe(expected);
    });

    it('should mask Anthropic Bedrock Base URL', () => {
        const config = createMockConfig(undefined, undefined, undefined, undefined, undefined, ANTHROPIC_BEDROCK_URL);
        const text = `Bedrock URL: ${ANTHROPIC_BEDROCK_URL} is used.`;
        const expected = 'Bedrock URL: *** is used.';
        expect(maskSensitiveInfo(text, config)).toBe(expected);
    });

    it('should mask OpenAI API Key', () => {
        const config = createMockConfig(
            undefined, undefined, undefined, undefined, 
            undefined, undefined, OPENAI_API_KEY
        );
        const text = `OpenAI Key: ${OPENAI_API_KEY} must be protected.`;
        const expected = 'OpenAI Key: *** must be protected.';
        expect(maskSensitiveInfo(text, config)).toBe(expected);
    });

    it('should mask OpenAI Base URL', () => {
        const config = createMockConfig(
            undefined, undefined, undefined, undefined, 
            undefined, undefined, undefined, OPENAI_BASE_URL
        );
        const text = `OpenAI URL: ${OPENAI_BASE_URL} is in use.`;
        const expected = 'OpenAI URL: *** is in use.';
        expect(maskSensitiveInfo(text, config)).toBe(expected);
    });

    it('should mask all sensitive information when provided', () => {
        const config = createMockConfig(
            GITHUB_TOKEN, ANTHROPIC_KEY, AWS_ACCESS_KEY, AWS_SECRET_KEY,
            ANTHROPIC_BASE_URL, ANTHROPIC_BEDROCK_URL, OPENAI_API_KEY, OPENAI_BASE_URL
        );
        const text = `GitHub: ${GITHUB_TOKEN}, Anthropic: ${ANTHROPIC_KEY}, AWS Access: ${AWS_ACCESS_KEY}, 
                    AWS Secret: ${AWS_SECRET_KEY}, Anthropic URL: ${ANTHROPIC_BASE_URL}, 
                    Bedrock URL: ${ANTHROPIC_BEDROCK_URL}, OpenAI Key: ${OPENAI_API_KEY}, 
                    OpenAI URL: ${OPENAI_BASE_URL}`;
        const expected = `GitHub: ***, Anthropic: ***, AWS Access: ***, 
                    AWS Secret: ***, Anthropic URL: ***, 
                    Bedrock URL: ***, OpenAI Key: ***, 
                    OpenAI URL: ***`;
        expect(maskSensitiveInfo(text, config)).toBe(expected);
    });
});
