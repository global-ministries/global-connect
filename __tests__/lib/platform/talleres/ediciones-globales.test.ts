/**
 * @jest-environment node
 *
 * PR29-D — Unit tests for `lib/platform/talleres/ediciones-globales.ts`.
 *
 * Covers:
 *   - requireEdicionesGlobalesRole: kill switch / auth / capability
 *     gate, ok on director.write or admin.manage
 *   - loadEdicionesGlobales: maps the join count and orders by
 *     fecha_apertura DESC
 *   - loadEdicionGlobalById: returns null on missing, joins
 *     participantes with edicion local
 *   - loadTalleresDisponibles: filters out talleres already in the
 *     global
 *
 * All tests mock `createSupabaseServerClient`, the flag module and
 * the session resolver. Tests do not hit the database.
 */

import {
  loadEdicionGlobalById,
  loadEdicionesGlobales,
  loadTalleresDisponibles,
  requireEdicionesGlobalesRole,
  type EdicionGlobal,
  type EdicionGlobalDetalle,
} from '@/lib/platform/talleres/ediciones-globales'

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

interface QueryLogEntry {
  readonly table: string
  readonly filters: Readonly<Record<string, unknown>>
  readonly ordering?: { column: string; ascending: boolean }
  readonly limit?: number
}

interface ChainStub {
  select: jest.Mock
  eq: jest.Mock
  order: jest.Mock
  limit: jest.Mock
  maybeSingle: jest.Mock
  in: jest.Mock
  not: jest.Mock
  /** `.update({...}).eq().eq()` etc. surface for the server actions. */
  update: jest.Mock
}

function buildClient(opts: {
  isEnabled?: boolean
  user?: { id: string } | null
  personaId?: string | null
  capabilities?: string[]
  /** Map of `table -> [data]` for the queue of `select(...)` responses. */
  tableResponses?: Record<string, unknown>
}): { client: unknown; queryLog: QueryLogEntry[] } {
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

  const queryLog: QueryLogEntry[] = []
  const tableResponses = opts.tableResponses ?? {}
  const getResponse = (table: string): unknown => {
    // Pop the next response from the table's queue (LIFO).
    const arr = (tableResponses[table] ?? []) as unknown[]
    if (arr.length === 0) return null
    return arr.shift()
  }

  // Normalize a response entry into a { data, error } shape. By default
  // raw values are treated as data (preserving the existing contract of
  // passing a plain array). Callers can opt into the full shape by
  // passing { data: ..., error: ... } directly.
  const buildQueryResult = (v: unknown): { data: unknown; error: unknown } => {
    if (
      v !== null &&
      typeof v === 'object' &&
      'data' in (v as Record<string, unknown>) &&
      'error' in (v as Record<string, unknown>)
    ) {
      return {
        data: (v as { data: unknown }).data,
        error: (v as { error: unknown }).error,
      }
    }
    return { data: v, error: null }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic stub
  const client: any = {
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: opts.user ?? { id: 'auth-1' } },
        error: null,
      }),
    },
    from: (table: string) => {
      const filters: Record<string, unknown> = {}
      let ordering: { column: string; ascending: boolean } | undefined
      let limitN: number | undefined
      const chain: ChainStub = {
        select: jest.fn().mockImplementation(() => chain),
        eq: jest.fn().mockImplementation((col: string, value: unknown) => {
          filters[col] = value
          return chain
        }),
        in: jest.fn().mockImplementation((col: string, values: unknown) => {
          filters[col] = values
          return chain
        }),
        not: jest.fn().mockImplementation((col: string, op: string, value: unknown) => {
          filters[`${col}.${op}`] = value
          return chain
        }),
        update: jest.fn().mockImplementation(() => chain),
        order: jest.fn().mockImplementation((col: string, opts2?: { ascending?: boolean }) => {
          ordering = { column: col, ascending: opts2?.ascending ?? true }
          return chain
        }),
        limit: jest.fn().mockImplementation((n: number) => {
          limitN = n
          return chain
        }),
        maybeSingle: jest.fn().mockImplementation(async () => {
          queryLog.push({ table, filters: { ...filters }, ordering, limit: limitN })
          return buildQueryResult(getResponse(table))
        }),
      }
      // Top-level await — most `await client.from(t).select(...).eq(...).maybeSingle()`
      // chains end with maybeSingle; some end with await (without calling
      // maybeSingle). Handle both.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- top-level thenable
      ;(chain as any).then = (onFulfilled: (v: { data: unknown }) => unknown) => {
        queryLog.push({ table, filters: { ...filters }, ordering, limit: limitN })
        return Promise.resolve(buildQueryResult(getResponse(table))).then(onFulfilled)
      }
      return chain
    },
  }

  createSupabaseServerClientMock.mockReset().mockResolvedValue(client)
  return { client, queryLog }
}

