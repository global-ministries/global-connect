/**
 * @jest-environment node
 *
 * PR18 — DT-076 — Tests for the participante surface.
 *
 * Covers:
 *   - kill switch: loadParticipanteContext returns ok:false when the
 *     talleres flag is off
 *   - capability gate: returns ok:false when the user lacks
 *     `participation.read`
 *   - summary projection (design §9): queries never select motivos,
 *     asistencia rows, attendance data, group notes, or correction
 *     history. Each load* helper is asserted to project only the
 *     summary fields.
 *   - deny-by-default certificado: loadParticipanteCertificado
 *     returns null when the certificado doesn't belong to the persona.
 */

import {
  loadParticipanteContext,
  loadParticipanteActiveTalleres,
  loadParticipanteHistorial,
  loadParticipanteExplorar,
  loadParticipanteCertificado,
  loadParticipanteCertificados,
} from '@/lib/platform/talleres/participante'

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

const PERSONA_ID = '00000000-0000-0000-0000-000000000001'

interface CapturedFilter {
  readonly table: string
  readonly selectColumns: string
  readonly column: string
  readonly op: 'eq' | 'in'
  readonly value: unknown
}

const captured: CapturedFilter[] = []

function setupSupabaseMock(opts: {
  isEnabled?: boolean
  user?: { id: string } | null
  personaId?: string | null
  capabilities?: string[]
  rows?: unknown[]
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

  let currentTable = ''
  let currentCols = ''

  function builder() {
    // The builder is a thenable (so `await Promise.all([b, b])` works)
    // AND a chain (so `.select().in().order()` works). The cast keeps
    // the call sites terse — both the dedicated tests below and the
    // earlier ones rely on this shape.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- thenable + chain
    const b: Record<string, any> = {
      then: (
        resolve: (r: { data: unknown; error: null }) => void,
      ) => Promise.resolve({ data: [], error: null }).then(resolve),
    }
    b['select'] = jest.fn((cols: string) => {
      currentCols = cols
      return b
    })
    b['eq'] = jest.fn((column: string, value: unknown) => {
      captured.push({
        table: currentTable,
        selectColumns: currentCols,
        column,
        op: 'eq',
        value,
      })
      return b
    })
    b['in'] = jest.fn((column: string, value: unknown) => {
      captured.push({
        table: currentTable,
        selectColumns: currentCols,
        column,
        op: 'in',
        value,
      })
      return b
    })
    b['order'] = jest.fn(() => b)
    b['maybeSingle'] = jest.fn(() =>
      Promise.resolve({ data: opts.rows?.[0] ?? null, error: null }),
    )
    b['single'] = jest.fn(() =>
      Promise.resolve({ data: opts.rows?.[0] ?? null, error: null }),
    )
    return b
  }

  createSupabaseServerClientMock.mockReset().mockResolvedValue({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: opts.user ?? { id: 'auth-1' } },
        error: null,
      }),
    },
    from: jest.fn((table: string) => {
      currentTable = table
      return builder()
    }),
  })
}

beforeEach(() => {
  captured.length = 0
})

function capturedFiltersFor(table: string): CapturedFilter[] {
  return captured.filter((q) => q.table === table)
}

// ─── loadParticipanteContext — gate ───────────────────────────────────────

describe('loadParticipanteContext — gate', () => {
  it('returns ok:false when feature flag is off (kill switch)', async () => {
    setupSupabaseMock({
      isEnabled: false,
      personaId: PERSONA_ID,
      capabilities: ['talleres_crecimiento.participation.read'],
    })
    const result = await loadParticipanteContext()
    expect(result.ok).toBe(false)
  })

  it('returns ok:false when user is unauthenticated', async () => {
    setupSupabaseMock({ user: null })
    const result = await loadParticipanteContext()
    expect(result.ok).toBe(false)
  })

  it('returns ok:false when persona cannot be resolved', async () => {
    setupSupabaseMock({ personaId: null })
    const result = await loadParticipanteContext()
    expect(result.ok).toBe(false)
  })

  it('returns ok:false when capability participation.read is missing', async () => {
    setupSupabaseMock({
      personaId: PERSONA_ID,
      capabilities: ['talleres_crecimiento.director.read'],
    })
    const result = await loadParticipanteContext()
    expect(result.ok).toBe(false)
  })

  it('returns ok:true when capability is present', async () => {
    setupSupabaseMock({
      personaId: PERSONA_ID,
      capabilities: ['talleres_crecimiento.participation.read'],
    })
    const result = await loadParticipanteContext()
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.context.personaId).toBe(PERSONA_ID)
      expect(result.context.capabilities).toContain(
        'talleres_crecimiento.participation.read',
      )
    }
  })
})

