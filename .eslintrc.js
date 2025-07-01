module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint', 'jsdoc'],
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
  },
};