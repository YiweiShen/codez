module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint', 'jsdoc', 'import'],
  extends: [
    'plugin:@typescript-eslint/recommended',
    'plugin:jsdoc/recommended',
    'prettier',
  ],
  settings: {
    jsdoc: {
      mode: 'typescript',
    },
  },
  rules: {
    'jsdoc/check-multiline-blocks': 'error',
    'jsdoc/newline-after-description': 'error',
    'jsdoc/require-param': 'error',
    'jsdoc/require-returns': 'error',
    'max-len': ['error', { code: 80, ignoreComments: false }],
    'import/order': ['error', { 'groups': ['builtin', 'external', 'parent', 'sibling', 'index'], 'newlines-between': 'always', 'alphabetize': { order: 'asc', caseInsensitive: true } }],
  },
};