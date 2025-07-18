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
