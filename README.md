# 🚀 Codez

An AI Agent 🤖 that operates [Codex](https://github.com/openai/codex) on GitHub Actions. By using this action, you can directly invoke Codex from GitHub Issues or Pull Request comments and automate code changes.

## 🛠️ Features

- 🚀 Start Codex with the `/codex` command from GitHub Issues or PR comments
- 🔀 Automatically create a Pull Request or commit changes if the AI modifies code
- 💬 Post AI output as a comment if there are no changes

## 💡 Usage

### ⚙️ Project Settings

#### 🔒 Settings -> Actions -> General -> Workflow permissions

- ✔️ Read and write permissions
- ✅ Allow GitHub Actions to create and approve pull requests

#### 🔑 Settings -> Secrets and variables -> Actions -> Secrets

- 🔑 Repository secrets: Set `OPENAI_API_KEY` (for Codex)

### ⚙️ Workflow Configuration

```yaml
name: Codez

permissions:
  contents: write
  pull-requests: write
  issues: write

on:
  issues:
    types: [opened]
  issue_comment:
    types: [created]
  pull_request_review_comment:
    types: [created]

jobs:
  codez:
    runs-on: ubuntu-latest
    if: ${{ github.event.sender.type != 'Bot' }}
    steps:
      - uses: yiweishen/codez@v0.0.2
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}

          # [Codex Settings]
          openai-api-key: ${{ secrets.OPENAI_API_KEY }}

          # [Optional Codex Settings]
          # openai-base-url: "https://api.openai.com"
```

### 💬 Example Usage in Issues

Create a new Issue and add the following to the body:

```
/codex Please create a new API endpoint. This should be an endpoint that handles GET requests to retrieve user information.
```

Codex will analyze the request and create a new Pull Request with the code changes. The AI will also post a comment with the generated code.

### 💬 Example Usage in PRs

Comment on an existing Pull Request to request code modifications:

```
/codex Please add unit tests to this code.
```

Codex will analyze the request and create a new Pull Request with the code changes. The AI will also post a comment with the generated code.

## 📥 Inputs Settings

### 🛠️ Basic Configuration

| Input Name     | Description                                                  |
| -------------- | ------------------------------------------------------------ |
| `github-token` | **Required** GitHub token for authentication                 |
| `event-path`   | Path to the event file (default: `${{ github.event_path }}`) |
| `timeout`      | Timeout for AI processing in seconds (default: 600)          |

### 🤖 Codex Configuration

| Input Name       | Description                                              |
| ---------------- | -------------------------------------------------------- |
| `openai-api-key` | **Required for Codex** OpenAI API key for authentication |

### 🔧 Advanced Codex Configuration

| Input Name        | Description         |
| ----------------- | ------------------- |
| `openai-base-url` | OpenAI API base URL |

## 🔒 Security

- 🔒 **Permission Checks:** Before executing core logic, the action verifies if the triggering user (`github.context.actor`) has `write` or `admin` permissions for the repository.
- 🛡️ **Sensitive Information Masking:** Any occurrences of the provided `github-token` and `openai-api-key` within the output posted to GitHub are automatically masked (replaced with `***`) to prevent accidental exposure.