beforeEach(() => {
  jest.clearAllMocks()
})

// ─── requireEdicionesGlobalesRole ────────────────────────────────────────

describe('requireEdicionesGlobalesRole', () => {
  it('returns not-found when feature flag is off', async () => {
    buildClient({ isEnabled: false })
    const result = await requireEdicionesGlobalesRole()
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('not-found')
  })

  it('returns unauthorized when no user is signed in', async () => {
    buildClient({ user: null })
    const result = await requireEdicionesGlobalesRole()
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('unauthorized')
  })

  it('returns unauthorized when persona cannot be resolved', async () => {
    buildClient({ personaId: null })
    const result = await requireEdicionesGlobalesRole()
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('unauthorized')
  })

  it('returns forbidden when neither director.write nor admin.manage is held', async () => {
    buildClient({
      personaId: 'p-1',
      capabilities: ['talleres_crecimiento.participation.read'],
    })
    const result = await requireEdicionesGlobalesRole()
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('forbidden')
  })

  it('returns ok for director.write', async () => {
    buildClient({
      personaId: 'p-1',
      capabilities: ['talleres_crecimiento.director.write'],
    })
    const result = await requireEdicionesGlobalesRole()
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.personaId).toBe('p-1')
  })

  it('returns ok for admin.manage', async () => {
    buildClient({
      personaId: 'p-1',
      capabilities: ['talleres_crecimiento.admin.manage'],
    })
    const result = await requireEdicionesGlobalesRole()
    expect(result.ok).toBe(true)
  })
})

// ─── loadEdicionesGlobales ───────────────────────────────────────────────

