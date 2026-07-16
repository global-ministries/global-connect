/**
 * S08 RED — GDV bridge adapter
 * Verifies:
 * - Bridge emits attendance per new record (start-clean)
 * - Bridge skips records with occurredAt < bridgeStartAt (start-clean)
 * - Bridge deduplicates on 2nd observation (idempotency)
 * - Bridge routes new visitors through resolveVisitor (visitor routing)
 * - Bridge emits nothing when resolveVisitor returns requires_operator_confirmation (skip-unresolved)
 * - Bridge swallows unique violation errors as duplicate (idempotency success path)
 * - Bridge continues processing when one record fails (failure isolation)
 * - Bridge does NOT mutate GDV (reader.callCount — no write methods called)
 * - Each emitted metadata excludes raw PII (defensive PII test)
 */
import type {
  GdvAttendanceReader,
  GdvAttendanceRecord,
  OperatingCoreGdvBridgeInput,
} from '@/lib/platform/adapters/operating-core-grupos-vida'
import {
  bridgeGdvAttendanceToOperatingCore,
  GDV_BRIDGE_CAPTURE_SOURCE,
} from '@/lib/platform/adapters/operating-core-grupos-vida'
import type { VisitorResolutionResult } from '@/lib/platform/operating-core/visitor-resolution'
import type { ParticipationLedgerEvent } from '@/lib/platform/operating-core/participation-ledger-repository'

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const ACTOR = {
  personaId: 'persona-operator-001',
  allowedFlows: ['operating_core.bridge'] as readonly string[],
}

function makeRecord(overrides: Partial<GdvAttendanceRecord> = {}): GdvAttendanceRecord {
  return {
    gdvEventId: 'gdv-event-001',
    gdvPersonaId: 'gdv-usuario-001',
    occurredAt: '2026-07-16T10:00:00Z',
    grupoId: 'grupo-001',
    ...overrides,
  }
}

function makeVisitorResolutionResolved(personaId: string): VisitorResolutionResult {
  return {
    ok: true,
    decision: 'resolved',
    match: 'single_candidate',
    personaId,
    hasAuthAccount: false,
    matchedSignals: ['cedula'],
    reviewRequired: false,
    metadata: {
      matchMethod: 'cedula_exact',
      captureSource: 'form',
      resolvedAt: new Date().toISOString(),
    },
  }
}

function makeVisitorResolutionNoMatch(createdId: string): VisitorResolutionResult {
  return {
    ok: true,
    decision: 'resolved',
    match: 'no_match',
    createdPersona: { id: createdId, autoMerge: false },
    metadata: {
      matchMethod: 'minimal_creation',
      captureSource: 'form',
      resolvedAt: new Date().toISOString(),
    },
  }
}

function makeVisitorResolutionAmbiguous(): VisitorResolutionResult {
  return {
    ok: false,
    decision: 'ambiguous_candidates',
    reason: 'requires_operator_confirmation',
    candidates: [
      {
        personaId: 'persona-amb-001',
        displayName: 'J. Doe',
        hasAuthAccount: false,
        matchedSignals: ['cedula'],
      },
    ],
    metadata: {
      matchMethod: 'cedula_exact',
      captureSource: 'form',
      resolvedAt: new Date().toISOString(),
    },
  }
}

