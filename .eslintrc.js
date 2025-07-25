/**
 * ESLint configuration constants to avoid magic numbers.
 */
/** Maximum allowed line length for source code. */
const MAX_LINE_LENGTH = 80;
/** Maximum allowed line length for test files. */
const MAX_LINE_LENGTH_TEST = 120;

module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint', 'jsdoc', 'import', 'unused-imports'],
  extends: [
    'plugin:@typescript-eslint/recommended',
    'plugin:jsdoc/recommended',
    'prettier',
  ],
  settings: {
    jsdoc: {
      mode: 'typescript',
    },
    // Recognize extensions for import resolution and enforce consistent usage
    'import/extensions': ['.js', '.jsx', '.ts', '.tsx'],
    'import/resolver': {
      node: {
        extensions: ['.js', '.jsx', '.ts', '.tsx'],
      },
    },
  },
  rules: {
    'jsdoc/require-param': 'error',
    'jsdoc/require-returns': 'error',
    'max-len': ['error', { code: MAX_LINE_LENGTH, ignoreComments: false }],
    'import/order': [
      'error',
      {
        groups: ['builtin', 'external', 'parent', 'sibling', 'index'],
        'newlines-between': 'always',
        alphabetize: { order: 'asc', caseInsensitive: true },
      },
    ],
    // Enforce consistent import extensions: require .js for JavaScript, disallow .ts/.tsx/.jsx extensions
    'import/extensions': [
      'error',
      'ignorePackages',
      {
        js: 'always',
        mjs: 'always',
        cjs: 'always',
        ts: 'never',
        tsx: 'never',
        jsx: 'never',
      },
    ],
    'no-multiple-empty-lines': ['error', { max: 1, maxEOF: 1, maxBOF: 0 }],
    'padding-line-between-statements': [
      'error',
      { blankLine: 'always', prev: 'import', next: '*' },
      { blankLine: 'always', prev: '*', next: 'import' },
    ],
    'lines-around-comment': [
      'error',
      {
        beforeBlockComment: true,
        afterBlockComment: true,
        beforeLineComment: false,
        afterLineComment: false,
        allowBlockStart: true,
        allowBlockEnd: true,
        allowClassStart: true,
        allowClassEnd: true,
        allowObjectStart: true,
        allowObjectEnd: true,
        allowArrayStart: true,
        allowArrayEnd: true,
      },
    ],
    // Remove unused imports and variables
    'unused-imports/no-unused-imports': 'error',
    'unused-imports/no-unused-vars': [
      'error',
      {
        vars: 'all',
        varsIgnorePattern: '^_',
        args: 'after-used',
        argsIgnorePattern: '^_',
      },
    ],
  },
  overrides: [
    {
      files: ['**/__tests__/**/*.{js,jsx,ts,tsx}'],
      rules: {
        'max-len': [
          'error',
          { code: MAX_LINE_LENGTH_TEST, ignoreComments: false },
        ],
        '@typescript-eslint/no-explicit-any': 'off',
      },
    },
  ],
};
