/**
 * @jest-environment node
 *
 * PR C (Fase 5 GdV-parity) — Tests for the temporadas server actions.
 *
 * Covers the three co-located actions that drive the global-season admin UI:
 *   - createTemporada          (insert → talleres_temporadas)
 *   - toggleTallerInTemporada  (insert/delete → talleres_temporada_talleres)
 *   - transitionTemporada      (guarded update on talleres_temporadas.estado)
 *
 * For each: kill switch → not-found, no user → unauthorized, missing write
 * capability → forbidden, happy path → ok. Plus action-specific validation
 * (slug pattern / reserved 'legacy' / fecha ordering / 23505 dup) and the
 * guarded-transition state machine.
 *
 * The Supabase client is a capturing fluent-builder stub (no live DB): every
 * chained call is recorded so assertions can inspect table + payload + filters.
 */

import {
  createTemporada,
  toggleTallerInTemporada,
  transitionTemporada,
} from '@/app/(auth)/admin/talleres/temporadas/actions'

jest.mock('@/lib/platform/talleres/flags', () => ({
  isTalleresEnabled: jest.fn(() => true),
}))

jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: jest.fn(),
}))

jest.mock('@/lib/auth/platformSessionReadOnly', () => ({
  findPlatformSessionPersonaByAuthId: jest.fn(),
  resolveReadOnlyPlatformSession: jest.fn(),
}))

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}))

const flagsMock = jest.requireMock('@/lib/platform/talleres/flags')
  .isTalleresEnabled as jest.Mock
const createSupabaseServerClientMock = jest.requireMock('@/lib/supabase/server')
  .createSupabaseServerClient as jest.Mock
const findPersonaByAuthIdMock = jest.requireMock(
  '@/lib/auth/platformSessionReadOnly',
).findPlatformSessionPersonaByAuthId as jest.Mock
const resolveSessionMock = jest.requireMock(
  '@/lib/auth/platformSessionReadOnly',
).resolveReadOnlyPlatformSession as jest.Mock

// ─── Capturing fluent-builder stub ─────────────────────────────────────────

interface CapturedOp {
  table: string
  kind: 'insert' | 'update' | 'delete' | 'select'
  payload?: unknown
  filters: Record<string, unknown>
}

const ops: CapturedOp[] = []
let terminalResponse: { data: unknown; error: unknown } = { data: null, error: null }

function makeBuilder(table: string, kind: CapturedOp['kind'], payload?: unknown) {
  const op: CapturedOp = { table, kind, payload, filters: {} }
  ops.push(op)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test stub
  const builder: any = {
    select: () => builder,
    eq: (col: string, val: unknown) => {
      op.filters[col] = val
      return builder
    },
    in: (col: string, vals: unknown) => {
      op.filters[`${col}__in`] = vals
      return builder
    },
    order: () => builder,
    limit: () => builder,
    single: () => Promise.resolve(terminalResponse),
    maybeSingle: () => Promise.resolve(terminalResponse),
    // Thenable: `await client.from(x).insert(y)` / `.delete().eq().eq()`
    // resolves to the terminal response without a .single() call.
    then: (resolve: (v: unknown) => unknown) => resolve(terminalResponse),
  }
  return builder
}

function setupMock(opts: {
  isEnabled?: boolean
  user?: { id: string } | null
  personaId?: string | null
  capabilities?: string[]
  response?: { data: unknown; error: unknown }
}) {
  flagsMock.mockReset().mockReturnValue(opts.isEnabled ?? true)
  findPersonaByAuthIdMock.mockReset().mockImplementation(() =>
    Promise.resolve(
      opts.personaId
        ? { id: opts.personaId, authId: 'auth-1', globalRoles: [] }
        : null,
    ),
  )
  resolveSessionMock.mockReset().mockResolvedValue(
    opts.personaId
      ? {
          personaId: opts.personaId,
          subjectAuthId: 'auth-1',
          globalRoles: [],
          contexts: [],
          capabilities: (opts.capabilities ?? []).map((key) => ({
            key,
            experience: 'talleres_crecimiento',
            scopeType: 'taller',
            source: 'test',
          })),
        }
      : null,
  )
  terminalResponse = opts.response ?? { data: { id: 'temp-1' }, error: null }
  createSupabaseServerClientMock.mockReset().mockResolvedValue({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: opts.user === undefined ? { id: 'auth-1' } : opts.user },
        error: null,
      }),
    },
    from: (table: string) => ({
      insert: (payload: unknown) => makeBuilder(table, 'insert', payload),
      update: (payload: unknown) => makeBuilder(table, 'update', payload),
      delete: () => makeBuilder(table, 'delete'),
      select: () => makeBuilder(table, 'select'),
    }),
  })
}

