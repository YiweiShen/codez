# Configuration

## Basic Configuration

| Input Name      | Description                                                                                                                |
| --------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `github-token`  | **Required** GitHub token for authentication                                                                               |
| `event-path`    | Path to the event file (default: `${{ github.event_path }}`)                                                               |
| `timeout`       | Timeout for AI processing in seconds (default: 600, must be a positive integer)                                            |
| `direct-prompt` | One-shot prompt for automated workflows. If provided, Codez will bypass comment triggers and execute this prompt directly. |

## Codex Configuration

| Input Name       | Description                                              |
| ---------------- | -------------------------------------------------------- |
| `openai-api-key` | **Required for Codex** OpenAI API key for authentication |

## Advanced Codex Configuration

| Input Name         | Description                                                                                                                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `openai-base-url`  | OpenAI API base URL                                                                                                                                                                      |
| `openai-model`     | OpenAI model identifier to use (default: `gpt-5.1-codex-mini`)                                                                                                                                      |
| `trigger-phrase`   | Custom trigger phrase to invoke Codez (default: `/codex`)                                                                                                                                |
| `assignee-trigger` | Comma-separated list of GitHub usernames to trigger Codez on issue assignment                                                                                                            |
| `codex-env`        | Custom environment variables to inject into the Codex CLI execution context. Accepts either a YAML mapping (multiline) or comma-separated key=value pairs.                               |
| `images`           | Comma-separated or newline-separated list of local image file paths to include in the Codex CLI invocation. Each image can be referenced in the prompt by `<image_0>`, `<image_1>`, etc. |
