import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('support operations runbook', () => {
  const runbook = readFileSync(join(process.cwd(), 'docs', 'support-operations.md'), 'utf8')

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
})
