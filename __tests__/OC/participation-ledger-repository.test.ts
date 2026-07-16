/**
 * S07 RED — participation ledger repository
 * Verifies ParticipationLedgerRepository interface contract via mocked Supabase client.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ParticipationLedgerRepository } from '@/lib/platform/operating-core/participation-ledger-repository'
import { createSupabaseParticipationLedgerRepository } from '@/lib/platform/operating-core/participation-ledger-repository-supabase'

// ─── Mock factory ─────────────────────────────────────────────────────────────

function createMockSupabaseClient() {
  const fromMock = jest.fn()
  const client = { from: fromMock } as unknown as jest.Mocked<SupabaseClient>
  return { client, fromMock }
}

function sampleRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    kind: 'attendance',
    subject_id: 'subject-1',
    occurred_at: '2026-07-16T10:00:00Z',
    actor_persona_id: 'actor-1',
    capture_source: 'form',
    experience: 'grupos_vida',
    event_id: null,
    service_id: null,
    event_instance_id: null,
    corrects_event_id: null,
    status: 'recorded',
    metadata: {},
    created_at: '2026-07-16T10:00:00Z',
    ...overrides,
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ParticipationLedgerRepository', () => {
  describe('append', () => {
    it('should insert a row and return the created event', async () => {
      const { client, fromMock } = createMockSupabaseClient()
      const row = sampleRow()

      fromMock.mockReturnValue({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: row, error: null }),
          }),
        }),
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: row, error: null }),
          }),
        }),
      })

      const repo: ParticipationLedgerRepository = createSupabaseParticipationLedgerRepository(client)

      const result = await repo.append({
        kind: 'attendance',
        subjectId: 'subject-1',
        actorPersonaId: 'actor-1',
        captureSource: 'form',
        experience: 'grupos_vida',
      })

      expect(result.id).toBe(row.id)
      expect(result.kind).toBe('attendance')
      expect(result.subjectId).toBe('subject-1')
      expect(fromMock).toHaveBeenCalledWith('operating_core_participation_eventos')
    })

    it('should include corrects_event_id when provided', async () => {
      const { client, fromMock } = createMockSupabaseClient()
      const row = sampleRow({ corrects_event_id: 'original-id' })

      let capturedInsert: Record<string, unknown> = {}
      fromMock.mockReturnValue({
        insert: jest.fn().mockImplementation((data: Record<string, unknown>) => {
          capturedInsert = data
          return {
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: row, error: null }),
            }),
          }
        }),
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: row, error: null }),
          }),
        }),
      })

      const repo: ParticipationLedgerRepository = createSupabaseParticipationLedgerRepository(client)

      const result = await repo.append({
        kind: 'attendance_update',
        subjectId: 'subject-1',
        actorPersonaId: 'actor-1',
        captureSource: 'form',
        experience: 'grupos_vida',
        correctsEventId: 'original-id',
      })

      expect(capturedInsert['corrects_event_id']).toBe('original-id')
      expect(result.correctsEventId).toBe('original-id')
    })

    it('should throw when insert returns an error', async () => {
      const { client, fromMock } = createMockSupabaseClient()

      fromMock.mockReturnValue({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: null, error: { message: 'insert failed' } }),
          }),
        }),
        select: jest.fn(),
      })

      const repo: ParticipationLedgerRepository = createSupabaseParticipationLedgerRepository(client)

      await expect(
        repo.append({
          kind: 'attendance',
          subjectId: 'subject-1',
          actorPersonaId: 'actor-1',
          captureSource: 'form',
          experience: 'grupos_vida',
        }),
      ).rejects.toThrow('insert failed')
    })
  })

  describe('listBySubject', () => {
    it('should return events for the given subject', async () => {
      const { client, fromMock } = createMockSupabaseClient()
      const rows = [
        sampleRow({ id: '1', kind: 'attendance' }),
        sampleRow({ id: '2', kind: 'check_in' }),
      ]

      // For listBySubject, select().eq() returns an array (no .single())
      fromMock.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ data: rows, error: null }),
        }),
        insert: jest.fn(),
      })

      const repo: ParticipationLedgerRepository = createSupabaseParticipationLedgerRepository(client)

      const result = await repo.listBySubject('subject-1')

      expect(result).toHaveLength(2)
      expect(result[0].id).toBe('1')
      expect(result[1].id).toBe('2')
    })

    it('should return empty array when no events exist', async () => {
      const { client, fromMock } = createMockSupabaseClient()

      fromMock.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ data: [], error: null }),
        }),
        insert: jest.fn(),
      })

      const repo: ParticipationLedgerRepository = createSupabaseParticipationLedgerRepository(client)

      const result = await repo.listBySubject('subject-1')

      expect(result).toHaveLength(0)
    })

    it('should apply kind filter when provided as single value', async () => {
      const { client, fromMock } = createMockSupabaseClient()
      const rows = [sampleRow({ kind: 'attendance' })]

      const capturedEqCalls: string[] = []
      fromMock.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockImplementation((col: string) => {
            capturedEqCalls.push(col)
            return {
              in: jest.fn().mockResolvedValue({ data: rows, error: null }),
            }
          }),
        }),
        insert: jest.fn(),
      })

      const repo: ParticipationLedgerRepository = createSupabaseParticipationLedgerRepository(client)

      await repo.listBySubject('subject-1', { kind: 'attendance' })

      expect(capturedEqCalls).toContain('subject_id')
    })
  })

  describe('findById', () => {
    it('should return null when no row is found', async () => {
      const { client, fromMock } = createMockSupabaseClient()

      fromMock.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
        insert: jest.fn(),
      })

      const repo: ParticipationLedgerRepository = createSupabaseParticipationLedgerRepository(client)

      const result = await repo.findById('non-existent')

      expect(result).toBeNull()
    })

    it('should return the event when found', async () => {
      const { client, fromMock } = createMockSupabaseClient()
      const row = sampleRow()

      fromMock.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: row, error: null }),
          }),
        }),
        insert: jest.fn(),
      })

      const repo: ParticipationLedgerRepository = createSupabaseParticipationLedgerRepository(client)

      const result = await repo.findById(row.id)

      expect(result).not.toBeNull()
      expect(result!.id).toBe(row.id)
    })
  })

  describe('correct', () => {
    it('should append a new row with corrects_event_id set to the original id', async () => {
      const { client, fromMock } = createMockSupabaseClient()
      const originalRow = sampleRow({ id: 'original-id', status: 'recorded' })
      const correctedRow = sampleRow({
        id: 'corrected-id',
        status: 'corrected',
        corrects_event_id: 'original-id',
        kind: 'attendance_update',
      })

      let insertData: Record<string, unknown> = {}
      // First call: findById → select().eq().single()
      // Second call: append → insert().select().single()
      fromMock
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: originalRow, error: null }),
            }),
          }),
          insert: jest.fn(),
        })
        .mockReturnValueOnce({
          select: jest.fn(),
          insert: jest.fn().mockImplementation((data: Record<string, unknown>) => {
            insertData = data
            return {
              select: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({ data: correctedRow, error: null }),
              }),
            }
          }),
        })

      const repo: ParticipationLedgerRepository = createSupabaseParticipationLedgerRepository(client)

      const result = await repo.correct('original-id', {
        kind: 'attendance_update',
        subjectId: 'subject-1',
        actorPersonaId: 'actor-1',
        captureSource: 'manual',
        experience: 'grupos_vida',
        metadata: { reason: 'initial attendance was wrong' },
      })

      expect(result.correctsEventId).toBe('original-id')
      expect(result.status).toBe('corrected')
      expect(insertData['corrects_event_id']).toBe('original-id')
    })

    it('should throw if the original event is not found', async () => {
      const { client, fromMock } = createMockSupabaseClient()

      fromMock.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
        insert: jest.fn(),
      })

      const repo: ParticipationLedgerRepository = createSupabaseParticipationLedgerRepository(client)

      await expect(
        repo.correct('non-existent', {
          kind: 'attendance_update',
          subjectId: 'subject-1',
          actorPersonaId: 'actor-1',
          captureSource: 'manual',
          experience: 'grupos_vida',
        }),
      ).rejects.toThrow('not found')
    })
  })
})
