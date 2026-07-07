import type { Config } from 'jest'
import nextJest from 'next/jest.js'

const createJestConfig = nextJest({ dir: './' })

const config: Config = {
  coverageProvider: 'v8',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/.next/',
    '<rootDir>/supabase/',
    '<rootDir>/scripts/.*\\.test\\.mjs$',
  ],
  // Skip integration:supabase tests unless RUN_INTEGRATION=1 is set.
  testNamePattern: process.env.RUN_INTEGRATION
    ? undefined
    : '^(?!.*\\[integration:supabase\\]).*$',
  collectCoverageFrom: [
    'lib/actions/**/*.ts',
    'lib/supabase/**/*.ts',
    'lib/platform/**/*.ts',
    'components/**/*.tsx',
    '!**/*.d.ts',
    '!**/node_modules/**',
  ],
  // Coverage thresholds — baseline from current coverage.
  // TODO: increase these as more tests are written. Target: 60%+ on all metrics.
  coverageThreshold: {
    global: {
      statements: 0.1,
      branches: 3,
      functions: 1,
      lines: 0.1,
    },
  },
}

export default createJestConfig(config)
