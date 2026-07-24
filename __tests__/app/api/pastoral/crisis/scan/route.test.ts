/**
 * @jest-environment node
 *
 * W09 — DT-055 — HTTP tests for pastoral crisis scan endpoint.
 * F(api/pastoral/crisis/scan) — POST /api/pastoral/crisis/scan
 *
 * This is an internal endpoint (service_role only, no capability check).
 */

import { NextRequest } from 'next/server'
import { POST } from '../../../../../../app/api/pastoral/crisis/scan/route'

// ─── Mocks ────────────────────────────────────────────────────────────────────

const ONE_ON_ONE_ID = '11111111-1111-1111-1111-111111111111'
const MENTOR_ID = '22222222-2222-2222-2222-222222222222'

const mockOooRecord = {
  id: ONE_ON_ONE_ID,
  resumen: 'El participante menciona que self-harm',
  mentor_oficial_persona_id: MENTOR_ID,
}

// Create a mock ledger repository for the pastoral writer
function createMockLedgerRepository() {
  return {
    append: jest.fn().mockResolvedValue({
      id: 'ledger-entry-id',
      kind: 'pastoral_crisis_detected',
      subjectId: ONE_ON_ONE_ID,
      occurredAt: new Date().toISOString(),
      actorPersonaId: MENTOR_ID,
      captureSource: 'pastoral_crisis_scan',
      experience: 'pastoral',
      eventId: null,
      serviceId: null,
      eventInstanceId: null,
      correctsEventId: null,
      status: 'recorded',
      metadata: {},
      createdAt: new Date().toISOString(),
    }),
    listBySubject: jest.fn().mockResolvedValue([]),
    findById: jest.fn().mockResolvedValue(null),
    correct: jest.fn().mockResolvedValue({} as any),
  }
}

// Mock the participation ledger repository factory
jest.mock(
  '@/lib/platform/operating-core/participation-ledger-repository-supabase',
  () => ({
    createSupabaseParticipationLedgerRepository: jest.fn((_supabase: unknown) =>
      createMockLedgerRepository(),
    ),
  }),
)

// Mock the pastoral ledger writer factory
jest.mock('@/lib/platform/pastoral/participation-ledger-pastoral-writer', () => ({
  createPastoralLedgerWriter: jest.fn((repository: unknown) => ({
    emitPastoralEvent: repository ? (repository as any).append : jest.fn(),
    emit: repository ? (repository as any).append : jest.fn(),
  })),
}))

function createMockClient(overrides?: {
  oooRecord?: typeof mockOooRecord | null
  notas?: Array<{ id: string; contenido: string }>
}) {
  const oooRecord = overrides?.oooRecord ?? mockOooRecord
  const notas = overrides?.notas ?? []

  return {
    auth: {
      getUser: jest
        .fn()
        .mockResolvedValue({ data: { user: { id: 'service-user' } }, error: null }),
    },
    from(table: string) {
      if (table === 'pastoral_one_on_one') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: jest
                .fn()
                .mockReturnValue(
                  Promise.resolve({ data: oooRecord, error: null }),
                ),
            }),
          }),
        }
      }
      if (table === 'pastoral_one_on_one_notas') {
        return {
          select: () => ({
            eq: jest.fn().mockResolvedValue({
              data: notas,
              error: null,
            }),
          }),
        }
      }
      return {
        insert: jest.fn().mockResolvedValue({ error: null }),
      }
    },
  }
}

jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: jest.fn(),
}))

const createClient = jest.requireMock('@/lib/supabase/server')
  .createSupabaseServerClient as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  createClient.mockResolvedValue(createMockClient())
})

// ─── Helpers ───────────────────────────────────────────────────────────────

function request(body: unknown) {
  return new NextRequest(
    new URL('http://localhost/api/pastoral/crisis/scan'),
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  )
}

// ─── Tests ───────────────────────────────────────────────────────────────

describe('POST /api/pastoral/crisis/scan', () => {
  describe('input validation', () => {
    it('400 when one_on_one_id is missing', async () => {
      const res = await POST(request({}))
      expect(res.status).toBe(400)
      const json = await res.json()
      expect(json.error).toContain('one_on_one_id')
    })

    it('400 when one_on_one_id is empty string', async () => {
      const res = await POST(request({ one_on_one_id: '  ' }))
      expect(res.status).toBe(400)
    })

    it('400 when one_on_one_id is not a valid UUID', async () => {
      const res = await POST(request({ one_on_one_id: 'not-a-uuid' }))
      expect(res.status).toBe(400)
      const json = await res.json()
      expect(json.error).toContain('UUID')
    })

    it('400 when body is missing', async () => {
      const req = new NextRequest(
        new URL('http://localhost/api/pastoral/crisis/scan'),
        { method: 'POST' },
      )
      const res = await POST(req)
      expect(res.status).toBe(400)
    })
  })

  // Note: 404 branch is covered by service-level tests where the supabase
  // client is mocked directly with null records. The route only does a
  // straightforward null-check on the fetched record.

  describe('200 — crisis detected', () => {
    it('returns crisis scan result', async () => {
      const res = await POST(request({ one_on_one_id: ONE_ON_ONE_ID }))
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json).toMatchObject({
        crisisDetected: true,
      })
    })

    it('includes scannedAt timestamp', async () => {
      const res = await POST(request({ one_on_one_id: ONE_ON_ONE_ID }))
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.scannedAt).toBeDefined()
      expect(typeof json.scannedAt).toBe('string')
    })
  })

  describe('200 — no crisis detected', () => {
    it('returns null when no keywords match', async () => {
      createClient.mockResolvedValue(
        createMockClient({
          oooRecord: {
            id: ONE_ON_ONE_ID,
            resumen: 'Sesión muy normal y productiva',
            mentor_oficial_persona_id: MENTOR_ID,
          },
        }),
      )
      const res = await POST(request({ one_on_one_id: ONE_ON_ONE_ID }))
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json).toBeNull()
    })
  })
})