describe('loadEdicionesGlobales', () => {
  it('returns an empty array when the underlying query errors', async () => {
    const { client } = buildClient({
      personaId: 'p-1',
      capabilities: ['talleres_crecimiento.admin.manage'],
    })
    // Force `from(...).select(...).order(...).limit(...)` (await) to
    // resolve to null by NOT adding a table response for that table.
    const result = await loadEdicionesGlobales(client)
    expect(result).toEqual([])
  })

  it('maps the participant count from taller_ediciones FK rows', async () => {
    // PR31: the participant count is computed by walking
    // taller_ediciones.edicion_global_id. The junction table is
    // gone — the FK column is the source of truth.
    const sampleRows = [
      {
        id: 'g-1',
        nombre: 'Otoño 2026',
        slug: 'otono-2026',
        descripcion: 'Temporada de otoño',
        fecha_apertura: '2026-09-01T00:00:00.000Z',
        fecha_cierre: '2026-12-15T00:00:00.000Z',
        estado: 'borrador',
        created_by_persona_id: 'p-1',
        created_at: '2026-08-16T00:00:00.000Z',
        updated_at: '2026-08-16T00:00:00.000Z',
        version: 1,
      },
      {
        id: 'g-2',
        nombre: 'Edición Legacy',
        slug: 'legacy-pre-pr29',
        descripcion: null,
        fecha_apertura: '2025-01-01T00:00:00.000Z',
        fecha_cierre: '2030-12-31T23:59:59.000Z',
        estado: 'borrador',
        created_by_persona_id: null,
        created_at: '2025-01-01T00:00:00.000Z',
        updated_at: '2025-01-01T00:00:00.000Z',
        version: 1,
      },
    ]
    // Three locales for g-1 (3 distinct talleres), one for g-2.
    const localesRows = [
      { edicion_global_id: 'g-1', taller_id: 't-1' },
      { edicion_global_id: 'g-1', taller_id: 't-2' },
      { edicion_global_id: 'g-1', taller_id: 't-3' },
      { edicion_global_id: 'g-2', taller_id: 't-1' },
    ]

    // Override the chain so the top-level await (without maybeSingle)
    // resolves to the sample.
    const { client } = buildClient({
      personaId: 'p-1',
      capabilities: ['talleres_crecimiento.admin.manage'],
    })
    const origFrom = (client as { from: (t: string) => unknown }).from
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- replacement
    ;(client as any).from = (table: string) => {
      const chain = origFrom(table)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- extend
      ;(chain as any).then = (onFulfilled: (v: { data: unknown }) => unknown) => {
        if (table === 'taller_ediciones_globales') {
          return Promise.resolve({ data: sampleRows, error: null }).then(onFulfilled)
        }
        if (table === 'taller_ediciones') {
          return Promise.resolve({ data: localesRows, error: null }).then(onFulfilled)
        }
        return Promise.resolve({ data: null, error: null }).then(onFulfilled)
      }
      return chain
    }

    const result = await loadEdicionesGlobales(client)
    expect(result.length).toBe(2)
    const first = result[0] as EdicionGlobal
    expect(first.id).toBe('g-1')
    expect(first.nombre).toBe('Otoño 2026')
    expect(first.participantes_count).toBe(3)
    const second = result[1] as EdicionGlobal
    expect(second.participantes_count).toBe(1)
    expect(second.slug).toBe('legacy-pre-pr29')
  })

  it('orders by fecha_apertura DESC', async () => {
    const { client, queryLog } = buildClient({
      personaId: 'p-1',
      capabilities: ['talleres_crecimiento.admin.manage'],
    })
    await loadEdicionesGlobales(client)
    const globalQuery = queryLog.find((q) => q.table === 'taller_ediciones_globales')
    expect(globalQuery?.ordering).toEqual({ column: 'fecha_apertura', ascending: false })
  })
})

// ─── loadEdicionGlobalById ───────────────────────────────────────────────

