/**
 * PR9 — DT-034/035 — Talleres events catalog + ledger writer tests.
 *
 * Covers:
 *   - buildTallerEvent returns a TallerEvent with the right shape
 *   - buildTallerEvent strips sensitive fields from the payload
 *   - buildTallerEvent throws TallerEventSensitiveDataError when input
 *     contains cedula, telefono, email, notas_privadas, or contact_data
 *   - filterSensitivePayload returns a new object without the sensitive keys
 *   - detectSensitiveFields returns the detected keys
 *   - isTallerKind narrows correctly
 *   - writeTallerEventToLedger invokes the ledger with the right kind
 *     (and rejects sensitive payloads)
 *   - flushPendingTallerEventosToOutbox reads non-emitted rows,
 *     forwards to the ledger, and flips emitted_to_outbox
 */

import {
  SCHEMA_VERSION,
  TALLER_EVENT_KINDS,
  TALLER_EVENT_SENSITIVE_FIELDS,
  buildTallerEvent,
  detectSensitiveFields,
  filterSensitivePayload,
  isTallerKind,
  TallerEventSensitiveDataError,
  type TallerEvent,
} from '@/lib/platform/talleres/events'
import {
  flushPendingTallerEventosToOutbox,
  flushPendingTallerEventosToOutboxDetailed,
  tallerWriterSensitiveDataError,
  writeTallerEventToLedger,
  type OperatingCoreParticipationLedgerRepository,
} from '@/lib/platform/talleres/participation-ledger-talleres-writer'

// ─── Helpers ────────────────────────────────────────────────────────

function makeInput(overrides: Partial<Parameters<typeof buildTallerEvent>[0]> = {}): Parameters<typeof buildTallerEvent>[0] {
  return {
    kind: 'taller_session_attended',
    personaId: '00000000-0000-0000-0000-000000000001',
    actorPersonaId: '00000000-0000-0000-0000-000000000002',
    tallerId: '00000000-0000-0000-0000-000000000003',
    scopeType: 'taller',
    ...overrides,
  }
}

