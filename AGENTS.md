# AGENTS

This document provides best practices and guidelines for developing
and maintaining this repository.

---

## Common Bash Commands

- Install dependencies: `npm install`
- Build the project: `npm run build`
- Run tests: `npm test`
- Format code: `npm run format`
- Docker build: `docker build -t <image-name> .`
- Run Docker container: `docker run --rm <image-name>`

## Core Files and Utility Functions

- `Dockerfile`: Container build definition.
- `action.yml`: GitHub Action metadata.
- `jest.config.js`: Jest configuration for unit tests.
- `tsconfig.json`: TypeScript compiler settings.
- `package.json`: Project dependencies and npm scripts.
- `src/index.ts`: Entry point for the GitHub Action runner.
- `src/main.ts`: Core orchestration and workflow logic.
- `src/api/*`: OpenAI API wrapper functions.
- `src/client/*`: GitHub client helper code.
- `src/config/*`: Input and environment variable parsers.
- `src/file/*`: File system utility functions.
- `src/security/*`: Permission checks and secret masking.
- `src/github/*`: GitHub-specific helpers (PRs, comments).
- `src/utils/*`: Miscellaneous utility functions.
- `__tests__`: Unit tests directory.

## Code Style Guidelines

- **Formatting:** We use [Prettier](https://prettier.io/) to enforce
  consistent code style. Run `npm run format` before committing.
- **TypeScript:** Follow strict typing rules and compiler settings in
  `tsconfig.json`.
- **ESModule Syntax:** Use `import`/`export` for modules.
- Ensure all CI checks (tests, formatting) pass before merging.

## Testing Instructions

- **Unit Tests:** Tests are located in `__tests__`. Run `npm test` to
  execute all tests.
- **Coverage:** If configured, run `npm test -- --coverage` to view
  test coverage.
- **Writing Tests:** Follow Jest conventions and name test files after
  the modules under test.

## Repository Etiquette

- **Branch Naming:**
  - Feature branches: `feature/<short-description>`
  - Bugfix branches: `fix/<short-description>`
  - Chore branches: `chore/<short-description>`
- **Pull Requests:**
  - Keep PRs small and focused.
  - Link to relevant issues or context in the PR description.
  - Request at least one reviewer.
  - Ask follow-up questions before starting to implement the changes or creating a PR.
- **Merge Strategy:**
  - Prefer squash or rebase merges to maintain a linear history.
  - Enforce passing CI checks via branch protection.
- **Issue Tracking:**
  - Label issues for categorization (`bug`, `enhancement`, etc.).

## Git Commit Conventions

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short description>

[optional body]

[optional footer]
```

**Types:**

- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation only changes
- `style`: Formatting, missing semicolons, etc.
- `refactor`: Code change that neither fixes a bug nor adds a feature
- `perf`: A code change that improves performance
- `test`: Adding or updating tests
- `chore`: Changes to build process or auxiliary tools

**Example:**

```
feat(config): add support for custom timeouts
```

## Other Information

- **CI/CD:** Workflows are defined in `.github/workflows`.
- **Workflow changes:** Do not modify YAML files in `.github/workflows` directly.
- **Secrets Management:** Store API keys and tokens in GitHub Secrets
  (Settings → Secrets).
- **Action Usage:** See `README.md` for invoking the Codex Action in
  issues and PR comments.
- **Maintenance:** Keep dependencies up to date by reviewing alerts in
  GitHub security tab.
