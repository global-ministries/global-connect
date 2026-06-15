import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('support operations runbook', () => {
  const runbook = readFileSync(join(process.cwd(), 'docs', 'support-operations.md'), 'utf8')
  const hermesPolicy = readFileSync(join(process.cwd(), 'docs', 'hermes-response-policy.md'), 'utf8')
  const vercelConfig = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8')) as {
    crons?: Array<{ path?: string; schedule?: string }>
  }

  it('documents production release gates and safe degraded behavior', () => {
    expect(runbook).toContain('## Production Readiness Gates')
    expect(runbook).toContain('DB gate')
    expect(runbook).toContain('provider gate')
    expect(runbook).toContain('environment gate')
    expect(runbook).toContain('RLS/privacy gate')
    expect(runbook).toContain('smoke gate')
    expect(runbook).toContain('rollback gate')
    expect(runbook).toContain('safe degraded')
  })

  it('requires staff-approved sanitized external escalation before outbound delivery', () => {
    expect(runbook).toContain('staff-approved')
    expect(runbook).toContain('sanitized external escalation')
    expect(runbook).toContain('must not be treated as a general PII scrubber')
  })

  it('documents the external inbound support event name', () => {
    expect(runbook).toContain('support/external.update.received')
  })

  it('documents PR 3 inbound callback persistence boundary without direct staff dispatch', () => {
    expect(runbook).toContain('For PR 3')
    expect(runbook).toContain('/api/support/external/inbound')
    expect(runbook).toContain('persists the callback audit row and message only')
    expect(runbook).toContain('does **not** dispatch')
    expect(runbook).toContain('durable outbox/replay')
  })

  it('documents that /api/inngest remains a custom webhook in safe dual mode', () => {
    expect(runbook).toContain('Safe dual mode')
    expect(runbook).toContain('/api/inngest')
    expect(runbook).toContain('/api/inngest/official')
    expect(runbook).toContain('compatibility custom webhook')
  })

  it('documents drain-only support event dispatch and scheduler wiring without secret values', () => {
    expect(runbook).toContain('drain-only')
    expect(runbook).toContain('POST /api/support/outbox/drain')
    expect(runbook).toContain('GET /api/support/outbox/drain')
    expect(runbook).toContain('CRON_SECRET')
    expect(runbook).toContain('SUPPORT_OUTBOX_DRAIN_SECRET')
    expect(runbook).toContain('Authorization: Bearer <configured scheduler secret>')
    expect(runbook).toContain('vercel.json')
    expect(runbook).toContain('must not directly dispatch provider events')
    expect(runbook).toContain('returns counts only')
    expect(runbook).toContain('Transient dispatch failures')
    expect(runbook).toContain('Unsupported event types are marked `failed`')
    expect(vercelConfig.crons).toEqual([
      {
        path: '/api/support/outbox/drain',
        schedule: '0 8 * * *',
      },
    ])
  })

  it('documents Hermes outbound dispatch controls and PR 2 scope boundaries', () => {
    expect(runbook).toContain('support/hermes.escalation.requested')
    expect(runbook).toContain('/api/support/external/inbound')
    expect(runbook).toContain('public_reply')
    expect(runbook).toContain('internal_note')
    expect(runbook).toContain('SUPPORT_HERMES_DISPATCH_MODE')
    expect(runbook).toContain('SUPPORT_HERMES_WEBHOOK_URL')
    expect(runbook).toContain('SUPPORT_HERMES_WEBHOOK_SECRET')
    expect(runbook).toContain('event_type')
    expect(runbook).toContain('ID-first for PR 2')
    expect(runbook).toContain('future staff-reviewed safe-summary field')
    expect(runbook).toContain('Do not rely on `X-Hermes-Event`')
  })

  it('documents PR 4 Hermes response policy with allowlist, denylist, and deferral rules', () => {
    expect(runbook).toContain('Hermes response policy (PR 4)')
    expect(runbook).toContain('Direct `public_reply` allowlist')
    expect(runbook).toContain('Direct `public_reply` denylist')
    expect(runbook).toContain('`internal_note` triggers')
    expect(runbook).toContain('GitHub deferral rules')
    expect(runbook).toContain('Scenario -> action examples')
    expect(runbook).toContain('Safety rules for all Hermes responses')
  })

  it('locks safety constraints and response boundaries', () => {
    expect(runbook).toContain('PII: names')
    expect(runbook).toContain('Secrets or secrets-like values')
    expect(runbook).toContain('Diagnostics: stack traces')
    expect(runbook).toContain('Attachments and attachment metadata')
    expect(runbook).toContain('Promises of engineering fixes')
  })

  it('verifies repo-visible Hermes policy reference document', () => {
    expect(runbook).toContain('docs/hermes-response-policy.md')
    expect(hermesPolicy).toContain('# Hermes Response Policy (PR 4)')
    expect(hermesPolicy).toContain('Direct `public_reply` allowlist')
    expect(hermesPolicy).toContain('GitHub deferral')
    expect(hermesPolicy).toContain('Example mapping')
    expect(hermesPolicy).toContain('Safety constraints')
    expect(hermesPolicy).toContain('must use `internal_note` instead of `public_reply`')
    expect(hermesPolicy).toContain('Never create GitHub issues from Hermes callback handling in this PR')
    expect(hermesPolicy).toContain('Promises about engineering timelines or fixes')
  })
})
