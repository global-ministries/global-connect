import {
  createPlatformGrantAudit,
  PLATFORM_GRANT_DECISIONS,
  type PlatformGrantAuditEvent,
  type PlatformGrantMetricsSnapshot,
} from '@/lib/platform/grants'

const scope = (experience: string, source: string): PlatformGrantAuditEvent => ({
  actorPersonaId: 'persona-1',
  source,
  decision: 'grant',
  scope: { experience, scopeType: 'group' },
  recordedAt: new Date('2026-07-06T00:00:00.000Z'),
})

const deny = (experience: string, source: string): PlatformGrantAuditEvent => ({
  actorPersonaId: 'persona-2',
  source,
  decision: 'deny',
  scope: { experience, scopeType: 'course' },
  reason: 'missing_capability',
  recordedAt: new Date('2026-07-06T01:00:00.000Z'),
})

function buildMetrics(entries: [string, number][]): PlatformGrantMetricsSnapshot {
  return new Map(entries) as PlatformGrantMetricsSnapshot
}

describe('lib/platform/grants', () => {
  describe('createPlatformGrantAudit', () => {
    it('returns a non-null system object', () => {
      const system = createPlatformGrantAudit()
      expect(system).not.toBeNull()
      expect(typeof system.logger.record).toBe('function')
      expect(typeof system.metrics.recordGrant).toBe('function')
      expect(typeof system.checkDenialThreshold).toBe('function')
    })

    it('returns independent instances', () => {
      const a = createPlatformGrantAudit()
      const b = createPlatformGrantAudit()
      a.metrics.recordGrant('grupos_vida', 'app.gdv')
      expect(a.metrics.getSnapshot().get('grupos_vida|app.gdv|grant')).toBe(1)
      expect(b.metrics.getSnapshot().get('grupos_vida|app.gdv|grant')).toBeUndefined()
    })

    it('exports the four canonical decisions', () => {
      expect(PLATFORM_GRANT_DECISIONS).toEqual(['grant', 'revoke', 'deny', 'audit'])
    })
  })

  describe('audit event recording', () => {
    it('records grant, deny and audit events in order and updates metrics', () => {
      const { logger, metrics } = createPlatformGrantAudit()
      const grant = scope('grupos_vida', 'app.gdv')
      const revocation: PlatformGrantAuditEvent = {
        ...grant,
        decision: 'revoke',
        reason: 'role_changed',
        after: { active: false },
      }
      const audit: PlatformGrantAuditEvent = {
        ...grant,
        decision: 'audit',
        source: 'system.audit',
      }

      logger.record(grant)
      logger.record(deny('dps', 'app.dps'))
      logger.record(revocation)
      logger.record(audit)

      expect(logger.getEvents()).toEqual([grant, deny('dps', 'app.dps'), revocation, audit])
      expect(metrics.getSnapshot().get('grupos_vida|app.gdv|grant')).toBe(1)
      expect(metrics.getSnapshot().get('dps|app.dps|deny')).toBe(1)
      expect(metrics.getSnapshot().get('grupos_vida|app.gdv|revoke')).toBe(1)
      expect(metrics.getSnapshot().get('grupos_vida|system.audit|audit')).toBe(1)
    })
  })

  describe('metrics accumulation', () => {
    it('increments only the requested metric key', () => {
      const { metrics } = createPlatformGrantAudit()
      metrics.recordGrant('grupos_vida', 'app.gdv')
      metrics.recordDenial('dps', 'app.dream-team')
      metrics.recordAudit('grupos_vida', 'system.audit')
      metrics.recordRevoke('dps', 'app.dps')

      const snapshot = metrics.getSnapshot()
      expect(snapshot.get('grupos_vida|app.gdv|grant')).toBe(1)
      expect(snapshot.get('dps|app.dream-team|deny')).toBe(1)
      expect(snapshot.get('grupos_vida|system.audit|audit')).toBe(1)
      expect(snapshot.get('dps|app.dps|revoke')).toBe(1)
      expect(snapshot.get('grupos_vida|app.gdv|deny')).toBeUndefined()
    })

    it('returns a ReadonlyMap with independent counts per source', () => {
      const { metrics } = createPlatformGrantAudit()
      metrics.recordGrant('grupos_vida', 'app.gdv')
      metrics.recordGrant('grupos_vida', 'legacy.admin')
      const snapshot = metrics.getSnapshot()
      expect(snapshot).toBeInstanceOf(Map)
      expect(snapshot.get('grupos_vida|app.gdv|grant')).toBe(1)
      expect(snapshot.get('grupos_vida|legacy.admin|grant')).toBe(1)
    })

    it('tracks grant and denial metrics separately for the same experience and source', () => {
      const { metrics } = createPlatformGrantAudit()
      metrics.recordGrant('grupos_vida', 'app.gdv')
      metrics.recordDenial('grupos_vida', 'app.gdv')
      const snapshot = metrics.getSnapshot()
      expect(snapshot.get('grupos_vida|app.gdv|grant')).toBe(1)
      expect(snapshot.get('grupos_vida|app.gdv|deny')).toBe(1)
    })
  })

  describe('alert threshold check', () => {
    it('returns ok when denials are at or below the threshold', () => {
      const below = createPlatformGrantAudit().checkDenialThreshold(
        buildMetrics([['grupos_vida|app.gdv|deny', 3]]),
        { maxDenials: 5, windowMinutes: 10 },
      )
      const exact = createPlatformGrantAudit().checkDenialThreshold(
        buildMetrics([['grupos_vida|app.gdv|deny', 5]]),
        { maxDenials: 5, windowMinutes: 10 },
      )
      expect(below).toEqual({ ok: true, alerts: [] })
      expect(exact).toEqual({ ok: true, alerts: [] })
    })

    it('returns an alert when denials exceed the threshold', () => {
      const result = createPlatformGrantAudit().checkDenialThreshold(
        buildMetrics([['dps|app.dps|deny', 7]]),
        { maxDenials: 5, windowMinutes: 10 },
      )
      expect(result).toEqual({
        ok: false,
        alerts: [
          { key: 'dps|app.dps', experience: 'dps', source: 'app.dps', denialCount: 7, threshold: 5 },
        ],
      })
    })

    it('returns multiple alerts and ignores non-deny keys', () => {
      const result = createPlatformGrantAudit().checkDenialThreshold(
        buildMetrics([
          ['grupos_vida|app.gdv|grant', 100],
          ['grupos_vida|app.gdv|deny', 9],
          ['dps|app.dream-team|deny', 6],
        ]),
        { maxDenials: 5, windowMinutes: 10 },
      )
      expect(result.ok).toBe(false)
      expect(result.alerts).toHaveLength(2)
      expect(result.alerts).toContainEqual({
        key: 'grupos_vida|app.gdv',
        experience: 'grupos_vida',
        source: 'app.gdv',
        denialCount: 9,
        threshold: 5,
      })
      expect(result.alerts).toContainEqual({
        key: 'dps|app.dream-team',
        experience: 'dps',
        source: 'app.dream-team',
        denialCount: 6,
        threshold: 5,
      })
    })

    it('returns ok for an empty metrics snapshot', () => {
      const result = createPlatformGrantAudit().checkDenialThreshold(
        buildMetrics([]),
        { maxDenials: 5, windowMinutes: 10 },
      )
      expect(result).toEqual({ ok: true, alerts: [] })
    })
  })
})