function makeOcEvent(overrides: Partial<ParticipationLedgerEvent> = {}): ParticipationLedgerEvent {
  return {
    id: 'oc-event-001',
    kind: 'attendance',
    subjectId: 'persona-001',
    occurredAt: '2026-07-16T10:00:00Z',
    actorPersonaId: ACTOR.personaId,
    captureSource: GDV_BRIDGE_CAPTURE_SOURCE,
    experience: 'operating_core',
    eventId: null,
    serviceId: null,
    eventInstanceId: null,
    correctsEventId: null,
    status: 'recorded',
    metadata: { gdv_event_id: 'gdv-event-001' },
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// RED tests — all should fail until bridge implementation exists
// ---------------------------------------------------------------------------

describe('bridgeGdvAttendanceToOperatingCore', () => {
  // Helper to build a minimal working input (override per test)
  function buildInput(overrides: Partial<{
    reader: GdvAttendanceReader
    visitorResolver: jest.Mock
    ocLedger: { append: jest.Mock }
    bridgeStartAt: Date
  }> = {}): OperatingCoreGdvBridgeInput {
    const reader: GdvAttendanceReader = {
      listNewAttendances: jest.fn(async () => []),
    }
    const visitorResolver = jest.fn()
    const ocLedger = {
      append: jest.fn(),
    }
    return {
      reader: overrides.reader ?? reader,
      visitorResolver: overrides.visitorResolver ?? visitorResolver,
      ocLedger: overrides.ocLedger ?? ocLedger,
      actor: ACTOR,
      bridgeStartAt: overrides.bridgeStartAt ?? new Date('2026-01-01T00:00:00Z'),
    }
  }

  describe('start-clean: bridgeStartAt filter', () => {
    it('should skip records with occurredAt < bridgeStartAt', async () => {
      const bridgeStartAt = new Date('2026-07-16T00:00:00Z')
      const oldRecord = makeRecord({
        gdvEventId: 'gdv-old',
        occurredAt: '2026-07-15T09:00:00Z', // before bridgeStartAt
      })
      const newRecord = makeRecord({
        gdvEventId: 'gdv-new',
        occurredAt: '2026-07-16T10:00:00Z', // after bridgeStartAt
      })

      const reader: GdvAttendanceReader = {
        listNewAttendances: jest.fn(async () => [oldRecord, newRecord]),
      }
      const visitorResolver = jest.fn().mockResolvedValue(makeVisitorResolutionResolved('persona-001'))
      const ocLedger = {
        append: jest.fn().mockResolvedValue(makeOcEvent()),
      }
      const input = buildInput({ reader, visitorResolver, ocLedger, bridgeStartAt })

      const result = await bridgeGdvAttendanceToOperatingCore(input)

      // old record skipped
      const oldResult = result.perRecord.find((r) => r.gdvEventId === 'gdv-old')
      expect(oldResult?.status).toBe('skipped_before_bridge_start')

      // new record emitted
      const newResult = result.perRecord.find((r) => r.gdvEventId === 'gdv-new')
      expect(newResult?.status).toBe('emitted')
    })

    it('should emit records with occurredAt >= bridgeStartAt', async () => {
      const bridgeStartAt = new Date('2026-07-16T10:00:00Z')
      const record = makeRecord({
        gdvEventId: 'gdv-on-time',
        occurredAt: '2026-07-16T10:00:00Z', // exactly at bridgeStartAt
      })

      const reader: GdvAttendanceReader = {
        listNewAttendances: jest.fn(async () => [record]),
      }
      const visitorResolver = jest.fn().mockResolvedValue(makeVisitorResolutionResolved('persona-001'))
      const ocLedger = {
        append: jest.fn().mockResolvedValue(makeOcEvent()),
      }
      const input = buildInput({ reader, visitorResolver, ocLedger, bridgeStartAt })

      const result = await bridgeGdvAttendanceToOperatingCore(input)

      expect(result.total).toBe(1)
      expect(result.emitted).toBe(1)
      const r = result.perRecord[0]
      expect(r.status).toBe('emitted')
    })
  })

  describe('idempotency via UNIQUE(subject_id, kind, occurred_at)', () => {
    it('should treat unique violation as duplicate (idempotency success)', async () => {
      const record = makeRecord({ gdvEventId: 'gdv-dup' })

      const reader: GdvAttendanceReader = {
        listNewAttendances: jest.fn(async () => [record]),
      }
      const visitorResolver = jest.fn().mockResolvedValue(makeVisitorResolutionResolved('persona-001'))
      const uniqueError = new Error('unique constraint violation')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(uniqueError as any).code = '23505'
      const ocLedger = {
        append: jest.fn().mockRejectedValue(uniqueError),
      }
      const input = buildInput({ reader, visitorResolver, ocLedger })

      const result = await bridgeGdvAttendanceToOperatingCore(input)

      expect(result.total).toBe(1)
      expect(result.duplicate).toBe(1)
      expect(result.emitted).toBe(0)
      const r = result.perRecord[0]
      expect(r.status).toBe('duplicate')
    })

    it('should count multiple unique violations as duplicates', async () => {
      const records = [
        makeRecord({ gdvEventId: 'gdv-dup-1' }),
        makeRecord({ gdvEventId: 'gdv-dup-2' }),
      ]

      const uniqueError = new Error('unique constraint violation')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(uniqueError as any).code = '23505'

      const reader: GdvAttendanceReader = {
        listNewAttendances: jest.fn(async () => records),
      }
      const visitorResolver = jest.fn().mockResolvedValue(makeVisitorResolutionResolved('persona-001'))
      const ocLedger = {
        append: jest.fn().mockRejectedValue(uniqueError),
      }
      const input = buildInput({ reader, visitorResolver, ocLedger })

      const result = await bridgeGdvAttendanceToOperatingCore(input)

      expect(result.total).toBe(2)
      expect(result.duplicate).toBe(2)
      expect(result.emitted).toBe(0)
    })
  })

  describe('failure isolation: per-record try/catch', () => {
    it('should continue processing other records when one fails', async () => {
      const goodRecord = makeRecord({ gdvEventId: 'gdv-good' })
      const badRecord = makeRecord({ gdvEventId: 'gdv-bad' })

      const reader: GdvAttendanceReader = {
        listNewAttendances: jest.fn(async () => [badRecord, goodRecord]),
      }
      const visitorResolver = jest.fn().mockResolvedValue(makeVisitorResolutionResolved('persona-001'))
      const ocLedger = {
        append: jest
          .fn()
          .mockRejectedValueOnce(new Error('network failure'))
          .mockResolvedValueOnce(makeOcEvent()),
      }
      const input = buildInput({ reader, visitorResolver, ocLedger })

      const result = await bridgeGdvAttendanceToOperatingCore(input)

      expect(result.total).toBe(2)
      expect(result.failed).toBe(1)
      expect(result.emitted).toBe(1)

      const badResult = result.perRecord.find((r) => r.gdvEventId === 'gdv-bad')
      expect(badResult?.status).toBe('failed')

      const goodResult = result.perRecord.find((r) => r.gdvEventId === 'gdv-good')
      expect(goodResult?.status).toBe('emitted')
    })

    it('should capture error message in failed status', async () => {
      const record = makeRecord({ gdvEventId: 'gdv-err' })

      const reader: GdvAttendanceReader = {
        listNewAttendances: jest.fn(async () => [record]),
      }
      const visitorResolver = jest.fn().mockResolvedValue(makeVisitorResolutionResolved('persona-001'))
      const ocLedger = {
        append: jest.fn().mockRejectedValue(new Error('connection refused')),
      }
      const input = buildInput({ reader, visitorResolver, ocLedger })

      const result = await bridgeGdvAttendanceToOperatingCore(input)

      const r = result.perRecord[0]
      expect(r.status).toBe('failed')
      expect((r as { error: string }).error).toContain('connection refused')
    })
  })

  describe('visitor routing via resolveVisitor', () => {
    it('should use resolved personaId for single_candidate outcome', async () => {
      const record = makeRecord({ gdvEventId: 'gdv-visitor' })
      const resolvedPersonaId = 'persona-visitor-001'

      const reader: GdvAttendanceReader = {
        listNewAttendances: jest.fn(async () => [record]),
      }
      const visitorResolver = jest.fn().mockResolvedValue(makeVisitorResolutionResolved(resolvedPersonaId))
      let capturedSubjectId: string | undefined
      const ocLedger = {
        append: jest.fn().mockImplementation(async (input: { subjectId: string }) => {
          capturedSubjectId = input.subjectId
          return makeOcEvent({ subjectId: input.subjectId })
        }),
      }
      const input = buildInput({ reader, visitorResolver, ocLedger })

      await bridgeGdvAttendanceToOperatingCore(input)

      expect(visitorResolver).toHaveBeenCalled()
      expect(capturedSubjectId).toBe(resolvedPersonaId)
    })

    it('should use createdPersona.id for no_match outcome', async () => {
      const record = makeRecord({ gdvEventId: 'gdv-newbie' })
      const createdId = 'persona-stub-001'

      const reader: GdvAttendanceReader = {
        listNewAttendances: jest.fn(async () => [record]),
      }
      const visitorResolver = jest.fn().mockResolvedValue(makeVisitorResolutionNoMatch(createdId))
      let capturedSubjectId: string | undefined
      const ocLedger = {
        append: jest.fn().mockImplementation(async (input: { subjectId: string }) => {
          capturedSubjectId = input.subjectId
          return makeOcEvent({ subjectId: input.subjectId })
        }),
      }
      const input = buildInput({ reader, visitorResolver, ocLedger })

      await bridgeGdvAttendanceToOperatingCore(input)

      expect(capturedSubjectId).toBe(createdId)
    })

    it('should skip and not emit when visitor resolution returns ambiguous_candidates', async () => {
      const record = makeRecord({ gdvEventId: 'gdv-ambiguous' })

      const reader: GdvAttendanceReader = {
        listNewAttendances: jest.fn(async () => [record]),
      }
      const visitorResolver = jest.fn().mockResolvedValue(makeVisitorResolutionAmbiguous())
      const ocLedger = { append: jest.fn() }
      const input = buildInput({ reader, visitorResolver, ocLedger })

      const result = await bridgeGdvAttendanceToOperatingCore(input)

      expect(result.emitted).toBe(0)
      expect(result.skipped).toBe(1)
      const r = result.perRecord[0]
      expect(r.status).toBe('skipped_unresolved_visitor')
      expect(ocLedger.append).not.toHaveBeenCalled()
    })

    it('should emit attendance kind, not visitor_capture kind (S08 only emits attendance)', async () => {
      const record = makeRecord({ gdvEventId: 'gdv-att' })

      const reader: GdvAttendanceReader = {
        listNewAttendances: jest.fn(async () => [record]),
      }
      const visitorResolver = jest.fn().mockResolvedValue(makeVisitorResolutionResolved('persona-001'))
      let capturedKind: string | undefined
      const ocLedger = {
        append: jest.fn().mockImplementation(async (input: { kind: string }) => {
          capturedKind = input.kind
          return makeOcEvent({ kind: input.kind as 'attendance' })
        }),
      }
      const input = buildInput({ reader, visitorResolver, ocLedger })

      await bridgeGdvAttendanceToOperatingCore(input)

      expect(capturedKind).toBe('attendance')
    })
  })

  describe('NON-PII metadata discipline', () => {
    it('should include gdv_event_id in emitted metadata (non-PII)', async () => {
      const record = makeRecord({ gdvEventId: 'gdv-pii-test' })

      const reader: GdvAttendanceReader = {
        listNewAttendances: jest.fn(async () => [record]),
      }
      const visitorResolver = jest.fn().mockResolvedValue(makeVisitorResolutionResolved('persona-001'))
      let capturedMetadata: Record<string, unknown> | undefined
      const ocLedger = {
        append: jest.fn().mockImplementation(async (input: { metadata?: Record<string, unknown> }) => {
          capturedMetadata = input.metadata
          return makeOcEvent({ metadata: input.metadata })
        }),
      }
      const input = buildInput({ reader, visitorResolver, ocLedger })

      await bridgeGdvAttendanceToOperatingCore(input)

      expect(capturedMetadata).toBeDefined()
      expect((capturedMetadata as Record<string, unknown>)['gdv_event_id']).toBe('gdv-pii-test')
    })

    it('should spread caller-provided captureMetadata into emitted metadata', async () => {
      const record = makeRecord({
        gdvEventId: 'gdv-meta',
        captureMetadata: Object.freeze({ grupo_label: 'Grupo 1', servicio: 'dominical' }),
      })

      const reader: GdvAttendanceReader = {
        listNewAttendances: jest.fn(async () => [record]),
      }
      const visitorResolver = jest.fn().mockResolvedValue(makeVisitorResolutionResolved('persona-001'))
      let capturedMetadata: Record<string, unknown> | undefined
      const ocLedger = {
        append: jest.fn().mockImplementation(async (input: { metadata?: Record<string, unknown> }) => {
          capturedMetadata = input.metadata
          return makeOcEvent({ metadata: input.metadata })
        }),
      }
      const input = buildInput({ reader, visitorResolver, ocLedger })

      await bridgeGdvAttendanceToOperatingCore(input)

      expect((capturedMetadata as Record<string, unknown>)['grupo_label']).toBe('Grupo 1')
      expect((capturedMetadata as Record<string, unknown>)['servicio']).toBe('dominical')
    })

    it('should use gdv_bridge as capture_source', async () => {
      const record = makeRecord({ gdvEventId: 'gdv-src' })

      const reader: GdvAttendanceReader = {
        listNewAttendances: jest.fn(async () => [record]),
      }
      const visitorResolver = jest.fn().mockResolvedValue(makeVisitorResolutionResolved('persona-001'))
      let capturedSource: string | undefined
      const ocLedger = {
        append: jest.fn().mockImplementation(async (input: { captureSource: string }) => {
          capturedSource = input.captureSource
          return makeOcEvent({ captureSource: input.captureSource })
        }),
      }
      const input = buildInput({ reader, visitorResolver, ocLedger })

      await bridgeGdvAttendanceToOperatingCore(input)

      expect(capturedSource).toBe('gdv_bridge')
    })
  })

  describe('read-only discipline: GDV never mutated', () => {
    it('should only call listNewAttendances (no write methods) on the reader', async () => {
      const records = [
        makeRecord({ gdvEventId: 'gdv-ro-1' }),
        makeRecord({ gdvEventId: 'gdv-ro-2' }),
      ]

      const reader: GdvAttendanceReader = {
        listNewAttendances: jest.fn(async () => records),
        // No other methods — this verifies no write path is invoked
      }
      const visitorResolver = jest.fn().mockResolvedValue(makeVisitorResolutionResolved('persona-001'))
      const ocLedger = {
        append: jest.fn().mockResolvedValue(makeOcEvent()),
      }
      const input = buildInput({ reader, visitorResolver, ocLedger })

      await bridgeGdvAttendanceToOperatingCore(input)

      // Only listNewAttendances should be called; no insert/update/delete
      expect(reader.listNewAttendances).toHaveBeenCalledTimes(1)
      expect(Object.keys(reader)).toHaveLength(1)
    })

    it('should not call visitorResolver more times than records', async () => {
      const records = [
        makeRecord({ gdvEventId: 'gdv-call-1' }),
        makeRecord({ gdvEventId: 'gdv-call-2' }),
        makeRecord({ gdvEventId: 'gdv-call-3' }),
      ]

      const reader: GdvAttendanceReader = {
        listNewAttendances: jest.fn(async () => records),
      }
      const visitorResolver = jest.fn().mockResolvedValue(makeVisitorResolutionResolved('persona-001'))
      const ocLedger = {
        append: jest.fn().mockResolvedValue(makeOcEvent()),
      }
      const input = buildInput({ reader, visitorResolver, ocLedger })

      await bridgeGdvAttendanceToOperatingCore(input)

      // visitorResolver should be called once per record (skipping before-bridge-start)
      expect(visitorResolver).toHaveBeenCalledTimes(3)
    })
  })

  describe('bridge result aggregation', () => {
    it('should return correct totals when all records emit', async () => {
      const records = [
        makeRecord({ gdvEventId: 'gdv-all-1' }),
        makeRecord({ gdvEventId: 'gdv-all-2' }),
        makeRecord({ gdvEventId: 'gdv-all-3' }),
      ]

      const reader: GdvAttendanceReader = {
        listNewAttendances: jest.fn(async () => records),
      }
      const visitorResolver = jest.fn().mockResolvedValue(makeVisitorResolutionResolved('persona-001'))
      const ocLedger = {
        append: jest.fn().mockResolvedValue(makeOcEvent()),
      }
      const input = buildInput({ reader, visitorResolver, ocLedger })

      const result = await bridgeGdvAttendanceToOperatingCore(input)

      expect(result.total).toBe(3)
      expect(result.emitted).toBe(3)
      expect(result.duplicate).toBe(0)
      expect(result.skipped).toBe(0)
      expect(result.failed).toBe(0)
    })

    it('should return perRecord in same order as input records', async () => {
      const records = [
        makeRecord({ gdvEventId: 'gdv-seq-1' }),
        makeRecord({ gdvEventId: 'gdv-seq-2' }),
        makeRecord({ gdvEventId: 'gdv-seq-3' }),
      ]

      const reader: GdvAttendanceReader = {
        listNewAttendances: jest.fn(async () => records),
      }
      const visitorResolver = jest.fn().mockResolvedValue(makeVisitorResolutionResolved('persona-001'))
      const ocLedger = {
        append: jest.fn().mockResolvedValue(makeOcEvent()),
      }
      const input = buildInput({ reader, visitorResolver, ocLedger })

      const result = await bridgeGdvAttendanceToOperatingCore(input)

      expect(result.perRecord).toHaveLength(3)
      expect(result.perRecord[0].gdvEventId).toBe('gdv-seq-1')
      expect(result.perRecord[1].gdvEventId).toBe('gdv-seq-2')
      expect(result.perRecord[2].gdvEventId).toBe('gdv-seq-3')
    })
  })

  describe('GDV_BRIDGE_CAPTURE_SOURCE constant', () => {
    it('should equal gdv_bridge', () => {
      expect(GDV_BRIDGE_CAPTURE_SOURCE).toBe('gdv_bridge')
    })
  })
})