// ─── Summary projection (design §9) ───────────────────────────────────────

describe('loadParticipanteActiveTalleres — summary projection only', () => {
  it('queries taller_inscripciones filtered by persona + estados activos', async () => {
    setupSupabaseMock({
      personaId: PERSONA_ID,
      capabilities: ['talleres_crecimiento.participation.read'],
    })
    const ctxResult = await loadParticipanteContext()
    if (!ctxResult.ok) throw new Error('expected ok:true')
    await loadParticipanteActiveTalleres(ctxResult.context)

    const filters = capturedFiltersFor('taller_inscripciones')
    const personaFilter = filters.find(
      (f) => f.column === 'persona_principal_id',
    )
    expect(personaFilter?.value).toBe(PERSONA_ID)
    expect(personaFilter?.op).toBe('eq')

    const estadoFilter = filters.find(
      (f) => f.column === 'estado' && f.op === 'in',
    )
    expect(estadoFilter?.value).toEqual(['pendiente', 'aprobado'])

    // Summary projection — no motivos, no asistencia, no reportes
    const selectColumns = filters[0]?.selectColumns ?? ''
    expect(selectColumns).not.toMatch(/motivo/i)
    expect(selectColumns).not.toMatch(/asistencia/i)
    expect(selectColumns).not.toMatch(/reporte/i)
  })

  it('PR42 — joined-relationship fix: select uses taller:taller_ediciones!taller_id(...)', async () => {
    // Bug #1 — the embedded join `taller:taller_ediciones (...)` returned
    // an empty result because `taller_inscripciones.taller_id` has
    // multiple FK edges (to `talleres` and to `taller_ediciones`).
    // The PR42 fix forces the join via the explicit `!taller_id` hint.
    setupSupabaseMock({
      personaId: PERSONA_ID,
      capabilities: ['talleres_crecimiento.participation.read'],
    })
    const ctxResult = await loadParticipanteContext()
    if (!ctxResult.ok) throw new Error('expected ok:true')
    await loadParticipanteActiveTalleres(ctxResult.context)

    const filters = capturedFiltersFor('taller_inscripciones')
    const selectColumns = filters[0]?.selectColumns ?? ''
    expect(selectColumns).toMatch(/taller\s*:\s*taller_ediciones!taller_id\s*\(/)
    // The taller_id column is required so the FK hint resolves.
    expect(selectColumns).toMatch(/taller_id|nombre_snapshot/)
  })
})

describe('loadParticipanteHistorial — full history without motivos/asistencia', () => {
  it('queries every inscripcion (no estado filter), filters by persona', async () => {
    setupSupabaseMock({
      personaId: PERSONA_ID,
      capabilities: ['talleres_crecimiento.participation.read'],
    })
    const ctxResult = await loadParticipanteContext()
    if (!ctxResult.ok) throw new Error('expected ok:true')
    await loadParticipanteHistorial(ctxResult.context)

    const filters = capturedFiltersFor('taller_inscripciones')
    const personaFilter = filters.find(
      (f) => f.column === 'persona_principal_id',
    )
    expect(personaFilter?.value).toBe(PERSONA_ID)
    // No estado filter on historial (all states)
    const estadoFilter = filters.find(
      (f) => f.column === 'estado' && f.op === 'in',
    )
    expect(estadoFilter).toBeUndefined()

    const selectColumns = filters[0]?.selectColumns ?? ''
    expect(selectColumns).not.toMatch(/motivo/i)
    expect(selectColumns).not.toMatch(/asistencia/i)
  })

  it('PR42 — joined-relationship fix: select uses taller:taller_ediciones!taller_id(...)', async () => {
    // Bug #1 — same root cause as `loadParticipanteActiveTalleres`,
    // fixed in the same PR. The two helpers share the same FK
    // ambiguity problem on `taller_inscripciones.taller_id`.
    setupSupabaseMock({
      personaId: PERSONA_ID,
      capabilities: ['talleres_crecimiento.participation.read'],
    })
    const ctxResult = await loadParticipanteContext()
    if (!ctxResult.ok) throw new Error('expected ok:true')
    await loadParticipanteHistorial(ctxResult.context)

    const filters = capturedFiltersFor('taller_inscripciones')
    const selectColumns = filters[0]?.selectColumns ?? ''
    expect(selectColumns).toMatch(/taller\s*:\s*taller_ediciones!taller_id\s*\(/)
  })
})

describe('loadParticipanteExplorar — only abierto/en_curso talleres', () => {
  it('queries taller_ediciones filtered to open states', async () => {
    setupSupabaseMock({
      personaId: PERSONA_ID,
      capabilities: ['talleres_crecimiento.participation.read'],
    })
    const ctxResult = await loadParticipanteContext()
    if (!ctxResult.ok) throw new Error('expected ok:true')
    await loadParticipanteExplorar(ctxResult.context)

    const tallerFilters = capturedFiltersFor('taller_ediciones')
    const estadoFilter = tallerFilters.find(
      (f) => f.column === 'estado' && f.op === 'in',
    )
    expect(estadoFilter?.value).toEqual(['abierto', 'en_curso'])
  })

  it('queries cohortes, periodos, and inscripciones when ediciones exist (batch fetch)', async () => {
    // PR38 fix — when at least one edicion is open, the helper fires
    // 3 additional batched queries (cohortes, periodos, inscripciones).
    // We use the dedicated tableResponses mock to fake a single
    // open edicion, which triggers the cohortes + periodos + insc
    // queries filtered by taller_id IN (edicion_ids).
    flagsMock.mockReset().mockReturnValue(true)
    findPersonaByAuthIdMock.mockReset().mockResolvedValue({
      id: PERSONA_ID,
      authId: 'auth-1',
      globalRoles: [],
    })
    resolveSessionMock.mockReset().mockResolvedValue({
      personaId: PERSONA_ID,
      subjectAuthId: 'auth-1',
      globalRoles: [],
      contexts: [],
      capabilities: [
        {
          key: 'talleres_crecimiento.participation.read',
          experience: 'talleres_crecimiento',
          scopeType: 'taller',
          source: 'test',
        },
      ],
    })

    const tableResponses: Record<string, { data: unknown; error: null }> = {
      taller_ediciones: {
        data: [
          {
            id: 'ed-1',
            nombre_snapshot: 'Septiembre 2026',
            tipo: 'pareja',
            estado: 'abierto',
            taller_id: 'taller-1',
            taller: {
              slug: 'matrimonio-sobre-la-roca',
              nombre: 'Matrimonio sobre la Roca',
              modalidad_default: 'periodo_general',
              descripcion: null,
            },
          },
        ],
        error: null,
      },
      talleres_crecimiento_cohortes: { data: [], error: null },
      taller_periodos_generales: { data: [], error: null },
      taller_inscripciones: { data: [], error: null },
    }

    const builderFor = (table: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- thenable
      const b: Record<string, any> = {}
      // local capture so we can push to the shared `captured` array
      // (mirrors what `setupSupabaseMock` does, but per-table).
      let currentCols = ''
      b['select'] = jest.fn((cols: string) => {
        currentCols = cols
        return b
      })
      b['eq'] = jest.fn((column: string, value: unknown) => {
        captured.push({
          table,
          selectColumns: currentCols,
          column,
          op: 'eq',
          value,
        })
        return b
      })
      b['in'] = jest.fn((column: string, value: unknown) => {
        captured.push({
          table,
          selectColumns: currentCols,
          column,
          op: 'in',
          value,
        })
        return b
      })
      b['order'] = jest.fn(() => b)
      b['then'] = (
        resolve: (r: { data: unknown; error: null }) => void,
      ) => Promise.resolve(tableResponses[table]).then(resolve)
      return b
    }

    createSupabaseServerClientMock.mockReset().mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: { id: 'auth-1' } },
          error: null,
        }),
      },
      from: jest.fn((table: string) => builderFor(table)),
    })

    const ctxResult = await loadParticipanteContext()
    if (!ctxResult.ok) throw new Error('expected ok:true')
    await loadParticipanteExplorar(ctxResult.context)

    // All 4 tables were queried (no nested-resource on 1:N FKs).
    const queriesForTable = (t: string) =>
      captured.filter((c) => c.table === t)
    expect(queriesForTable('taller_ediciones').length).toBeGreaterThan(0)
    expect(queriesForTable('talleres_crecimiento_cohortes').length).toBeGreaterThan(0)
    expect(queriesForTable('taller_periodos_generales').length).toBeGreaterThan(0)
    expect(queriesForTable('taller_inscripciones').length).toBeGreaterThan(0)

    // Inscripciones filter is preserved.
    const inscFilters = capturedFiltersFor('taller_inscripciones')
    const inscEstadoFilter = inscFilters.find(
      (f) => f.column === 'estado' && f.op === 'in',
    )
    expect(inscEstadoFilter?.value).toEqual(['pendiente', 'aprobado'])
    // The cohortes + periodos queries are filtered by taller_id IN (the
    // fetched edicion ids) — not by nested-resource.
    const cohorteIn = queriesForTable('talleres_crecimiento_cohortes').find(
      (c) => c.column === 'taller_id' && c.op === 'in',
    )
    expect(cohorteIn).toBeDefined()
    const periodoIn = queriesForTable('taller_periodos_generales').find(
      (c) => c.column === 'taller_id' && c.op === 'in',
    )
    expect(periodoIn).toBeDefined()
  })
})

