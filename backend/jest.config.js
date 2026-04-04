// nexus/backend/jest.config.js
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/server.js',   // entry point — tested via integration
    '!src/utils/**',
  ],
  coverageThresholds: {
    global: { branches: 70, functions: 80, lines: 80, statements: 80 },
  },
  setupFilesAfterFramework: [],
  testTimeout: 30000,   // allow for DB round-trips in integration tests
  // Run unit tests in parallel, integration tests sequentially
  projects: [
    {
      displayName: 'unit',
      testMatch: ['**/__tests__/auth.middleware.test.js', '**/__tests__/sanitize.test.js'],
      testEnvironment: 'node',
    },
    {
      displayName: 'integration',
      testMatch: ['**/__tests__/*.routes.test.js'],
      testEnvironment: 'node',
      runner: 'jest-serial-runner',
    },
  ],
};
