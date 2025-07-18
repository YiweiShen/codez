/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  collectCoverage: true,
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.test.ts'],
  coverageDirectory: 'coverage',
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\.[tj]sx?$': [
      'ts-jest',
      {
        useESM: true,
      },
    ],
  },
  transformIgnorePatterns: ['node_modules/(?!(execa|@actions|octokit)/)'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};
