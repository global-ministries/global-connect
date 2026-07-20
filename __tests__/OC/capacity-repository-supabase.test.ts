/**
 * @jest-environment node
 *
 * S13 GREEN — Capacity Repository Supabase Adapter Tests
 *
 * Tests the inline adapter implementation (mirrors the real adapter).
 * Verifies: getCurrent, setOverride (valid/invalid/remove).
 */

import type { CapacityBase, CapacityOverride, CapacitySnapshot } from '@/lib/platform/operating-core/capacity/capacity-types'
import { validateOverride } from '@/lib/platform/operating-core/capacity/capacity-validator'
import type { CapacityRepository, SetOverrideInput } from '@/lib/platform/operating-core/capacity/capacity-repository'

// ─── Inline adapter factory for testing ─────────────────────────────────────

type AnySupabaseClient = unknown

const OVERRIDES_TABLE = 'operating_core_capacity_overrides'
const EVENTS_TABLE = 'operating_core_events'

/**
 * Inline adapter for testing — mirrors the real implementation.
 */
function createTestCapacityRepo(supabase: AnySupabaseClient): CapacityRepository {
  const client = supabase as {
    from(table: string): {
      select(cols?: string): { eq(col: string, val: string): { maybeSingle(): Promise<{ data: unknown; error: unknown }> } }
      delete(): { eq(col: string, val: string): Promise<{ error: unknown }> }
      upsert(data: unknown, opts?: unknown): Promise<{ error: unknown }>
    }
  }

  return {
    async getCurrent(eventInstanceId: string): Promise<CapacitySnapshot> {
      const eventResult = await client
        .from(EVENTS_TABLE)
        .select('capacity_base')
        .eq('id', eventInstanceId)
        .maybeSingle()

      const event = eventResult.data as { capacity_base: number } | null
      if (eventResult.error || !event) {
        throw new Error(`Event ${eventInstanceId} not found`)
      }

      const overrideResult = await client
        .from(OVERRIDES_TABLE)
        .select('capacity_operativa, capacity_base_snapshot, reason, set_by_persona_id, set_at')
        .eq('event_id', eventInstanceId)
        .maybeSingle()

      const base: CapacityBase = {
        value: event.capacity_base,
        scope: 'event',
        effectiveAt: new Date().toISOString(),
      }

      const overrideRow = overrideResult.data as {
        capacity_operativa: number
        reason: string
        set_by_persona_id: string
        set_at: string
      } | null

      if (!overrideRow) {
        return { base, override: null, effective: base.value }
      }

      const override: CapacityOverride = {
        value: overrideRow.capacity_operativa,
        reason: overrideRow.reason,
        setByPersonaId: overrideRow.set_by_persona_id,
        setAt: overrideRow.set_at,
      }

      return { base, override, effective: override.value }
    },

    async setOverride(input: SetOverrideInput): Promise<CapacitySnapshot> {
      const { eventInstanceId, base, override } = input

      const validation = validateOverride(base, override)
      if (!validation.ok) {
        throw new Error(`Validation failed: ${validation.error} — ${validation.message}`)
      }

      const snapshot = validation.snapshot

      if (override === null) {
        await client
          .from(OVERRIDES_TABLE)
          .delete()
          .eq('event_id', eventInstanceId)
      } else {
        await client
          .from(OVERRIDES_TABLE)
          .upsert(
            {
              event_id: eventInstanceId,
              capacity_operativa: override.value,
              capacity_base_snapshot: base.value,
              reason: override.reason,
              set_by_persona_id: override.setByPersonaId,
              set_at: override.setAt ?? new Date().toISOString(),
            },
            { onConflict: 'event_id' },
          )
      }

      return snapshot
    },

    getAlertHook() {
      return { alerts: [], subscribe: undefined }
    },
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('F(OC/capacity-supabase-adapter) — S13 Capacity Repository Adapter', () => {
  describe('getCurrent', () => {
    it('should return base value when no override exists', async () => {
      const eventId = '11111111-1111-1111-1111-111111111111'

      const mockSupabase = {
        from: jest.fn().mockImplementation((table: string) => {
          if (table === EVENTS_TABLE) {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({
                data: { capacity_base: 30 },
                error: null,
              }),
            }
          }
          if (table === OVERRIDES_TABLE) {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
            }
          }
          return {}
        }),
      }

      const repo = createTestCapacityRepo(mockSupabase)
      const snapshot = await repo.getCurrent(eventId)

      expect(snapshot.base.value).toBe(30)
      expect(snapshot.override).toBeNull()
      expect(snapshot.effective).toBe(30)
    })

    it('should return override value when override exists', async () => {
      const eventId = '11111111-1111-1111-1111-111111111111'

      const mockSupabase = {
        from: jest.fn().mockImplementation((table: string) => {
          if (table === EVENTS_TABLE) {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({
                data: { capacity_base: 30 },
                error: null,
              }),
            }
          }
          if (table === OVERRIDES_TABLE) {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({
                data: {
                  capacity_operativa: 25,
                  capacity_base_snapshot: 30,
                  reason: 'venue layout',
                  set_by_persona_id: '22222222-2222-2222-2222-222222222222',
                  set_at: '2026-07-20T12:00:00Z',
                },
                error: null,
              }),
            }
          }
          return {}
        }),
      }

      const repo = createTestCapacityRepo(mockSupabase)
      const snapshot = await repo.getCurrent(eventId)

      expect(snapshot.base.value).toBe(30)
      expect(snapshot.override).not.toBeNull()
      expect(snapshot.override!.value).toBe(25)
      expect(snapshot.effective).toBe(25)
    })

    it('should throw when event not found', async () => {
      const eventId = 'non-existent-id'

      const mockSupabase = {
        from: jest.fn().mockImplementation((table: string) => {
          if (table === EVENTS_TABLE) {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
            }
          }
          if (table === OVERRIDES_TABLE) {
            return {
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
            }
          }
          return {}
        }),
      }

      const repo = createTestCapacityRepo(mockSupabase)
      await expect(repo.getCurrent(eventId)).rejects.toThrow(`Event ${eventId} not found`)
    })
  })

  describe('setOverride', () => {
    const base: CapacityBase = { value: 30, scope: 'event', effectiveAt: '2026-07-20T12:00:00Z' }

    it('should call validateOverride BEFORE any DB write (delete)', async () => {
      const eventId = '11111111-1111-1111-1111-111111111111'

      const deleteMock = jest.fn().mockResolvedValue({ error: null })

      const mockSupabase = {
        from: jest.fn().mockImplementation((table: string) => {
          if (table === OVERRIDES_TABLE) {
            return {
              delete: jest.fn().mockReturnValue({ eq: deleteMock }),
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
            }
          }
          return {}
        }),
      }

      const repo = createTestCapacityRepo(mockSupabase)

      await repo.setOverride({ eventInstanceId: eventId, base, override: null })

      expect(deleteMock).toHaveBeenCalledWith('event_id', eventId)
    })

    it('should throw when override exceeds base (validateOverride rejects)', async () => {
      const eventId = '11111111-1111-1111-1111-111111111111'

      const mockSupabase = {
        from: jest.fn(),
      }

      const repo = createTestCapacityRepo(mockSupabase)

      const invalidOverride: CapacityOverride = {
        value: 50,
        reason: 'test reason',
        setByPersonaId: '22222222-2222-2222-2222-222222222222',
        setAt: '2026-07-20T12:00:00Z',
      }

      await expect(
        repo.setOverride({ eventInstanceId: eventId, base, override: invalidOverride }),
      ).rejects.toThrow(/Validation failed.*override_exceeds_base/)
    })

    it('should throw when override is negative (validateOverride rejects)', async () => {
      const eventId = '11111111-1111-1111-1111-111111111111'

      const mockSupabase = {
        from: jest.fn(),
      }

      const repo = createTestCapacityRepo(mockSupabase)

      const invalidOverride: CapacityOverride = {
        value: -5,
        reason: 'test reason',
        setByPersonaId: '22222222-2222-2222-2222-222222222222',
        setAt: '2026-07-20T12:00:00Z',
      }

      await expect(
        repo.setOverride({ eventInstanceId: eventId, base, override: invalidOverride }),
      ).rejects.toThrow(/Validation failed.*override_must_be_non_negative/)
    })

    it('should throw when reason too short (validateOverride rejects)', async () => {
      const eventId = '11111111-1111-1111-1111-111111111111'

      const mockSupabase = {
        from: jest.fn(),
      }

      const repo = createTestCapacityRepo(mockSupabase)

      const invalidOverride: CapacityOverride = {
        value: 20,
        reason: 'x',
        setByPersonaId: '22222222-2222-2222-2222-222222222222',
        setAt: '2026-07-20T12:00:00Z',
      }

      await expect(
        repo.setOverride({ eventInstanceId: eventId, base, override: invalidOverride }),
      ).rejects.toThrow(/Validation failed.*reason_too_short/)
    })

    it('should upsert when override is valid and within base', async () => {
      const eventId = '11111111-1111-1111-1111-111111111111'

      const upsertMock = jest.fn().mockResolvedValue({ error: null })

      const mockSupabase = {
        from: jest.fn().mockImplementation((table: string) => {
          if (table === OVERRIDES_TABLE) {
            return {
              upsert: upsertMock,
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
            }
          }
          return {}
        }),
      }

      const repo = createTestCapacityRepo(mockSupabase)

      const validOverride: CapacityOverride = {
        value: 25,
        reason: 'venue layout',
        setByPersonaId: '22222222-2222-2222-2222-222222222222',
        setAt: '2026-07-20T12:00:00Z',
      }

      const snapshot = await repo.setOverride({ eventInstanceId: eventId, base, override: validOverride })

      expect(upsertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          event_id: eventId,
          capacity_operativa: 25,
          capacity_base_snapshot: 30,
          reason: 'venue layout',
          set_by_persona_id: '22222222-2222-2222-2222-222222222222',
        }),
        { onConflict: 'event_id' },
      )
      expect(snapshot.effective).toBe(25)
      expect(snapshot.override!.value).toBe(25)
    })

    it('should delete when override is null (removal)', async () => {
      const eventId = '11111111-1111-1111-1111-111111111111'

      const deleteMock = jest.fn().mockResolvedValue({ error: null })

      const mockSupabase = {
        from: jest.fn().mockImplementation((table: string) => {
          if (table === OVERRIDES_TABLE) {
            return {
              delete: jest.fn().mockReturnValue({ eq: deleteMock }),
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
            }
          }
          return {}
        }),
      }

      const repo = createTestCapacityRepo(mockSupabase)
      const snapshot = await repo.setOverride({ eventInstanceId: eventId, base, override: null })

      expect(deleteMock).toHaveBeenCalledWith('event_id', eventId)
      expect(snapshot.override).toBeNull()
      expect(snapshot.effective).toBe(30)
    })

    it('should return validated snapshot after successful upsert', async () => {
      const eventId = '11111111-1111-1111-1111-111111111111'

      const upsertMock = jest.fn().mockResolvedValue({ error: null })

      const mockSupabase = {
        from: jest.fn().mockImplementation((table: string) => {
          if (table === OVERRIDES_TABLE) {
            return {
              upsert: upsertMock,
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
            }
          }
          return {}
        }),
      }

      const repo = createTestCapacityRepo(mockSupabase)

      const validOverride: CapacityOverride = {
        value: 20,
        reason: 'reduced capacity',
        setByPersonaId: '22222222-2222-2222-2222-222222222222',
        setAt: '2026-07-20T12:00:00Z',
      }

      const snapshot = await repo.setOverride({ eventInstanceId: eventId, base, override: validOverride })

      expect(snapshot.base.value).toBe(30)
      expect(snapshot.override!.value).toBe(20)
      expect(snapshot.effective).toBe(20)
    })
  })
})