const WRITE_CAP = ['talleres_crecimiento.director.write']

const validCreate = {
  nombre: 'Temporada Otoño 2026',
  slug: 'otono-2026',
  descripcion: 'Talleres de otoño',
  fecha_apertura: '2026-09-01T00:00:00.000Z',
  fecha_cierre: '2026-12-15T00:00:00.000Z',
}

beforeEach(() => {
  ops.length = 0
})

// ─── createTemporada ────────────────────────────────────────────────────────

describe('createTemporada — gates', () => {
  it('returns not-found when the feature flag is off', async () => {
    setupMock({ isEnabled: false })
    const result = await createTemporada(validCreate)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('not-found')
  })

  it('returns unauthorized when no user is signed in', async () => {
    setupMock({ user: null })
    const result = await createTemporada(validCreate)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('unauthorized')
  })

  it('returns forbidden when neither director.write nor admin.manage is held', async () => {
    setupMock({
      personaId: 'p-1',
      capabilities: ['talleres_crecimiento.participation.read'],
    })
    const result = await createTemporada(validCreate)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('forbidden')
  })

  it('passes with admin.manage (write superset)', async () => {
    setupMock({
      personaId: 'p-1',
      capabilities: ['talleres_crecimiento.admin.manage'],
    })
    const result = await createTemporada(validCreate)
    expect(result.ok).toBe(true)
  })
})