describe('loadEdicionGlobalById', () => {
  it('returns null when the global row is missing', async () => {
    const { client } = buildClient({
      personaId: 'p-1',
      capabilities: ['talleres_crecimiento.admin.manage'],
    })
    const result = await loadEdicionGlobalById(client, 'g-missing')
    expect(result).toBeNull()
  })

  it('hydrates participantes with edicion local id and estado', async () => {
    // PR31: participantes are taller_ediciones rows whose FK points
    // at the global (not junction rows). The taller metadata comes
    // from a separate talleres query.
    const globalRow = {
      id: 'g-1',
      nombre: 'Otoño 2026',
      slug: 'otono-2026',
      descripcion: null,
      fecha_apertura: '2026-09-01T00:00:00.000Z',
      fecha_cierre: '2026-12-15T00:00:00.000Z',
      estado: 'borrador',
      created_by_persona_id: 'p-1',
      created_at: '2026-08-16T00:00:00.000Z',
      updated_at: '2026-08-16T00:00:00.000Z',
      version: 1,
    }

    const localesRows = [
      { id: 'te-1', taller_id: 't-1', estado: 'borrador' },
    ]

    const talleresRows = [
      {
        id: 't-1',
        slug: 'matrimoniosobrela-roca',
        nombre: 'Matrimonio sobre la Roca',
        modalidad_default: 'periodo_general',
        estado: 'active',
      },
    ]

    const { client } = buildClient({
      personaId: 'p-1',
      capabilities: ['talleres_crecimiento.admin.manage'],
      tableResponses: {
        taller_ediciones_globales: [globalRow],
        taller_ediciones: [localesRows],
        talleres: [talleresRows],
      },
    })

    const result = await loadEdicionGlobalById(client, 'g-1')
    expect(result).not.toBeNull()
    const r = result as EdicionGlobalDetalle
    expect(r.nombre).toBe('Otoño 2026')
    expect(r.participantes.length).toBe(1)
    expect(r.participantes[0]?.id).toBe('t-1')
    expect(r.participantes[0]?.edicion_local_id).toBe('te-1')
    expect(r.participantes[0]?.edicion_local_estado).toBe('borrador')
    expect(r.participantes_count).toBe(1)
  })

  it('deduplicates locales by taller_id (first row wins for snapshot fields)', async () => {
    // A taller with two local ediciones pointing at the same global
    // must surface as ONE participante row (the first local-edicion
    // wins for the snapshot fields). The junction model had no such
    // constraint.
    const globalRow = {
      id: 'g-1',
      nombre: 'Otoño 2026',
      slug: 'otono-2026',
      descripcion: null,
      fecha_apertura: '2026-09-01T00:00:00.000Z',
      fecha_cierre: '2026-12-15T00:00:00.000Z',
      estado: 'borrador',
      created_by_persona_id: 'p-1',
      created_at: '2026-08-16T00:00:00.000Z',
      updated_at: '2026-08-16T00:00:00.000Z',
      version: 1,
    }

    const localesRows = [
      { id: 'te-1', taller_id: 't-1', estado: 'borrador' },
      { id: 'te-2', taller_id: 't-1', estado: 'abierto' },
    ]

    const talleresRows = [
      {
        id: 't-1',
        slug: 'matrimoniosobrela-roca',
        nombre: 'Matrimonio sobre la Roca',
        modalidad_default: 'periodo_general',
        estado: 'active',
      },
    ]

    const { client } = buildClient({
      personaId: 'p-1',
      capabilities: ['talleres_crecimiento.admin.manage'],
      tableResponses: {
        taller_ediciones_globales: [globalRow],
        taller_ediciones: [localesRows],
        talleres: [talleresRows],
      },
    })

    const result = await loadEdicionGlobalById(client, 'g-1')
    expect(result?.participantes.length).toBe(1)
    expect(result?.participantes_count).toBe(1)
    expect(result?.participantes[0]?.edicion_local_id).toBe('te-1')
    expect(result?.participantes[0]?.edicion_local_estado).toBe('borrador')
  })

  it('returns an empty participantes array when no locales link to the global', async () => {
    const globalRow = {
      id: 'g-1',
      nombre: 'Vacía',
      slug: 'vacia',
      descripcion: null,
      fecha_apertura: '2026-09-01T00:00:00.000Z',
      fecha_cierre: '2026-12-15T00:00:00.000Z',
      estado: 'borrador',
      created_by_persona_id: 'p-1',
      created_at: '2026-08-16T00:00:00.000Z',
      updated_at: '2026-08-16T00:00:00.000Z',
      version: 1,
    }

    const { client } = buildClient({
      personaId: 'p-1',
      capabilities: ['talleres_crecimiento.admin.manage'],
      tableResponses: {
        taller_ediciones_globales: [globalRow],
        taller_ediciones: [[]],
        // talleres intentionally missing — the helper must not crash
        // when there are zero locales.
      },
    })

    const result = await loadEdicionGlobalById(client, 'g-1')
    expect(result?.participantes).toEqual([])
    expect(result?.participantes_count).toBe(0)
  })
})

// ─── loadTalleresDisponibles ─────────────────────────────────────────────

