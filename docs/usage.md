# Usage

## Title Prefixing

Codez will automatically prefix the title of the issue or pull request with `[WIP]` when it begins processing, and update it to `[Done]` once processing is complete. If re-run on a `[Done]` titled issue, it will toggle back to `[WIP]` to indicate re-work.

## Example Usage in Issues

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

## Example Usage in PRs

Comment on an existing Pull Request to request code modifications:

```
/codex Please add unit tests to this code.
```

All flags described in the Issues section apply (e.g., `--full-history`, `--no-pr`, `--fix-build`, `--fetch`).

## Example Usage: Creating Issues

In an Issue or PR comment, use the `--create-issues` flag to generate and create issues automatically:

```
/codex --create-issues Please generate a feature plan for our next API release.
```

Codex will respond by outputting a JSON-based feature plan and create a separate GitHub Issue for each feature.
