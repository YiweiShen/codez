# Codez

![GitHub Release](https://img.shields.io/github/v/release/YiweiShen/codez) ![GitHub Release Date](https://img.shields.io/github/release-date/YiweiShen/codez) ![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/YiweiShen/codez/build-and-push.yml) ![GitHub License](https://img.shields.io/github/license/YiweiShen/codez)

An AI Agent that operates [Codex](https://github.com/openai/codex) on GitHub Actions. By using this Action, you can invoke Codex from GitHub Issues or Pull Request comments to automate code changes.

## Documentation

Full guides and reference docs are in the [docs/](docs) folder:

- [Installation](docs/installation.md)
- [Usage](docs/usage.md)
- [Configuration](docs/configuration.md)
- [Security](docs/security.md)
- [Development](docs/developing.md)

## Quickstart

Below is a minimal workflow configuration to get started with Codez:

```yaml
# .github/workflows/codez.yml
on: [issue_comment]

jobs:
  codez:
    runs-on: ubuntu-latest
    steps:
      - uses: yiweishen/codez@main
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          openai-api-key: ${{ secrets.OPENAI_API_KEY }}
```
