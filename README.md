# Claude Code GitHub Agent

__Work in Progress.__ 

An AI Agent that operates Claude Code on GitHub Actions. By using this action, you can directly invoke Claude Code from GitHub Issues or Pull Request comments and automate code changes.

## Features

- Start Claude with the `/claude` command from GitHub Issues or PR comments
- Automatically create a Pull Request or commit changes if Claude modifies code
- Post Claude's output as a comment if there are no changes

## Usage

### Project Setting
`Actions` -> `General` -> `Workflow permissions`
* Read and write permissions
* ✔ Allow GitHub Actions to create and approve pull requests
![image](https://github.com/user-attachments/assets/e78e60d0-9e16-425e-bcad-264c8f81b878)


### Workflow Configuration

```yaml
name: Claude Code GitHub Agent

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
  claude-agent:
    runs-on: ubuntu-latest
    steps:
      - name: Run Claude Code GitHub Agent
        uses: potproject/claude-code-github-agent@main
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