describe('createTemporada — validation', () => {
  beforeEach(() => {
    setupMock({ personaId: 'p-1', capabilities: WRITE_CAP })
  })

  it('rejects a too-short nombre', async () => {
    const result = await createTemporada({ ...validCreate, nombre: 'x' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid-input')
  })

  it('rejects the reserved slug "legacy"', async () => {
    const result = await createTemporada({ ...validCreate, slug: 'legacy' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid-input')
  })

  it('rejects a slug with invalid characters', async () => {
    const result = await createTemporada({ ...validCreate, slug: 'Otoño 2026' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid-input')
  })

  it('rejects fecha_cierre <= fecha_apertura', async () => {
    const result = await createTemporada({
      ...validCreate,
      fecha_apertura: '2026-12-15T00:00:00.000Z',
      fecha_cierre: '2026-09-01T00:00:00.000Z',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid-input')
  })
})

describe('createTemporada — happy path', () => {
  it('inserts into talleres_temporadas with estado=borrador and returns the id', async () => {
    setupMock({
      personaId: 'p-1',
      capabilities: WRITE_CAP,
      response: { data: { id: 'temp-99' }, error: null },
    })
    const result = await createTemporada(validCreate)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.temporadaId).toBe('temp-99')
    const insert = ops.find((o) => o.kind === 'insert')
    expect(insert?.table).toBe('talleres_temporadas')
    expect((insert?.payload as Record<string, unknown>)?.estado).toBe('borrador')
    expect((insert?.payload as Record<string, unknown>)?.slug).toBe('otono-2026')
  })

  it('maps a 23505 unique violation to invalid-input (duplicate slug)', async () => {
    setupMock({
      personaId: 'p-1',
      capabilities: WRITE_CAP,
      response: { data: null, error: { code: '23505', message: 'duplicate key' } },
    })
    const result = await createTemporada(validCreate)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid-input')
  })
})

// ─── toggleTallerInTemporada ─────────────────────────────────────────────────

describe('toggleTallerInTemporada', () => {
  it('returns forbidden without a write capability', async () => {
    setupMock({
      personaId: 'p-1',
      capabilities: ['talleres_crecimiento.coordinator.read'],
    })
    const result = await toggleTallerInTemporada({
      temporadaId: 'temp-1',
      tallerId: 't-1',
      on: true,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('forbidden')
  })

  it('on=true inserts the junction row (talleres_temporada_talleres)', async () => {
    setupMock({
      personaId: 'p-1',
      capabilities: WRITE_CAP,
      response: { data: null, error: null },
    })
    const result = await toggleTallerInTemporada({
      temporadaId: 'temp-1',
      tallerId: 't-1',
      on: true,
    })
    expect(result.ok).toBe(true)
    const insert = ops.find((o) => o.kind === 'insert')
    expect(insert?.table).toBe('talleres_temporada_talleres')
    expect((insert?.payload as Record<string, unknown>)?.temporada_id).toBe('temp-1')
    expect((insert?.payload as Record<string, unknown>)?.taller_id).toBe('t-1')
  })

  it('on=true tolerates a 23505 duplicate (already linked)', async () => {
    setupMock({
      personaId: 'p-1',
      capabilities: WRITE_CAP,
      response: { data: null, error: { code: '23505', message: 'dup' } },
    })
    const result = await toggleTallerInTemporada({
      temporadaId: 'temp-1',
      tallerId: 't-1',
      on: true,
    })
    expect(result.ok).toBe(true)
  })

  it('on=false deletes the junction row filtered by both ids', async () => {
    setupMock({
      personaId: 'p-1',
      capabilities: WRITE_CAP,
      response: { data: null, error: null },
    })
    const result = await toggleTallerInTemporada({
      temporadaId: 'temp-1',
      tallerId: 't-1',
      on: false,
    })
    expect(result.ok).toBe(true)
    const del = ops.find((o) => o.kind === 'delete')
    expect(del?.table).toBe('talleres_temporada_talleres')
    expect(del?.filters['temporada_id']).toBe('temp-1')
    expect(del?.filters['taller_id']).toBe('t-1')
  })
})

// ─── transitionTemporada ─────────────────────────────────────────────────────

describe('transitionTemporada', () => {
  it('returns forbidden without a write capability', async () => {
    setupMock({
      personaId: 'p-1',
      capabilities: ['talleres_crecimiento.director.read'],
    })
    const result = await transitionTemporada({ temporadaId: 'temp-1', next: 'abierto' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('forbidden')
  })

  it('abierto: guarded update filters estado IN [borrador]', async () => {
    setupMock({
      personaId: 'p-1',
      capabilities: WRITE_CAP,
      response: { data: { id: 'temp-1' }, error: null },
    })
    const result = await transitionTemporada({ temporadaId: 'temp-1', next: 'abierto' })
    expect(result.ok).toBe(true)
    const upd = ops.find((o) => o.kind === 'update')
    expect(upd?.table).toBe('talleres_temporadas')
    expect((upd?.payload as Record<string, unknown>)?.estado).toBe('abierto')
    expect(upd?.filters['id']).toBe('temp-1')
    expect(upd?.filters['estado__in']).toEqual(['borrador'])
  })

  it('returns invalid-input when the guarded update matches no row (bad state)', async () => {
    setupMock({
      personaId: 'p-1',
      capabilities: WRITE_CAP,
      response: { data: null, error: null },
    })
    const result = await transitionTemporada({ temporadaId: 'temp-1', next: 'cerrado' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid-input')
  })

  it('cancelado allows both borrador and abierto as source states', async () => {
    setupMock({
      personaId: 'p-1',
      capabilities: WRITE_CAP,
      response: { data: { id: 'temp-1' }, error: null },
    })
    const result = await transitionTemporada({ temporadaId: 'temp-1', next: 'cancelado' })
    expect(result.ok).toBe(true)
    const upd = ops.find((o) => o.kind === 'update')
    expect(upd?.filters['estado__in']).toEqual(['borrador', 'abierto'])
  })
})