describe('loadTalleresDisponibles', () => {
  it('returns only talleres not already linked to the global via FK', async () => {
    // PR31: association is via taller_ediciones.edicion_global_id.
    // t-2 has a local edicion pointing at g-1 → must be filtered out.
    const localesEnGlobal = [{ taller_id: 't-2' }]
    const talleresActivos = [
      { id: 't-1', slug: 'a', nombre: 'A', modalidad_default: 'periodo_general', estado: 'active' },
      { id: 't-2', slug: 'b', nombre: 'B', modalidad_default: 'periodo_general', estado: 'active' },
      { id: 't-3', slug: 'c', nombre: 'C', modalidad_default: 'permanente_custom', estado: 'active' },
    ]

    const { client } = buildClient({
      personaId: 'p-1',
      capabilities: ['talleres_crecimiento.admin.manage'],
      tableResponses: {
        // PR31: the dedup query is now on taller_ediciones (the FK
        // column), not the junction table.
        taller_ediciones: [localesEnGlobal],
        talleres: [talleresActivos],
      },
    })

    const result = await loadTalleresDisponibles(client, 'g-1')
    expect(result.disponibles.map((t) => t.id).sort()).toEqual(['t-1', 't-3'])
    // totalActivos is the count BEFORE filtering — the helper
    // needs it for the empty-state UX so admins see "all already added"
    // instead of "no active talleres".
    expect(result.totalActivos).toBe(3)
  })

  it('deduplicates taller_id (multiple locales for the same taller hide it once)', async () => {
    // A taller with two local ediciones pointing at g-1 must still
    // be hidden exactly once from the dropdown (Set semantics).
    const localesEnGlobal = [
      { taller_id: 't-2' },
      { taller_id: 't-2' },
    ]
    const talleresActivos = [
      { id: 't-1', slug: 'a', nombre: 'A', modalidad_default: 'periodo_general', estado: 'active' },
      { id: 't-2', slug: 'b', nombre: 'B', modalidad_default: 'periodo_general', estado: 'active' },
    ]

    const { client } = buildClient({
      personaId: 'p-1',
      capabilities: ['talleres_crecimiento.admin.manage'],
      tableResponses: {
        taller_ediciones: [localesEnGlobal],
        talleres: [talleresActivos],
      },
    })

    const result = await loadTalleresDisponibles(client, 'g-1')
    expect(result.disponibles.map((t) => t.id)).toEqual(['t-1'])
    expect(result.totalActivos).toBe(2)
  })

  it('returns { disponibles: [], totalActivos: 0 } when the talleres query errors', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    const { client } = buildClient({
      personaId: 'p-1',
      capabilities: ['talleres_crecimiento.admin.manage'],
      tableResponses: {
        taller_ediciones: [[]],
        // talleres intentionally missing → resolves to null
      },
    })

    const result = await loadTalleresDisponibles(client, 'g-1')
    expect(result).toEqual({ disponibles: [], totalActivos: 0 })
    // The silent-failure fix: the helper must surface the error to the
    // server console instead of returning [] quietly.
    expect(consoleError).toHaveBeenCalledWith(
      '[ediciones-globales] loadTalleresDisponibles: talleres query returned null data without error — unexpected (edicion_global_id=g-1)',
    )
    consoleError.mockRestore()
  })

  it('returns all active talleres when none are linked to the global', async () => {
    // Bug repro: a new (borrador) edicion global with no locales
    // should see every active taller in the dropdown.
    const talleresActivos = [
      { id: '4b3f1bf2-0c26-4bd4-95dd-9d5cc3f5c6a5', slug: 'factor-mama', nombre: 'Factor Mamá', modalidad_default: 'periodo_general', estado: 'active' },
      { id: '9d2e47ff-b032-4563-a839-fb741952e14c', slug: 'matrimonio-sobre-la-roca', nombre: 'Matrimonio sobre la Roca', modalidad_default: 'periodo_general', estado: 'active' },
      { id: 'af0c509a-e1b9-4a89-9b71-70bbeadc14a2', slug: 'punto-de-partida', nombre: 'Punto de partida', modalidad_default: 'permanente_custom', estado: 'active' },
    ]

    const { client } = buildClient({
      personaId: 'p-1',
      capabilities: ['talleres_crecimiento.admin.manage'],
      tableResponses: {
        taller_ediciones: [[]],
        talleres: [talleresActivos],
      },
    })

    const result = await loadTalleresDisponibles(client, 'g-2026')
    expect(result.disponibles.map((t) => t.id).sort()).toEqual(talleresActivos.map((t) => t.id).sort())
    expect(result.totalActivos).toBe(3)
    // Every returned item must have edicion_local_id null (this loader
    // does not join the local-edition table).
    for (const t of result.disponibles) {
      expect(t.edicion_local_id).toBeNull()
      expect(t.edicion_local_estado).toBeNull()
    }
  })

  it('logs the error when the talleres query fails (RLS denial, schema miss, etc.)', async () => {
    // The bug surface: the original 'if (error || !talleresActivos) return []'
    // branch silently swallowed the error. The fix surfaces the error to
    // the server console so the page logs prove the root cause instead of
    // presenting a misleading empty state.
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    const talleresError = Object.assign(new Error('permission denied for table talleres'), {
      code: '42501',
      hint: 'Check RLS policy for talleres_select_all',
    })
    const { client } = buildClient({
      personaId: 'p-1',
      capabilities: ['talleres_crecimiento.admin.manage'],
      tableResponses: {
        taller_ediciones: [[]],
        talleres: [{ data: null, error: talleresError }],
      },
    })

    const result = await loadTalleresDisponibles(client, 'g-1')
    expect(result).toEqual({ disponibles: [], totalActivos: 0 })
    expect(consoleError).toHaveBeenCalledWith(
      '[ediciones-globales] loadTalleresDisponibles: ' +
      'talleres query failed (edicion_global_id=g-1)',
      talleresError,
    )
    consoleError.mockRestore()
  })

  it('logs the error when the locales query fails (so the dropdown does not silently offer duplicates)', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    const localesError = Object.assign(new Error('permission denied for table taller_ediciones'), {
      code: '42501',
    })
    const talleresActivos = [
      { id: 't-1', slug: 'a', nombre: 'A', modalidad_default: 'periodo_general', estado: 'active' },
    ]
    const { client } = buildClient({
      personaId: 'p-1',
      capabilities: ['talleres_crecimiento.admin.manage'],
      tableResponses: {
        taller_ediciones: [{ data: null, error: localesError }],
        talleres: [talleresActivos],
      },
    })

    const result = await loadTalleresDisponibles(client, 'g-1')
    // Silent-failure fix: the locales error is logged even though the
    // helper still falls back to an empty dedup set (we don't want to
    // mask the false-positive 'taller offered twice' bug either).
    expect(result.disponibles.map((t) => t.id)).toEqual(['t-1'])
    expect(result.totalActivos).toBe(1)
    expect(consoleError).toHaveBeenCalledWith(
      '[ediciones-globales] loadTalleresDisponibles: ' +
      'taller_ediciones query failed (edicion_global_id=g-1)',
      localesError,
    )
    consoleError.mockRestore()
  })

  it('returns { disponibles: [], totalActivos: 3 } when all active talleres are already in the global', async () => {
    // Bug repro (the user's actual report): an edicion global where
    // every active taller is already associated used to render the
    // dropdown with "No hay grupos activos disponibles para agregar"
    // which misled admins into thinking the system had no active
    // talleres. The fix surfaces `totalActivos` so the UI can render
    // "Todos los grupos activos (3) ya forman parte de esta edición".
    const talleresActivos = [
      { id: '4b3f1bf2-0c26-4bd4-95dd-9d5cc3f5c6a5', slug: 'factor-mama', nombre: 'Factor Mamá', modalidad_default: 'periodo_general', estado: 'active' },
      { id: '9d2e47ff-b032-4563-a839-fb741952e14c', slug: 'matrimonio-sobre-la-roca', nombre: 'Matrimonio sobre la Roca', modalidad_default: 'periodo_general', estado: 'active' },
      { id: 'af0c509a-e1b9-4a89-9b71-70bbeadc14a2', slug: 'punto-de-partida', nombre: 'Punto de partida', modalidad_default: 'permanente_custom', estado: 'active' },
    ]
    // PR31: the FK column on taller_ediciones carries the
    // association. Every active taller has a local edicion pointing
    // at g-2026.
    const localesEnGlobal = talleresActivos.map((t) => ({ taller_id: t.id }))

    const { client } = buildClient({
      personaId: 'p-1',
      capabilities: ['talleres_crecimiento.admin.manage'],
      tableResponses: {
        taller_ediciones: [localesEnGlobal],
        talleres: [talleresActivos],
      },
    })

    const result = await loadTalleresDisponibles(client, 'g-2026')
    expect(result.disponibles).toEqual([])
    expect(result.totalActivos).toBe(3)
  })
})