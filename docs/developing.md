# Development

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

## Ensuring No Dead Code

This project is configured to detect and prevent dead (unused) code in several ways:

- **TypeScript compiler** flags unused locals and parameters via the `noUnusedLocals` and `noUnusedParameters` options in [`tsconfig.json`](../tsconfig.json).
- **ESLint** automatically removes or errors on unused imports using the [`eslint-plugin-unused-imports`](https://github.com/sweepline/eslint-plugin-unused-imports) plugin.
- **Module coverage**: All `src/` modules are reachable from the main entrypoints (`src/index.ts`, `src/main.ts`) and covered by tests, so there are no orphaned files.

If you’d like to enforce these checks in CI, consider adding a CI step:

```bash
tsc --noEmit
```

For detecting unused dependencies in `package.json`, you can add tools like [depcheck](https://github.com/depcheck/depcheck) or [madge](https://github.com/pahen/madge).
