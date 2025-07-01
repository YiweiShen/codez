# Codez

![GitHub Release](https://img.shields.io/github/v/release/YiweiShen/codez) ![GitHub Release Date](https://img.shields.io/github/release-date/YiweiShen/codez) ![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/YiweiShen/codez/build-and-push.yml) ![GitHub License](https://img.shields.io/github/license/YiweiShen/codez)

**Built with Codez**: This repository (Codez) was built and is maintained using Codez.

An AI Agent that operates [Codex](https://github.com/openai/codex) on GitHub Actions. By using this action, you can directly invoke Codex from GitHub Issues or Pull Request comments and automate code changes.

## Features

- Start Codex with the `/codex` command from GitHub Issues or PR comments
- Automatically create a Pull Request or commit changes if the AI modifies code
- Post AI output as a comment if there are no changes
- Support a `--full-history` flag in the `/codex` command to include all user and bot comments in the history block
- Support a `--create-issues` flag in the `/codex` command to automatically generate GitHub issues from a JSON-based feature plan
- Support a `--no-pr` flag in the `/codex` command to skip pull request creation and post AI output as a comment
- Support custom trigger phrases via the `trigger-phrase` input (default: `/codex`)
- Support assignee-based triggers via the `assignee-trigger` input to invoke Codez on issue assignment
- Support a `--fix-build` flag in the `/codex` command to fetch and include the latest failed CI build logs in the prompt
- Support a `--fetch` flag in the `/codex` command to fetch and include contents from URLs referenced in the prompt
- Support `pull_request`, `workflow_dispatch`, and `repository_dispatch` workflow triggers for automated workflows (e.g., on PR open/sync or manual dispatch).

## Usage

### Project Settings

#### Settings -> Actions -> General -> Workflow permissions

- Read and write permissions
- Allow GitHub Actions to create and approve pull requests

#### Settings -> Secrets and variables -> Actions -> Secrets

- Repository secrets: Set `OPENAI_API_KEY` (for Codex)

### Workflow Configuration

> **Note:** To use the `assignee-trigger` input, add `assigned` to the `issues` event types.

```yaml
name: Codez

permissions:
  contents: write
  pull-requests: write
  issues: write

# Include 'assigned' to enable assignee-trigger input
on:
  issues:
    types: [opened, assigned]
  issue_comment:
    types: [created]
  pull_request_review_comment:
    types: [created]
  pull_request:
    types: [opened, synchronize]
  workflow_dispatch:
    inputs:
      direct-prompt:
        description: 'One-shot prompt for automated workflows'
        required: true
  repository_dispatch:
    types: [codex]

jobs:
  codez:
    runs-on: ubuntu-latest
    if: ${{ github.event.sender.type != 'Bot' }}
    steps:
      - uses: yiweishen/codez@main
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}

          # [Codex Settings]
          openai-api-key: ${{ secrets.OPENAI_API_KEY }}

          # [Optional Codex Settings]
          # openai-base-url: "https://api.openai.com"
          # direct-prompt: "Please update the API documentation for the latest endpoints."
          # trigger-phrase: "/ai"
          # assignee-trigger: "codex-bot"
          # codex-env: |
          #   NODE_ENV: test
          #   API_URL: https://api.example.com
```

### Example Usage in Issues

Create a new Issue and add the following to the body:

```
/codex Please create a new API endpoint. This should be an endpoint that handles GET requests to retrieve user information.
```

For full history including all user and bot comments in the `[History]` block, add the `--full-history` flag:

```
/codex --full-history Please create a new API endpoint. This should be an endpoint that handles GET requests to retrieve user information.
```

To skip pull request creation and only post AI output as a comment, use the `--no-pr` flag:

```
/codex --no-pr Please update the README formatting.
```
For fetching and including the latest failed CI build logs, use the `--fix-build` flag:

```
/codex --fix-build Please suggest changes to fix the build errors.
```

For fetching and including contents from URLs referenced in the prompt, use the `--fetch` flag:

```
/codex --fetch Please review the API docs at https://example.com/docs/api
```
By default, URLs are fetched and preprocessed via the Jina Reader API by prefixing each URL with `https://r.jina.ai/`, which retrieves the processed content.

Codex will analyze the request and create a new Pull Request with the code changes. The AI will also post a comment with the generated code.

### Example Usage in PRs

Comment on an existing Pull Request to request code modifications:

```
/codex Please add unit tests to this code.
```

All flags described in the Issues section apply (e.g., `--full-history`, `--no-pr`, `--fix-build`, `--fetch`).

### Example Usage: Creating Issues

In an Issue or PR comment, use the `--create-issues` flag to generate and create issues automatically:

```
/codex --create-issues Please generate a feature plan for our next API release.
```

Codex will respond by outputting a JSON-based feature plan and create a separate GitHub Issue for each feature.

## Running Tests

Install dependencies and run all unit tests:

```bash
npm test
```

## Formatting

This project uses [Prettier](https://prettier.io/) to format code consistently. To format all files, run:

```bash
npm run format
```
## Linting

This project uses [ESLint](https://eslint.org/) with the [`eslint-plugin-jsdoc`](https://github.com/gajus/eslint-plugin-jsdoc) plugin to enforce JSDoc block tag formatting and an 80-character line length. To run linting:

```bash
npm run lint
```

## Branch Naming

When creating pull request branches, this action uses the following naming convention:

```text
codez-<type>-<issueNumber>-<short-description>
```

- `<type>` is one of `feat`, `fix`, `docs`, `styles`, or `chore`, inferred from the commit message.
- `<issueNumber>` is the related issue number.
- `<short-description>` is a slugified version of the generated commit message (lowercase, spaces replaced with hyphens, and non-alphanumeric characters removed).

## Inputs Settings

## Instrumentation & Profiling

This action includes performance instrumentation for key phases (file scanning, API calls, Codex execution). When running, timing logs prefixed with `[perf]` will appear in the console output.

You can also use Node.js profiling tools on large runs to pinpoint bottlenecks:

- **Node.js built-in profiler** (`--prof`):
  ```bash
  # Run the built-in profiler locally in Docker
  docker run --rm \
    -e OPENAI_API_KEY=... \
    your-image \
    node --prof /app/dist/index.js
  ```
- **0x profiler**:
  ```bash
  # Install 0x globally, then run
  npm install -g 0x
  docker run --rm \
    -e OPENAI_API_KEY=... \
    your-image \
    0x /app/dist/index.js
  ```

### Basic Configuration

| Input Name      | Description                                                                                                                |
| --------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `github-token`  | **Required** GitHub token for authentication                                                                               |
| `event-path`    | Path to the event file (default: `${{ github.event_path }}`)                                                               |
| `timeout`       | Timeout for AI processing in seconds (default: 600, must be a positive integer)                                            |
| `direct-prompt` | One-shot prompt for automated workflows. If provided, Codez will bypass comment triggers and execute this prompt directly. |

### Codex Configuration

| Input Name       | Description                                              |
| ---------------- | -------------------------------------------------------- |
| `openai-api-key` | **Required for Codex** OpenAI API key for authentication |

### Advanced Codex Configuration

| Input Name         | Description                                                                                                                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `openai-base-url`  | OpenAI API base URL                                                                                                                                                                      |
| `openai-model`     | OpenAI model identifier to use (default: `o4-mini`)                                                                                                                                      |
| `trigger-phrase`   | Custom trigger phrase to invoke Codez (default: `/codex`)                                                                                                                                |
| `assignee-trigger` | Comma-separated list of GitHub usernames to trigger Codez on issue assignment                                                                                                            |
| `codex-env`        | Custom environment variables to inject into the Codex CLI execution context. Accepts either a YAML mapping (multiline) or comma-separated key=value pairs.                               |
| `images`           | Comma-separated or newline-separated list of local image file paths to include in the Codex CLI invocation. Each image can be referenced in the prompt by `<image_0>`, `<image_1>`, etc. |

## Security

- **Permission Checks:** Before executing core logic, the action verifies if the triggering user (`github.context.actor`) has `write` or `admin` permissions for the repository.
- **Sensitive Information Masking:** Any occurrences of the provided `github-token` and `openai-api-key` within the output posted to GitHub are automatically masked (replaced with `***`) to prevent accidental exposure.