function fakeLedger(): {
  readonly repo: OperatingCoreParticipationLedgerRepository
  readonly calls: ReadonlyArray<Record<string, unknown>>
} {
  const calls: Array<Record<string, unknown>> = []
  return {
    calls,
    repo: {
      async append(input: Record<string, unknown>): Promise<Record<string, unknown>> {
        calls.push(input)
        return { id: 'fake-row-id', ...input }
      },
    },
  }
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('Talleres events catalog (DT-034)', () => {
  describe('SCHEMA_VERSION', () => {
    it('is v1', () => {
      expect(SCHEMA_VERSION).toBe('v1')
    })
  })

  describe('TALLER_EVENT_KINDS', () => {
    it('has 5 canonical kinds', () => {
      expect(TALLER_EVENT_KINDS).toHaveLength(5)
      expect(TALLER_EVENT_KINDS).toEqual([
        'taller_cohort_started',
        'taller_session_attended',
        'taller_session_missed',
        'taller_completion_recorded',
        'taller_completion_failed',
      ])
    })
  })

  describe('TALLER_EVENT_SENSITIVE_FIELDS', () => {
    it('contains the 5 forbidden PII keys', () => {
      expect(TALLER_EVENT_SENSITIVE_FIELDS).toEqual([
        'cedula',
        'telefono',
        'email',
        'notas_privadas',
        'contact_data',
      ])
    })
  })

  describe('buildTallerEvent', () => {
    it('returns a TallerEvent with the right shape', () => {
      const event = buildTallerEvent(makeInput())
      expect(event).toMatchObject({
        kind: 'taller_session_attended',
        tallerId: '00000000-0000-0000-0000-000000000003',
        cohorteId: null,
        grupoId: null,
        personaId: '00000000-0000-0000-0000-000000000001',
        actorPersonaId: '00000000-0000-0000-0000-000000000002',
        scopeType: 'taller',
        scopeId: null,
        schemaVersion: 'v1',
        payload: {},
      })
      expect(typeof event.occurredAt).toBe('string')
    })

    it('populates optional cohorte/grupo/scopeId when provided', () => {
      const event = buildTallerEvent(
        makeInput({
          cohorteId: '00000000-0000-0000-0000-000000000004',
          grupoId: '00000000-0000-0000-0000-000000000005',
          scopeType: 'grupo',
          scopeId: '00000000-0000-0000-0000-000000000005',
        }),
      )
      expect(event.cohorteId).toBe('00000000-0000-0000-0000-000000000004')
      expect(event.grupoId).toBe('00000000-0000-0000-0000-000000000005')
      expect(event.scopeType).toBe('grupo')
      expect(event.scopeId).toBe('00000000-0000-0000-0000-000000000005')
    })

    it('throws TallerEventSensitiveDataError when payload has cedula', () => {
      expect(() =>
        buildTallerEvent(makeInput({ payload: { cedula: '123' } })),
      ).toThrow(new TallerEventSensitiveDataError(['cedula']))
    })

    it('throws when payload has telefono', () => {
      expect(() =>
        buildTallerEvent(makeInput({ payload: { telefono: '+54911223344' } })),
      ).toThrow(new TallerEventSensitiveDataError(['telefono']))
    })

    it('throws when payload has email', () => {
      expect(() =>
        buildTallerEvent(makeInput({ payload: { email: 'a@b.com' } })),
      ).toThrow(new TallerEventSensitiveDataError(['email']))
    })

    it('throws when payload has notas_privadas', () => {
      expect(() =>
        buildTallerEvent(makeInput({ payload: { notas_privadas: 'secret' } })),
      ).toThrow(new TallerEventSensitiveDataError(['notas_privadas']))
    })

    it('throws when payload has contact_data', () => {
      expect(() =>
        buildTallerEvent(makeInput({ payload: { contact_data: { x: 1 } } })),
      ).toThrow(new TallerEventSensitiveDataError(['contact_data']))
    })

    it('lists ALL detected fields when multiple are present', () => {
      expect(() =>
        buildTallerEvent(
          makeInput({ payload: { cedula: '1', telefono: '2', email: '3' } }),
        ),
      ).toThrow(new TallerEventSensitiveDataError(['cedula', 'telefono', 'email']))
    })

    it('does not embed PII in the returned event payload (defense in depth)', () => {
      const event = buildTallerEvent(
        makeInput({ payload: { nota: 'safe note', reason: 'attended' } }),
      )
      expect(event.payload).toEqual({ nota: 'safe note', reason: 'attended' })
      expect(event.payload).not.toHaveProperty('cedula')
      expect(event.payload).not.toHaveProperty('email')
    })
  })

  describe('filterSensitivePayload', () => {
    it('returns empty object for undefined input', () => {
      expect(filterSensitivePayload(undefined)).toEqual({})
    })

    it('strips sensitive keys from a payload', () => {
      const out = filterSensitivePayload({
        cedula: '1',
        telefono: '2',
        email: '3',
        safe: 'keep',
        reason: 'attended',
      })
      expect(out).toEqual({ safe: 'keep', reason: 'attended' })
    })
  })

  describe('detectSensitiveFields', () => {
    it('returns empty list for safe payload', () => {
      expect(detectSensitiveFields({ safe: 'x' })).toEqual([])
    })

    it('returns detected keys for unsafe payload', () => {
      expect(detectSensitiveFields({ cedula: '1', safe: 'x' })).toEqual(['cedula'])
      expect(detectSensitiveFields({ email: '1', telefono: '2' })).toEqual([
        'email',
        'telefono',
      ])
    })
  })

  describe('isTallerKind', () => {
    it('narrows correctly for canonical kinds', () => {
      for (const kind of TALLER_EVENT_KINDS) {
        expect(isTallerKind(kind)).toBe(true)
        const _narrowed: 'taller_cohort_started' | 'taller_session_attended' | 'taller_session_missed' | 'taller_completion_recorded' | 'taller_completion_failed' =
          kind
        expect(_narrowed).toBe(kind)
      }
    })

    it('rejects non-canonical kinds', () => {
      expect(isTallerKind('attendance')).toBe(false)
      expect(isTallerKind('foobar')).toBe(false)
      expect(isTallerKind('')).toBe(false)
    })
  })
})

describe('Talleres ledger writer (DT-035)', () => {
  describe('writeTallerEventToLedger', () => {
    const safeEvent: TallerEvent = {
      kind: 'taller_cohort_started',
      tallerId: '00000000-0000-0000-0000-000000000003',
      cohorteId: null,
      grupoId: null,
      personaId: '00000000-0000-0000-0000-000000000001',
      actorPersonaId: '00000000-0000-0000-0000-000000000002',
      scopeType: 'taller',
      scopeId: null,
      schemaVersion: 'v1',
      payload: { reason: 'cohort kickoff' },
      occurredAt: '2026-01-01T00:00:00.000Z',
    }

    it('invokes the ledger with the right kind', async () => {
      const { repo, calls } = fakeLedger()
      await writeTallerEventToLedger(safeEvent, repo)
      expect(calls).toHaveLength(1)
      const call = calls[0] as { readonly kind: string; readonly subject_id: string }
      expect(call.kind).toBe('taller_cohort_started')
      expect(call.subject_id).toBe('00000000-0000-0000-0000-000000000001')
    })

    it('forwards taller_id / cohorte_id / grupo_id / scope_type in metadata', async () => {
      const { repo, calls } = fakeLedger()
      await writeTallerEventToLedger(safeEvent, repo)
      const call = calls[0] as { readonly metadata: Record<string, unknown> }
      expect(call.metadata).toMatchObject({
        taller_id: '00000000-0000-0000-0000-000000000003',
        scope_type: 'taller',
        schema_version: 'v1',
        reason: 'cohort kickoff',
      })
    })

    it('rejects sensitive payloads with TallerWriterSensitiveDataError', async () => {
      const { repo, calls } = fakeLedger()
      const tainted: TallerEvent = {
        ...safeEvent,
        payload: { ...safeEvent.payload, cedula: '123' },
      }
      await expect(writeTallerEventToLedger(tainted, repo)).rejects.toMatchObject({
        code: 'TALLER_WRITER_SENSITIVE_DATA',
        eventKind: 'taller_cohort_started',
        detectedFields: ['cedula'],
      })
      expect(calls).toHaveLength(0)
    })

    it('the 11 F3 kinds are NOT in TALLER_EVENT_KINDS (writer does not emit F3 originals)', () => {
      expect(TALLER_EVENT_KINDS).not.toContain('attendance')
      expect(TALLER_EVENT_KINDS).not.toContain('registration')
      expect(TALLER_EVENT_KINDS).not.toContain('visitor_capture')
    })

    it('tallerWriterSensitiveDataError includes eventKind and detected fields', () => {
      const err = tallerWriterSensitiveDataError(['email'], 'taller_session_attended')
      expect(err.code).toBe('TALLER_WRITER_SENSITIVE_DATA')
      expect(err.eventKind).toBe('taller_session_attended')
      expect(err.detectedFields).toEqual(['email'])
    })
  })

  describe('flushPendingTallerEventosToOutbox', () => {
    function fakeSupabase(rows: Array<Record<string, unknown>>): {
      readonly selectCalls: number
      readonly insertCalls: number
      readonly updateCalls: number
      readonly updatedIds: string[]
      readonly insertedPayloads: Array<Record<string, unknown>>
      readonly returnedRows: Array<Record<string, unknown>>
      readonly client: unknown
    } {
      const state = {
        selectCalls: 0,
        insertCalls: 0,
        updateCalls: 0,
        updatedIds: [] as string[],
        insertedPayloads: [] as Array<Record<string, unknown>>,
        returnedRows: rows,
      }
      const client = {
        from(table: string) {
          return {
            select() {
              state.selectCalls += 1
              return {
                eq() {
                  return {
                    order() {
                      return {
                        async then(
                          resolve: (r: { data: Array<Record<string, unknown>>; error: null }) => void,
                        ): Promise<void> {
                          if (table !== 'taller_eventos') {
                            resolve({ data: [], error: null })
                            return Promise.resolve()
                          }
                          resolve({ data: state.returnedRows, error: null })
                          return Promise.resolve()
                        },
                      }
                    },
                  }
                },
              }
            },
            insert(payload: Record<string, unknown>) {
              state.insertCalls += 1
              state.insertedPayloads.push(payload)
              return {
                select() {
                  return {
                    async single(): Promise<{ data: Record<string, unknown>; error: null }> {
                      return { data: { id: 'fake-inserted-id', ...payload }, error: null }
                    },
                  }
                },
              }
            },
            update(_patch: Record<string, unknown>) {
              state.updateCalls += 1
              return {
                eq(column: string, value: unknown) {
                  if (column === 'id' && typeof value === 'string') {
                    state.updatedIds.push(value)
                  }
                  return {
                    async then(
                      resolve: (r: { error: null }) => void,
                    ): Promise<void> {
                      resolve({ error: null })
                      return Promise.resolve()
                    },
                  }
                },
              }
            },
          }
        },
      }
      return Object.assign(state, { client })
    }

    it('returns the count of drained rows', async () => {
      const { client } = fakeSupabase([])
      const result = await flushPendingTallerEventosToOutbox(client as unknown as Parameters<typeof flushPendingTallerEventosToOutbox>[0])
      expect(result).toBe(0)
    })

    it('drains pending rows and flips emitted_to_outbox', async () => {
      const rows = [
        {
          id: 'row-1',
          taller_id: '00000000-0000-0000-0000-000000000003',
          cohorte_id: null,
          grupo_id: null,
          persona_id: '00000000-0000-0000-0000-000000000001',
          actor_persona_id: '00000000-0000-0000-0000-000000000002',
          schema_version: 'v1',
          payload: { kind: 'taller_cohort_started', scope_type: 'taller', scope_id: null, reason: 'kickoff' },
          occurred_at: '2026-01-01T00:00:00.000Z',
          emitted_to_outbox: false,
        },
      ]
      const fake = fakeSupabase(rows)
      const drained = await flushPendingTallerEventosToOutbox(
        fake.client as unknown as Parameters<typeof flushPendingTallerEventosToOutbox>[0],
      )
      expect(drained).toBe(1)
      expect(fake.insertCalls).toBe(1)
      expect(fake.updateCalls).toBe(1)
      expect(fake.updatedIds).toEqual(['row-1'])
      expect(fake.insertedPayloads[0]?.kind).toBe('taller_cohort_started')
    })

    it('skips rows whose payload contains sensitive fields and marks them emitted', async () => {
      const rows = [
        {
          id: 'row-bad',
          taller_id: '00000000-0000-0000-0000-000000000003',
          cohorte_id: null,
          grupo_id: null,
          persona_id: '00000000-0000-0000-0000-000000000001',
          actor_persona_id: '00000000-0000-0000-0000-000000000002',
          schema_version: 'v1',
          payload: {
            kind: 'taller_session_attended',
            scope_type: 'taller',
            scope_id: null,
            cedula: '12345',
          },
          occurred_at: '2026-01-01T00:00:00.000Z',
          emitted_to_outbox: false,
        },
      ]
      const fake = fakeSupabase(rows)
      const detailed = await flushPendingTallerEventosToOutboxDetailed(
        fake.client as unknown as Parameters<typeof flushPendingTallerEventosToOutboxDetailed>[0],
      )
      expect(detailed).toEqual({ drained: 0, skipped: 1 })
      expect(fake.insertCalls).toBe(0) // never reaches the ledger
      expect(fake.updateCalls).toBe(1)
      expect(fake.updatedIds).toEqual(['row-bad'])
    })
  })
})
