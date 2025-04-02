# Claude Code GitHub Agent

__Work in Progress. Currently not working due to a bug in [Claude Code issues#551](https://github.com/anthropics/claude-code/issues/551)__

An AI Agent that operates Claude Code on GitHub Actions. By using this action, you can directly invoke Claude Code from GitHub Issues or Pull Request comments and automate code changes.

## Features

- Start Claude with the `/claude` command from GitHub Issues or PR comments
- Automatically create a Pull Request or commit changes if Claude modifies code
- Post Claude's output as a comment if there are no changes

## Usage

### Workflow Configuration

```yaml
name: Claude Code GitHub Agent

permissions:
  contents: read
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
  claude-agent:
    steps:
      - name: Run Claude Code GitHub Agent
        uses: potproject/claude-code-github-agent@v0-test
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
```

### Example Usage in Issues

Create a new Issue and add the following to the body:

```
/claude Please create a new API endpoint. This should be an endpoint that handles GET requests to retrieve user information.
```

Claude will then generate the necessary code according to the instructions and propose it as a Pull Request.

### Example Usage in PRs

Comment on an existing Pull Request to request code modifications:

```
/claude Please add unit tests to this code.
```

Claude will analyze the comment and add test code to the existing PR branch.

## License

MIT
