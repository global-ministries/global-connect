// Grants audit contract: actor/source/before-after/deny logging, metrics and alerts.
//
// Pure module. No DB, no filesystem, no env vars, no `@/lib/supabase/*` imports.
// Future adapters (Supabase, syslog, Axiom) implement `PlatformGrantAuditLogger`
// without changing this module.

// ── Decision taxonomy ───────────────────────────────────────────────
export const PLATFORM_GRANT_DECISIONS = ['grant', 'revoke', 'deny', 'audit'] as const
export type PlatformGrantDecision = (typeof PLATFORM_GRANT_DECISIONS)[number]

// ── Scope context ───────────────────────────────────────────────────
export type PlatformGrantAuditScope = {
  experience: string
  scopeType: string
  scopeId?: string
}

// ── Grant state snapshot ────────────────────────────────────────────
export type PlatformGrantState = {
  active: boolean
  capabilityKey?: string
}

// ── Audit event ─────────────────────────────────────────────────────
export type PlatformGrantAuditEvent = {
  actorPersonaId: string
  source: string
  decision: PlatformGrantDecision
  scope: PlatformGrantAuditScope
  before?: PlatformGrantState
  after?: PlatformGrantState
  /** Always present for 'deny' and 'revoke'; optional for 'grant'/'audit' */
  reason?: string
  recordedAt: Date
}

// ── Logger interface ────────────────────────────────────────────────
export interface PlatformGrantAuditLogger {
  record(event: PlatformGrantAuditEvent): void
  /** Expose recorded events for test assertions and compliance checks. */
  getEvents(): readonly PlatformGrantAuditEvent[]
}

// ── Metrics accumulator ─────────────────────────────────────────────
export type PlatformGrantMetricsSnapshot = ReadonlyMap<string, number>
// key format: `${experience}|${source}|${decision}`

export interface PlatformGrantMetrics {
  recordGrant(experience: string, source: string): void
  recordRevoke(experience: string, source: string): void
  recordDenial(experience: string, source: string): void
  recordAudit(experience: string, source: string): void
  getSnapshot(): PlatformGrantMetricsSnapshot
}

// ── Alert threshold ─────────────────────────────────────────────────
export type PlatformGrantAlertThreshold = {
  maxDenials: number
  /** For future time-windowed checks; not used in Fase 6 pure check. */
  windowMinutes: number
}

export type PlatformGrantAlert = {
  key: string // `${experience}|${source}`
  experience: string
  source: string
  denialCount: number
  threshold: number
}

export type PlatformGrantAlertCheckResult = {
  ok: boolean
  alerts: PlatformGrantAlert[]
}

// ── Factory return ──────────────────────────────────────────────────
export type PlatformGrantAuditSystem = {
  logger: PlatformGrantAuditLogger
  metrics: PlatformGrantMetrics
  checkDenialThreshold: (
    metrics: PlatformGrantMetricsSnapshot,
    threshold: PlatformGrantAlertThreshold,
  ) => PlatformGrantAlertCheckResult
}

function buildMetricKey(experience: string, source: string, decision: PlatformGrantDecision): string {
  return `${experience}|${source}|${decision}`
}

function parseDenialKey(metricKey: string): { experience: string; source: string } | null {
  const parts = metricKey.split('|')
  if (parts.length !== 3 || parts[2] !== 'deny') return null
  return { experience: parts[0], source: parts[1] }
}

class PlatformGrantMetricsAccumulator implements PlatformGrantMetrics {
  private readonly counts = new Map<string, number>()

  recordGrant(experience: string, source: string): void {
    this.increment(buildMetricKey(experience, source, 'grant'))
  }

  recordRevoke(experience: string, source: string): void {
    this.increment(buildMetricKey(experience, source, 'revoke'))
  }

  recordDenial(experience: string, source: string): void {
    this.increment(buildMetricKey(experience, source, 'deny'))
  }

  recordAudit(experience: string, source: string): void {
    this.increment(buildMetricKey(experience, source, 'audit'))
  }

  getSnapshot(): PlatformGrantMetricsSnapshot {
    return new Map(this.counts)
  }

  private increment(key: string): void {
    this.counts.set(key, (this.counts.get(key) ?? 0) + 1)
  }
}

class PlatformGrantAuditLoggerImpl implements PlatformGrantAuditLogger {
  private readonly events: PlatformGrantAuditEvent[] = []

  constructor(private readonly metrics: PlatformGrantMetrics) {}

  record(event: PlatformGrantAuditEvent): void {
    this.events.push(event)

    switch (event.decision) {
      case 'grant':
        this.metrics.recordGrant(event.scope.experience, event.source)
        break
      case 'revoke':
        this.metrics.recordRevoke(event.scope.experience, event.source)
        break
      case 'deny':
        this.metrics.recordDenial(event.scope.experience, event.source)
        break
      case 'audit':
        this.metrics.recordAudit(event.scope.experience, event.source)
        break
    }
  }

  getEvents(): readonly PlatformGrantAuditEvent[] {
    return this.events.slice()
  }
}

function checkDenialThreshold(
  metrics: PlatformGrantMetricsSnapshot,
  threshold: PlatformGrantAlertThreshold,
): PlatformGrantAlertCheckResult {
  const alerts: PlatformGrantAlert[] = []

  metrics.forEach((count, key) => {
    const parsed = parseDenialKey(key)
    if (!parsed) return

    if (count > threshold.maxDenials) {
      alerts.push({
        key: `${parsed.experience}|${parsed.source}`,
        experience: parsed.experience,
        source: parsed.source,
        denialCount: count,
        threshold: threshold.maxDenials,
      })
    }
  })

  return { ok: alerts.length === 0, alerts }
}

export function createPlatformGrantAudit(): PlatformGrantAuditSystem {
  const metrics = new PlatformGrantMetricsAccumulator()
  const logger = new PlatformGrantAuditLoggerImpl(metrics)

  return {
    logger,
    metrics,
    checkDenialThreshold,
  }
}
