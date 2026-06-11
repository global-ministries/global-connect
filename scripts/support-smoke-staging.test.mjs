import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  assertSafeBaseUrl,
  assertStagingEnvironment,
  isObviousProductionHost,
  parseArgs,
  redact,
  withRouteProtectionBypass,
} from './support-smoke-staging.mjs'

describe('support smoke staging guards', () => {
  it('requires explicit staging RLS guard', () => {
    assert.throws(() => assertStagingEnvironment({ RLS_ENV: 'production' }), /RLS_ENV must be exactly "staging"/)
    assert.doesNotThrow(() => assertStagingEnvironment({ RLS_ENV: 'staging' }))
  })

  it('refuses obvious production hosts', () => {
    assert.equal(isObviousProductionHost('connect.yosoyglobal.org'), true)
    assert.throws(() => assertSafeBaseUrl('https://connect.yosoyglobal.org'), /production-looking/)
    assert.equal(assertSafeBaseUrl('https://staging-connect.example.test'), 'https://staging-connect.example.test')
  })

  it('refuses public secret-looking environment keys', () => {
    assert.throws(() => assertStagingEnvironment({ RLS_ENV: 'staging', NEXT_PUBLIC_SECRET_TOKEN: 'x' }), /public secret-looking env keys/)
  })

  it('parses focused check flags and redacts values', () => {
    assert.deepEqual(parseArgs(['--only=inngest,r2']).checks, ['inngest', 'r2'])
    assert.equal(redact('abc123'), '[redacted]')
    assert.equal(redact('smoke-1234567890'), 'smok...[redacted]...7890')
  })

  it('adds Vercel protection bypass only to app route requests', () => {
    const env = {
      SUPPORT_SMOKE_BASE_URL: 'https://staging-connect.example.test',
      VERCEL_AUTOMATION_BYPASS_SECRET: 'vercel-bypass-secret',
    }

    assert.deepEqual(
      withRouteProtectionBypass('https://staging-connect.example.test/api/inngest', { authorization: 'Bearer smoke' }, env),
      {
        authorization: 'Bearer smoke',
        'x-vercel-protection-bypass': 'vercel-bypass-secret',
      }
    )
    assert.deepEqual(
      withRouteProtectionBypass('https://api.resend.com/emails', { authorization: 'Bearer provider' }, env),
      { authorization: 'Bearer provider' }
    )
    assert.deepEqual(
      withRouteProtectionBypass('https://bucket.account.r2.cloudflarestorage.com/object', {}, env),
      {}
    )
  })
})