/**
 * PR38 — Issue #1 (cohorte_id lookup) and Issue #2 (card info).
 * The explorar query must surface per-row cohorte_id, modality
 * (from `talleres`), and period dates (from `taller_periodos_generales`)
 * so the client doesn't need a second round-trip and can render
 * meaningful cards.
 *
 * PR38 — joined-relationship fix. The implementation now uses 4
 * separate queries (no nested-resource) and joins in TS. The
 * assertions below mirror the new contract.
 */
describe('loadParticipanteExplorar — PR38 enriched projection', () => {
  it('selects taller_id + taller!taller_id(...) with explicit FK hint', async () => {
    setupSupabaseMock({
      personaId: PERSONA_ID,
      capabilities: ['talleres_crecimiento.participation.read'],
    })
    const ctxResult = await loadParticipanteContext()
    if (!ctxResult.ok) throw new Error('expected ok:true')
    await loadParticipanteExplorar(ctxResult.context)

    const tallerFilters = capturedFiltersFor('taller_ediciones')
    const selectColumns = tallerFilters[0]?.selectColumns ?? ''

    // taller_id is required (drives the taller!taller_id embed AND
    // the batch .in() filter for cohortes / periodos).
    expect(selectColumns).toMatch(/taller_id/)
    // No more nested-resource on cohorte: / periodo: — those 1:N FKs
    // return arrays and break the row mapping.
    expect(selectColumns).not.toMatch(/cohorte\s*:/)
    expect(selectColumns).not.toMatch(/periodo\s*:/)
    // The abstract taller is still embedded (1:1 via taller_id).
    expect(selectColumns).toMatch(/taller\s*:\s*talleres!taller_id\s*\(/)
    expect(selectColumns).toMatch(/slug/)
    expect(selectColumns).toMatch(/nombre/)
    expect(selectColumns).toMatch(/modalidad_default/)
    expect(selectColumns).toMatch(/descripcion/)
  })

  it('returns per-row cohorte_id, modalidad, fecha_apertura, fecha_cierre', async () => {
    // The default mock returns `opts.rows?.[0] ?? null` on
    // maybeSingle/single. The explorar query uses chained calls
    // (no maybeSingle), so we need a dedicated setup that returns
    // the joined row from `taller_ediciones` plus the cohortes +
    // periodos + inscripciones lookup tables.
    flagsMock.mockReset().mockReturnValue(true)
    findPersonaByAuthIdMock.mockReset().mockResolvedValue({
      id: PERSONA_ID,
      authId: 'auth-1',
      globalRoles: [],
    })
    resolveSessionMock.mockReset().mockResolvedValue({
      personaId: PERSONA_ID,
      subjectAuthId: 'auth-1',
      globalRoles: [],
      contexts: [],
      capabilities: [
        {
          key: 'talleres_crecimiento.participation.read',
          experience: 'talleres_crecimiento',
          scopeType: 'taller',
          source: 'test',
        },
      ],
    })

    const edicionRow = {
      id: 'ed-1',
      nombre_snapshot: 'Septiembre 2026',
      tipo: 'pareja',
      estado: 'abierto',
      taller_id: 'taller-1',
      taller: {
        slug: 'matrimonio-sobre-la-roca',
        nombre: 'Matrimonio sobre la Roca',
        modalidad_default: 'periodo_general',
        descripcion: 'Un taller de prueba',
      },
    }
    const cohorteRow = { id: 'coh-1', taller_id: 'ed-1' }
    const periodoRow = {
      taller_id: 'ed-1',
      fecha_apertura_automatica: '2026-08-20T00:00:00Z',
      fecha_cierre_automatico: '2026-09-30T23:59:59Z',
    }
    const inscRow = { taller_id: 'ed-1', estado: 'pendiente' }

    const tableResponses: Record<string, { data: unknown; error: null }> = {
      taller_ediciones: { data: [edicionRow], error: null },
      talleres_crecimiento_cohortes: { data: [cohorteRow], error: null },
      taller_periodos_generales: { data: [periodoRow], error: null },
      taller_inscripciones: { data: [inscRow], error: null },
    }

    const builderFor = (table: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- thenable
      const b: Record<string, any> = {}
      b['select'] = jest.fn(() => b)
      b['eq'] = jest.fn(() => b)
      b['in'] = jest.fn(() => b)
      b['order'] = jest.fn(() => b)
      // Make the chain a thenable so `await Promise.all([b, b, b])`
      // resolves to the table-specific response.
      b['then'] = (
        resolve: (r: { data: unknown; error: null }) => void,
      ) => Promise.resolve(tableResponses[table]).then(resolve)
      return b
    }

    createSupabaseServerClientMock.mockReset().mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: { id: 'auth-1' } },
          error: null,
        }),
      },
      from: jest.fn((table: string) => builderFor(table)),
    })

    const ctxResult = await loadParticipanteContext()
    if (!ctxResult.ok) throw new Error('expected ok:true')
    const rows = await loadParticipanteExplorar(ctxResult.context)

    expect(rows).toHaveLength(1)
    const row = rows[0]!
    // Issue #1 — per-row cohorte_id is now populated.
    expect(row.cohorte_id).toBe('coh-1')
    // Issue #2 — modality + descripcion surfaced.
    expect(row.modalidad).toBe('periodo_general')
    expect(row.descripcion).toBe('Un taller de prueba')
    // Issue #2 — period dates surfaced.
    expect(row.fecha_apertura).toBe('2026-08-20T00:00:00Z')
    expect(row.fecha_cierre).toBe('2026-09-30T23:59:59Z')
    // Title = abstract taller name (not nombre_snapshot).
    expect(row.nombre).toBe('Matrimonio sobre la Roca')
    expect(row.slug).toBe('matrimonio-sobre-la-roca')
    expect(row.edicion).toBe('Septiembre 2026')
  })

  it('returns null cohorte_id / modalidad / dates when joins return no rows (back-compat)', async () => {
    // Same shape as the previous test, but with an edicion whose
    // taller has no FK row (legacy data — taller_id NULL) and no
    // cohortes / periodos. The interface must accept nulls without
    // blowing up.
    flagsMock.mockReset().mockReturnValue(true)
    findPersonaByAuthIdMock.mockReset().mockResolvedValue({
      id: PERSONA_ID,
      authId: 'auth-1',
      globalRoles: [],
    })
    resolveSessionMock.mockReset().mockResolvedValue({
      personaId: PERSONA_ID,
      subjectAuthId: 'auth-1',
      globalRoles: [],
      contexts: [],
      capabilities: [
        {
          key: 'talleres_crecimiento.participation.read',
          experience: 'talleres_crecimiento',
          scopeType: 'taller',
          source: 'test',
        },
      ],
    })

    const edicionRow = {
      id: 'ed-1',
      nombre_snapshot: 'Legacy',
      tipo: 'individual',
      estado: 'abierto',
      taller_id: null,
      taller: null,
    }

    const tableResponses: Record<string, { data: unknown; error: null }> = {
      taller_ediciones: { data: [edicionRow], error: null },
      talleres_crecimiento_cohortes: { data: [], error: null },
      taller_periodos_generales: { data: [], error: null },
      taller_inscripciones: { data: [], error: null },
    }

    const builderFor = (table: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- thenable
      const b: Record<string, any> = {}
      b['select'] = jest.fn(() => b)
      b['eq'] = jest.fn(() => b)
      b['in'] = jest.fn(() => b)
      b['order'] = jest.fn(() => b)
      b['then'] = (
        resolve: (r: { data: unknown; error: null }) => void,
      ) => Promise.resolve(tableResponses[table]).then(resolve)
      return b
    }

    createSupabaseServerClientMock.mockReset().mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: { id: 'auth-1' } },
          error: null,
        }),
      },
      from: jest.fn((table: string) => builderFor(table)),
    })

    const ctxResult = await loadParticipanteContext()
    if (!ctxResult.ok) throw new Error('expected ok:true')
    const rows = await loadParticipanteExplorar(ctxResult.context)

    expect(rows).toHaveLength(1)
    const row = rows[0]!
    expect(row.cohorte_id).toBeNull()
    expect(row.modalidad).toBeNull()
    expect(row.descripcion).toBeNull()
    expect(row.fecha_apertura).toBeNull()
    expect(row.fecha_cierre).toBeNull()
    expect(row.slug).toBe('')
    // Fallback to nombre_snapshot when the taller embed is null.
    expect(row.nombre).toBe('Legacy')
  })

  it('returns [] when no ediciones are open', async () => {
    flagsMock.mockReset().mockReturnValue(true)
    findPersonaByAuthIdMock.mockReset().mockResolvedValue({
      id: PERSONA_ID,
      authId: 'auth-1',
      globalRoles: [],
    })
    resolveSessionMock.mockReset().mockResolvedValue({
      personaId: PERSONA_ID,
      subjectAuthId: 'auth-1',
      globalRoles: [],
      contexts: [],
      capabilities: [
        {
          key: 'talleres_crecimiento.participation.read',
          experience: 'talleres_crecimiento',
          scopeType: 'taller',
          source: 'test',
        },
      ],
    })

    const tableResponses: Record<string, { data: unknown; error: null }> = {
      taller_ediciones: { data: [], error: null },
    }

    const builderFor = (table: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- thenable
      const b: Record<string, any> = {}
      b['select'] = jest.fn(() => b)
      b['eq'] = jest.fn(() => b)
      b['in'] = jest.fn(() => b)
      b['order'] = jest.fn(() => b)
      b['then'] = (
        resolve: (r: { data: unknown; error: null }) => void,
      ) => Promise.resolve(tableResponses[table]).then(resolve)
      return b
    }

    createSupabaseServerClientMock.mockReset().mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: { id: 'auth-1' } },
          error: null,
        }),
      },
      from: jest.fn((table: string) => builderFor(table)),
    })

    const ctxResult = await loadParticipanteContext()
    if (!ctxResult.ok) throw new Error('expected ok:true')
    const rows = await loadParticipanteExplorar(ctxResult.context)
    expect(rows).toEqual([])
  })
})

