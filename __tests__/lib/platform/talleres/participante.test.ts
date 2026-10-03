/**
 * @jest-environment node
 *
 * PR18 — DT-076 — Tests for the participante surface.
 *
 * Covers:
 *   - kill switch: loadParticipanteContext returns ok:false when the
 *     talleres flag is off
 *   - open gate (odd/tasks/talleres-autoinscripcion.md, acceptance
 *     criterion 7): loadParticipanteContext/requireParticipante() succeed
 *     for ANY authenticated member with a resolvable persona, regardless
 *     of talleres capabilities — a member joins with zero capabilities and
 *     self-enrolling is how they become a participant. The RLS layer is
 *     the real security wall (every query below is already scoped to the
 *     caller's own persona_id).
 *   - summary projection (design §9): queries never select motivos,
 *     asistencia rows, attendance data, group notes, or correction
 *     history. Each load* helper is asserted to project only the
 *     summary fields.
 *   - deny-by-default certificado: loadParticipanteCertificado
 *     returns null when the certificado doesn't belong to the persona.
 */

import {
  loadParticipanteContext,
  loadExplorarViewerContext,
  requireParticipante,
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
  readonly op: 'eq' | 'in' | 'or'
  readonly value: unknown
}

const captured: CapturedFilter[] = []

function setupSupabaseMock(opts: {
  isEnabled?: boolean
  user?: { id: string } | null
  personaId?: string | null
  capabilities?: string[]
  rows?: unknown[]
  /** What an awaited list query (no .single/.maybeSingle) resolves with. */
  listRows?: unknown[]
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
      ) => Promise.resolve({ data: opts.listRows ?? [], error: null }).then(resolve),
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
    // `.or('a.eq.x,b.eq.y')` — captured with its raw filter string.
    b['or'] = jest.fn((filtro: string) => {
      captured.push({
        table: currentTable,
        selectColumns: currentCols,
        column: '',
        op: 'or',
        value: filtro,
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
        // `opts.user` is `{ id: string } | null | undefined`: undefined
        // means "not specified, use the default authenticated user";
        // explicit `null` means "genuinely unauthenticated" and must be
        // preserved as null (a `??` here would collapse null back to the
        // default and make an "unauthenticated" test exercise the wrong
        // code path).
        data: { user: 'user' in opts ? opts.user : { id: 'auth-1' } },
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

  it('returns ok:true even with ZERO talleres capabilities (acceptance criterion 7)', async () => {
    // odd/tasks/talleres-autoinscripcion.md — a member with NO talleres
    // capability must still reach mis-talleres/historial/certificados.
    // participation.read is no longer required to open this gate; the RLS
    // layer (persona_principal_id / persona_id = caller) is the real wall.
    setupSupabaseMock({
      personaId: PERSONA_ID,
      capabilities: [],
    })
    const result = await loadParticipanteContext()
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.context.personaId).toBe(PERSONA_ID)
      expect(result.context.capabilities).toEqual([])
    }
  })

  it('returns ok:true regardless of which (unrelated) capability is present', async () => {
    setupSupabaseMock({
      personaId: PERSONA_ID,
      capabilities: ['talleres_crecimiento.director.read'],
    })
    const result = await loadParticipanteContext()
    expect(result.ok).toBe(true)
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

// ─── requireParticipante() — page guard (redirect / notFound / open) ──────
//
// requireParticipante() is called directly by the participant page
// components (mis-talleres, historial, certificados, certificados/[id]).
// It must: resolve normally for an authenticated member with ZERO
// capabilities (criterion 7), still redirect unauthenticated visitors to
// /login, and still 404 when the kill switch is off.

const mockRedirect = jest.fn((path: string) => {
  throw new Error(`redirect:${path}`)
})
const mockNotFound = jest.fn(() => {
  throw new Error('notFound')
})

jest.mock('next/navigation', () => ({
  redirect: (path: string) => mockRedirect(path),
  notFound: () => mockNotFound(),
}))

describe('requireParticipante() — page guard', () => {
  beforeEach(() => {
    mockRedirect.mockClear()
    mockNotFound.mockClear()
  })

  it('resolves the context for an authenticated member with ZERO capabilities', async () => {
    setupSupabaseMock({
      personaId: PERSONA_ID,
      capabilities: [],
    })
    const context = await requireParticipante()
    expect(context.personaId).toBe(PERSONA_ID)
    expect(context.capabilities).toEqual([])
    expect(mockRedirect).not.toHaveBeenCalled()
    expect(mockNotFound).not.toHaveBeenCalled()
  })

  it('redirects to /login when unauthenticated', async () => {
    setupSupabaseMock({ user: null })
    await expect(requireParticipante()).rejects.toThrow('redirect:/login')
    expect(mockRedirect).toHaveBeenCalledWith('/login')
    expect(mockNotFound).not.toHaveBeenCalled()
  })

  it('404s when the kill switch is off, even for an authenticated member', async () => {
    setupSupabaseMock({
      isEnabled: false,
      personaId: PERSONA_ID,
      capabilities: [],
    })
    await expect(requireParticipante()).rejects.toThrow('notFound')
    expect(mockNotFound).toHaveBeenCalled()
    expect(mockRedirect).not.toHaveBeenCalled()
  })
})

// ─── loadExplorarViewerContext — any authenticated user (finding #1) ───────
//
// Option B (chicken-and-egg fix): /talleres/explorar must be reachable by
// ANY authenticated user, with any role or none. Enrolling is HOW a user
// becomes a participant, so the viewer gate drops the participation.read
// requirement. Only the kill switch + an authenticated session + a
// resolvable persona are required. The RLS layer is the real security wall.

describe('loadExplorarViewerContext — any authenticated user (finding #1)', () => {
  it('returns ok:false when feature flag is off (kill switch)', async () => {
    setupSupabaseMock({
      isEnabled: false,
      personaId: PERSONA_ID,
      capabilities: [],
    })
    const result = await loadExplorarViewerContext()
    expect(result.ok).toBe(false)
  })

  it('returns ok:false when user is unauthenticated', async () => {
    setupSupabaseMock({ user: null })
    const result = await loadExplorarViewerContext()
    expect(result.ok).toBe(false)
  })

  it('returns ok:false when persona/session cannot be resolved', async () => {
    setupSupabaseMock({ personaId: null })
    const result = await loadExplorarViewerContext()
    expect(result.ok).toBe(false)
  })

  it('returns ok:true for an authenticated user WITHOUT participation.read', async () => {
    setupSupabaseMock({
      personaId: PERSONA_ID,
      capabilities: [],
    })
    const result = await loadExplorarViewerContext()
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.context.personaId).toBe(PERSONA_ID)
      expect(result.context.capabilities).toEqual([])
    }
  })

  it('returns ok:true and preserves capabilities for a user who has caps', async () => {
    setupSupabaseMock({
      personaId: PERSONA_ID,
      capabilities: ['talleres_crecimiento.coordinator.read'],
    })
    const result = await loadExplorarViewerContext()
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.context.capabilities).toContain(
        'talleres_crecimiento.coordinator.read',
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
    // T2b (odd/tasks/talleres-cierre-de-edicion.md) — both people of a
    // couple inscription see it: the principal OR the companero.
    const personaFilter = filters.find((f) => f.op === 'or')
    expect(personaFilter?.value).toBe(
      `persona_principal_id.eq.${PERSONA_ID},companero_id.eq.${PERSONA_ID}`,
    )

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

  it('PR44 — does NOT select fecha_completitud from taller_inscripciones (column does not exist)', async () => {
    // Bug #3 — the select included `fecha_completitud`, which does NOT
    // exist on `taller_inscripciones` (it lives on `taller_certificados`).
    // PostgREST errored → `if (error) return []` → /talleres/mis-talleres
    // was always empty. The completion date must come from the 1:1
    // `certificado:taller_certificados!inscripcion_id` embed instead.
    setupSupabaseMock({
      personaId: PERSONA_ID,
      capabilities: ['talleres_crecimiento.participation.read'],
    })
    const ctxResult = await loadParticipanteContext()
    if (!ctxResult.ok) throw new Error('expected ok:true')
    await loadParticipanteActiveTalleres(ctxResult.context)

    const filters = capturedFiltersFor('taller_inscripciones')
    const selectColumns = filters[0]?.selectColumns ?? ''
    // Ghost-column fix: `fecha_completitud` must appear exactly ONCE and
    // only inside the certificate embed (it is not a root column of
    // `taller_inscripciones`).
    const completitudCount = (selectColumns.match(/fecha_completitud/g) ?? []).length
    expect(completitudCount).toBe(1)
    expect(selectColumns).toMatch(/certificado\s*:\s*taller_certificados!inscripcion_id\s*\(/)
    // Abstract taller name comes from the nested embed (PR44 projection fix).
    expect(selectColumns).toMatch(/abstracto\s*:\s*talleres!taller_id\s*\(/)
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
    // T2b — principal OR companero, same as loadParticipanteActiveTalleres.
    const personaFilter = filters.find((f) => f.op === 'or')
    expect(personaFilter?.value).toBe(
      `persona_principal_id.eq.${PERSONA_ID},companero_id.eq.${PERSONA_ID}`,
    )
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

  it('PR44 — does NOT select fecha_completitud from taller_inscripciones (column does not exist)', async () => {
    // Same ghost-column bug as `loadParticipanteActiveTalleres` — the
    // historial select requested `fecha_completitud` from
    // `taller_inscripciones`. PostgREST rejects the column; the helper
    // silently returned []. The completion date is resolved from the
    // certificate embed instead.
    setupSupabaseMock({
      personaId: PERSONA_ID,
      capabilities: ['talleres_crecimiento.participation.read'],
    })
    const ctxResult = await loadParticipanteContext()
    if (!ctxResult.ok) throw new Error('expected ok:true')
    await loadParticipanteHistorial(ctxResult.context)

    const filters = capturedFiltersFor('taller_inscripciones')
    const selectColumns = filters[0]?.selectColumns ?? ''
    // Ghost-column fix: `fecha_completitud` appears exactly ONCE, inside
    // the certificate embed — never as a root column of
    // `taller_inscripciones`.
    const completitudCount = (selectColumns.match(/fecha_completitud/g) ?? []).length
    expect(completitudCount).toBe(1)
    expect(selectColumns).toMatch(/certificado\s*:\s*taller_certificados!inscripcion_id\s*\(/)
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
      // T2c — the viewer's own inscripciones filter (principal OR companero).
      b['or'] = jest.fn((filtro: string) => {
        captured.push({ table, selectColumns: currentCols, column: '', op: 'or', value: filtro })
        return b
      })
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
    // T2c (odd/tasks/talleres-cierre-de-edicion.md) — "ya inscrito" covers
    // the viewer as persona principal OR as companero of a couple, so a
    // companero is never offered "Inscribirme" for an edición they are
    // already in (taller_inscripciones_select lets them read that row).
    expect(inscFilters.find((f) => f.op === 'or')?.value).toBe(
      `persona_principal_id.eq.${PERSONA_ID},companero_id.eq.${PERSONA_ID}`,
    )
    expect(inscFilters.find((f) => f.column === 'persona_principal_id')).toBeUndefined()
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
    // T5 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) — the
    // edición's OWN cierre_inscripcion (never the deprecated periodo
    // table), for "Inscripción hasta {cierre_inscripcion}".
    expect(selectColumns).toMatch(/cierre_inscripcion/)
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
      cierre_inscripcion: '2026-09-15',
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
      b['or'] = jest.fn(() => b)
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
    // T5 — the edición's own cierre_inscripcion, surfaced verbatim.
    expect(row.cierre_inscripcion).toBe('2026-09-15')
  })

  // T6 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) — cupo_completo
  // is derived from talleres_cupo_edicion per edición.
  describe('cupo_completo (T6)', () => {
    function setupWithRpc(rpcImpl?: jest.Mock): void {
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
        capabilities: [],
      })

      const edicionRow = {
        id: 'ed-1',
        nombre_snapshot: 'Septiembre 2026',
        tipo: 'individual',
        estado: 'abierto',
        taller_id: 'taller-1',
        cierre_inscripcion: null,
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
        b['or'] = jest.fn(() => b)
        b['then'] = (resolve: (r: { data: unknown; error: null }) => void) =>
          Promise.resolve(tableResponses[table]).then(resolve)
        return b
      }

      createSupabaseServerClientMock.mockReset().mockResolvedValue({
        auth: {
          getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'auth-1' } }, error: null }),
        },
        from: jest.fn((table: string) => builderFor(table)),
        ...(rpcImpl ? { rpc: rpcImpl } : {}),
      })
    }

    it('is true when talleres_cupo_edicion reports the edición full', async () => {
      const rpc = jest.fn().mockResolvedValue({
        data: [{ cupo: 2, ocupados: 2, disponibles: 0, sobre_cupo: 0 }],
        error: null,
      })
      setupWithRpc(rpc)

      const ctxResult = await loadParticipanteContext()
      if (!ctxResult.ok) throw new Error('expected ok:true')
      const rows = await loadParticipanteExplorar(ctxResult.context)

      expect(rpc).toHaveBeenCalledWith('talleres_cupo_edicion', { p_edicion_id: 'ed-1' })
      expect(rows[0]?.cupo_completo).toBe(true)
    })

    it('is false when there is room left', async () => {
      const rpc = jest.fn().mockResolvedValue({
        data: [{ cupo: 2, ocupados: 1, disponibles: 1, sobre_cupo: 0 }],
        error: null,
      })
      setupWithRpc(rpc)

      const ctxResult = await loadParticipanteContext()
      if (!ctxResult.ok) throw new Error('expected ok:true')
      const rows = await loadParticipanteExplorar(ctxResult.context)

      expect(rows[0]?.cupo_completo).toBe(false)
    })

    it('degrades to false when the client has no rpc method at all (never blocks the page)', async () => {
      setupWithRpc(undefined)

      const ctxResult = await loadParticipanteContext()
      if (!ctxResult.ok) throw new Error('expected ok:true')
      const rows = await loadParticipanteExplorar(ctxResult.context)

      expect(rows[0]?.cupo_completo).toBe(false)
    })
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
      b['or'] = jest.fn(() => b)
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
    // T5 — a legacy row with no cierre_inscripcion column value.
    expect(row.cierre_inscripcion).toBeNull()
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
      b['or'] = jest.fn(() => b)
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

/**
 * PR G (spouse self-enroll) — the explorar row must carry the edicion's
 * `link_type` ('matrimonio' | 'novios' | null) so the client can pass
 * it to `inscribirseATaller` alongside the chosen cónyuge. It lives on
 * `taller_ediciones` (not on the abstract `talleres`), so it is a root
 * column of the Query-1 select.
 */
describe('loadParticipanteExplorar — PR G link_type surfacing', () => {
  it('selects link_type from taller_ediciones', async () => {
    setupSupabaseMock({
      personaId: PERSONA_ID,
      capabilities: ['talleres_crecimiento.participation.read'],
    })
    const ctxResult = await loadParticipanteContext()
    if (!ctxResult.ok) throw new Error('expected ok:true')
    await loadParticipanteExplorar(ctxResult.context)

    const tallerFilters = capturedFiltersFor('taller_ediciones')
    const selectColumns = tallerFilters[0]?.selectColumns ?? ''
    expect(selectColumns).toMatch(/link_type/)
  })

  it('surfaces link_type on a pareja row', async () => {
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
      link_type: 'matrimonio',
      estado: 'abierto',
      taller_id: 'taller-1',
      taller: {
        slug: 'matrimonio-sobre-la-roca',
        nombre: 'Matrimonio sobre la Roca',
        modalidad_default: 'periodo_general',
        descripcion: null,
      },
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
      b['or'] = jest.fn(() => b)
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
    expect(rows[0]!.link_type).toBe('matrimonio')
  })
})

// ─── Certificado deny-by-default ──────────────────────────────────────────

// ─── T2b — one certificate per person in a couple ────────────────────────
//
// odd/tasks/talleres-cierre-de-edicion.md T2b: taller_certificados is keyed
// by (inscripcion_id, persona_id), so a couple inscription carries up to two
// certificate rows and PostgREST returns the `certificado` embed as an ARRAY
// (it was a single object while UNIQUE (inscripcion_id) stood). Each viewer
// must read the completion date of THEIR OWN certificate, in either shape.

const COMPANERO_ID = '00000000-0000-0000-0000-000000000002'

function inscripcionPareja(certificado: unknown) {
  return {
    id: 'insc-1',
    estado: 'aprobado',
    unit_estado: 'completado',
    created_at: '2026-09-01T00:00:00Z',
    taller: {
      id: 'ed-1',
      nombre_snapshot: 'Septiembre 2026',
      tipo: 'pareja',
      estado: 'cerrado',
      abstracto: { id: 't-1', nombre: 'Matrimonio sobre la Roca' },
    },
    certificado,
  }
}

const CERTIFICADOS_PAREJA = [
  { persona_id: COMPANERO_ID, fecha_completitud: '2026-10-28T21:00:00Z' },
  { persona_id: PERSONA_ID, fecha_completitud: '2026-10-29T21:00:00Z' },
]

describe.each([
  ['loadParticipanteActiveTalleres', loadParticipanteActiveTalleres],
  ['loadParticipanteHistorial', loadParticipanteHistorial],
] as const)('%s — T2b certificate per person', (_nombre, loader) => {
  async function cargar(listRows: unknown[]) {
    setupSupabaseMock({ personaId: PERSONA_ID, listRows })
    const ctxResult = await loadParticipanteContext()
    if (!ctxResult.ok) throw new Error('expected ok:true')
    return loader(ctxResult.context)
  }

  it("embeds the certificate's persona_id so the viewer's own row can be picked", async () => {
    await cargar([])
    const selectColumns = capturedFiltersFor('taller_inscripciones')[0]?.selectColumns ?? ''
    expect(selectColumns).toMatch(/certificado\s*:\s*taller_certificados!inscripcion_id\s*\(\s*persona_id\s*,\s*fecha_completitud\s*\)/)
  })

  it("reads the viewer's own completion date when the embed holds both certificates of a couple", async () => {
    const rows = await cargar([inscripcionPareja(CERTIFICADOS_PAREJA)])
    expect(rows).toHaveLength(1)
    expect(rows[0]?.fecha_completitud).toBe('2026-10-29T21:00:00Z')
  })

  it('still reads the single-object embed of an individual inscription', async () => {
    const rows = await cargar([
      inscripcionPareja({ persona_id: PERSONA_ID, fecha_completitud: '2026-10-29T21:00:00Z' }),
    ])
    expect(rows[0]?.fecha_completitud).toBe('2026-10-29T21:00:00Z')
  })

  it("never shows the partner's certificate date as the viewer's", async () => {
    const rows = await cargar([inscripcionPareja([CERTIFICADOS_PAREJA[0]])])
    expect(rows[0]?.fecha_completitud).toBeNull()
  })

  it('has a null date while no certificate exists yet', async () => {
    const rows = await cargar([inscripcionPareja([]), inscripcionPareja(null)])
    expect(rows.map((r) => r.fecha_completitud)).toEqual([null, null])
  })
})

describe('loadParticipanteCertificado(s) — T2b nombre_pareja_snapshot', () => {
  const CERT = {
    id: 'cert-1',
    codigo_verificacion: 'abcdefghijkmnpqr',
    taller_id: 'ed-1',
    persona_id: PERSONA_ID,
    nombre_taller_snapshot: 'Matrimonio sobre la Roca',
    fecha_completitud: '2026-10-29T21:00:00Z',
    revocado_at: null,
  }

  it("selects and exposes the partner's name on a single certificado", async () => {
    setupSupabaseMock({ personaId: PERSONA_ID, rows: [{ ...CERT, nombre_pareja_snapshot: 'Luis Pérez' }] })
    const ctxResult = await loadParticipanteContext()
    if (!ctxResult.ok) throw new Error('expected ok:true')
    const cert = await loadParticipanteCertificado(ctxResult.context, 'cert-1')
    expect(capturedFiltersFor('taller_certificados')[0]?.selectColumns).toMatch(/nombre_pareja_snapshot/)
    expect(cert?.nombre_pareja_snapshot).toBe('Luis Pérez')
  })

  it('is null for an individual certificado', async () => {
    setupSupabaseMock({ personaId: PERSONA_ID, rows: [{ ...CERT, nombre_pareja_snapshot: null }] })
    const ctxResult = await loadParticipanteContext()
    if (!ctxResult.ok) throw new Error('expected ok:true')
    const cert = await loadParticipanteCertificado(ctxResult.context, 'cert-1')
    expect(cert?.nombre_pareja_snapshot).toBeNull()
  })

  it("lists the viewer's certificados with the partner's name", async () => {
    setupSupabaseMock({ personaId: PERSONA_ID, listRows: [{ ...CERT, nombre_pareja_snapshot: 'Luis Pérez' }] })
    const ctxResult = await loadParticipanteContext()
    if (!ctxResult.ok) throw new Error('expected ok:true')
    const certs = await loadParticipanteCertificados(ctxResult.context)
    expect(capturedFiltersFor('taller_certificados')[0]?.selectColumns).toMatch(/nombre_pareja_snapshot/)
    expect(certs[0]?.nombre_pareja_snapshot).toBe('Luis Pérez')
  })
})

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
