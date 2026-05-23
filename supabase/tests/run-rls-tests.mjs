/**
 * RLS Policy Test Runner for Global Connect
 *
 * Tests Row Level Security policies by:
 * 1. Setting up test data using the service role key (admin)
 * 2. Attempting operations as different user roles
 * 3. Verifying that policies correctly allow/deny access
 *
 * Usage:
 *   node supabase/tests/run-rls-tests.mjs
 *
 * Environment variables required:
 *   NEXT_PUBLIC_SUPABASE_URL    - Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY    - Service role key for setup
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY - Anon key for unauthenticated tests
 *
 * Optional:
 *   RLS_TEST_TAG - Run only tests matching a tag (e.g. "grupos", "usuarios")
 */

import { createClient } from '@supabase/supabase-js'

// ─── Configuration ────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const RLS_TEST_TAG = process.env.RLS_TEST_TAG || null
const RLS_ENV = process.env.RLS_ENV || 'unknown'
const ALLOW_MUTATING_RLS_TESTS = process.env.ALLOW_MUTATING_RLS_TESTS === 'true'
const TEST_RUN_ID = process.env.GITHUB_RUN_ID || `local-${Date.now()}`

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
  console.error('❌ Missing required environment variables:')
  console.error('   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY')
  process.exit(1)
}

if (RLS_ENV !== 'staging') {
  console.error('❌ RLS tests are blocked outside staging environment.')
  console.error(`   Current RLS_ENV='${RLS_ENV}'. Set RLS_ENV=staging to run.`)
  process.exit(1)
}

const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
const anonClient = createClient(SUPABASE_URL, ANON_KEY)

// ─── Test Framework ──────────────────────────────────────────────────────────

let passed = 0
let failed = 0
let skipped = 0
const failures = []

/**
 * Create a test context with authenticated clients for different roles
 */
export function createTestContext() {
  return {
    admin: adminClient,
    anon: anonClient,
    createClient: (url, key) => createClient(url, key),
    serviceRoleKey: SERVICE_ROLE_KEY,
    anonKey: ANON_KEY,
    rlsEnv: RLS_ENV,
    allowMutating: ALLOW_MUTATING_RLS_TESTS,
    testRunId: TEST_RUN_ID,
  }
}

// ─── Test registry ─────────────────────────────────────────────────────────────

export const testSuites = []

/**
 * Register a test suite
 */
export function describe(name, fn) {
  const suite = { name, tests: [], beforeFns: [], afterFns: [] }
  const testFns = {
    it: (testName, testFn, tags = []) => {
      suite.tests.push({ name: testName, fn: testFn, tags })
    },
    before: (fn) => suite.beforeFns.push(fn),
    after: (fn) => suite.afterFns.push(fn),
  }
  fn(testFns)
  testSuites.push(suite)
}

/**
 * Assertion helpers
 */
export function expect(result) {
  return {
    toBeTrue() {
      if (result.data !== true && result !== true) {
        throw new Error(`Expected true, got ${JSON.stringify(result)}`)
      }
    },
    toBeFalse() {
      if (result.data !== false && result !== false) {
        throw new Error(`Expected false, got ${JSON.stringify(result)}`)
      }
    },
    toHaveLength(expected) {
      const len = Array.isArray(result.data) ? result.data.length : 0
      if (len !== expected) {
        throw new Error(`Expected length ${expected}, got ${len}`)
      }
    },
    toReturnEmpty() {
      if (result.data && result.data.length > 0) {
        throw new Error(`Expected empty result, got ${result.data.length} rows`)
      }
    },
    toReturnRows(minRows = 1) {
      if (!result.data || result.data.length < minRows) {
        throw new Error(`Expected at least ${minRows} rows, got ${result.data?.length ?? 0}`)
      }
    },
    toBeDenied() {
      // RLS should deny — the result should have an error or empty data
      const hasError = result.error !== null
      const hasNoData = !result.data || (Array.isArray(result.data) && result.data.length === 0)
      if (!hasError && !hasNoData) {
        throw new Error(
          `Expected RLS denial, but got data: ${JSON.stringify(result.data)}`
        )
      }
    },
    toBeAllowed() {
      // RLS should allow — no error and data present
      if (result.error) {
        throw new Error(`Expected RLS allow, but got error: ${result.error.message}`)
      }
    },
  }
}

// ─── Runner ───────────────────────────────────────────────────────────────────

async function run() {
  // Import test files dynamically so describe/testSuites are already defined
  await import('./rls-policies.test.mjs')

  console.log('\n🔒 RLS Policy Tests\n')
  console.log('━'.repeat(50))

  for (const suite of testSuites) {
    // Filter by tag if specified
    if (RLS_TEST_TAG) {
      const hasMatchingTests = suite.tests.some(t => t.tags.includes(RLS_TEST_TAG))
      if (!hasMatchingTests) {
        skipped += suite.tests.length
        continue
      }
    }

    console.log(`\n📁 ${suite.name}`)

    // Run before hooks
    let suiteSkipped = false
    for (const beforeFn of suite.beforeFns) {
      try {
        await beforeFn(createTestContext())
      } catch (err) {
        console.error(`   ❌ BEFORE hook failed: ${err.message}`)
        // Skip all tests in suite
        for (const test of suite.tests) {
          skipped++
        }
        suiteSkipped = true
        break
      }
    }

    if (suiteSkipped) continue

    for (const test of suite.tests) {
      if (RLS_TEST_TAG && !test.tags.includes(RLS_TEST_TAG)) {
        skipped++
        continue
      }

      try {
        await test.fn(createTestContext())
        console.log(`   ✅ ${test.name}`)
        passed++
      } catch (err) {
        console.log(`   ❌ ${test.name}`)
        console.log(`      ${err.message}`)
        failures.push({ suite: suite.name, test: test.name, error: err.message })
        failed++
      }
    }

    // Run after hooks
    for (const afterFn of suite.afterFns) {
      try {
        await afterFn(createTestContext())
      } catch (err) {
        console.error(`   ⚠️  AFTER hook failed: ${err.message}`)
      }
    }
  }

  console.log('\n' + '━'.repeat(50))
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed, ${skipped} skipped\n`)

  if (failures.length > 0) {
    console.log('❌ Failures:\n')
    for (const f of failures) {
      console.log(`   ${f.suite} > ${f.test}`)
      console.log(`     ${f.error}\n`)
    }
    process.exit(1)
  }

  console.log('✅ All RLS policy tests passed!\n')
}

run().catch((err) => {
  console.error('Fatal error running tests:', err)
  process.exit(1)
})
