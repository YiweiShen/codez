# Installation

## Project Settings

#### Settings → Actions → General → Workflow permissions

- Read and write permissions
- Allow GitHub Actions to create and approve pull requests

#### Settings → Secrets and variables → Actions → Secrets

- Repository secrets: Set `OPENAI_API_KEY` (for Codex)

## Workflow Configuration

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