// ─── Certificado deny-by-default ──────────────────────────────────────────

describe('loadParticipanteCertificado — ownership-scoped', () => {
  it('always filters by both id AND persona_id (deny-by-default)', async () => {
    setupSupabaseMock({
      personaId: PERSONA_ID,
      capabilities: ['talleres_crecimiento.participation.read'],
    })
    const ctxResult = await loadParticipanteContext()
    if (!ctxResult.ok) throw new Error('expected ok:true')
    await loadParticipanteCertificado(ctxResult.context, 'cert-1')

    const filters = capturedFiltersFor('taller_certificados')
    const idFilter = filters.find((f) => f.column === 'id' && f.value === 'cert-1')
    const personaFilter = filters.find(
      (f) => f.column === 'persona_id' && f.value === PERSONA_ID,
    )
    expect(idFilter).toBeDefined()
    expect(personaFilter).toBeDefined()
  })

  it('selects only the summary projection (no firmantes_snapshot, no motivo_revocacion)', async () => {
    setupSupabaseMock({
      personaId: PERSONA_ID,
      capabilities: ['talleres_crecimiento.participation.read'],
    })
    const ctxResult = await loadParticipanteContext()
    if (!ctxResult.ok) throw new Error('expected ok:true')
    await loadParticipanteCertificado(ctxResult.context, 'cert-1')

    const filters = capturedFiltersFor('taller_certificados')
    const selectColumns = filters[0]?.selectColumns ?? ''
    // firmantes_snapshot is sensitive (list of who signed the PDF);
    // motivo_revocacion is sensitive (audit trail of revocation).
    expect(selectColumns).not.toMatch(/firmantes_snapshot/)
    expect(selectColumns).not.toMatch(/motivo_revocacion/)
  })
})

describe('loadParticipanteCertificados — list scoped by persona_id', () => {
  it('always filters by persona_id', async () => {
    setupSupabaseMock({
      personaId: PERSONA_ID,
      capabilities: ['talleres_crecimiento.participation.read'],
    })
    const ctxResult = await loadParticipanteContext()
    if (!ctxResult.ok) throw new Error('expected ok:true')
    await loadParticipanteCertificados(ctxResult.context)

    const filters = capturedFiltersFor('taller_certificados')
    const personaFilter = filters.find((f) => f.column === 'persona_id')
    expect(personaFilter?.value).toBe(PERSONA_ID)
  })
})
