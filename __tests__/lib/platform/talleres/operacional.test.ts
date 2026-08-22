/**
 * @jest-environment node
 *
 * PR19 — DT-081 — Tests for the operacional (L / C / D) surface.
 *
 * Covers:
 *   - kill switch: loadOperacionalContext returns ok:false when the
 *     talleres flag is off
 *   - role resolution: a user with director.read is D, with
 *     coordinator.read is C, with lead.read is L; multi-role ⇒ highest
 *     wins (D > C > L)
 *   - L: loadEquipoGrupos queries taller_grupo_asignaciones filtered
 *     by persona_id + activo + rol='lider'
 *   - C: loadCoordInscripcionesPendientes filters by estado='pendiente'
 *   - D: loadDirResumen aggregates counts across 4 tables
 *   - ownership: loadEquipoReporte is grouped by grupo_id but the
 *     owner check is done in the page; the helper itself returns the
 *     latest reporte for the grupo.
 */

import {
  loadOperacionalContext,
  loadEquipoGrupos,
  loadEquipoReporte,
  loadCoordInscripcionesPendientes,
  loadCoordTalleresAgrupados,
  loadDirResumen,
  loadEdicionLocalDetalle,
} from '@/lib/platform/talleres/operacional'
import type { OperacionalContext } from '@/lib/platform/talleres/operacional'

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
  capabilities?: Array<string | { key: string; scopeId?: string }>
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
          capabilities: (opts.capabilities ?? []).map((c) => {
            const key = typeof c === 'string' ? c : c.key
            const scopeId = typeof c === 'string' ? undefined : c.scopeId
            return {
              key,
              experience: 'talleres_crecimiento',
              scopeType: 'taller',
              scopeId,
              source: 'test',
            }
          }),
        }
      : null,
  )

  let currentTable = ''
  let currentCols = ''
  function builder() {
    const b: Record<string, jest.Mock> = {} as Record<string, jest.Mock>
    b['select'] = jest.fn((cols: string) => {
      currentCols = cols
      return b
    })
    b['eq'] = jest.fn((column: string, value: unknown) => {
      captured.push({ table: currentTable, selectColumns: currentCols, column, op: 'eq', value })
      return b
    })
    b['in'] = jest.fn((column: string, value: unknown) => {
      captured.push({ table: currentTable, selectColumns: currentCols, column, op: 'in', value })
      return b
    })
    b['order'] = jest.fn(() => b)
    b['limit'] = jest.fn(() => b)
    b['is'] = jest.fn((column: string, value: unknown) => {
      captured.push({ table: currentTable, selectColumns: currentCols, column, op: 'eq', value })
      return b
    })
    b['maybeSingle'] = jest.fn(() => Promise.resolve({ data: null, error: null }))
    b['single'] = jest.fn(() => Promise.resolve({ data: null, error: null }))
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

// ─── loadOperacionalContext — gate + role ────────────────────────────────

describe('loadOperacionalContext — gate + role resolution', () => {
  it('returns ok:false when feature flag is off (kill switch)', async () => {
    setupSupabaseMock({
      isEnabled: false,
      personaId: PERSONA_ID,
      capabilities: ['talleres_crecimiento.lead.read'],
    })
    const result = await loadOperacionalContext()
    expect(result.ok).toBe(false)
  })

  it('returns ok:false when user is unauthenticated', async () => {
    setupSupabaseMock({ user: null })
    const result = await loadOperacionalContext()
    expect(result.ok).toBe(false)
  })

  it('returns ok:false when persona cannot be resolved', async () => {
    setupSupabaseMock({ personaId: null, capabilities: ['talleres_crecimiento.lead.read'] })
    const result = await loadOperacionalContext()
    expect(result.ok).toBe(false)
  })

  it('returns ok:false when no operational role capability is held', async () => {
    setupSupabaseMock({
      personaId: PERSONA_ID,
      capabilities: ['talleres_crecimiento.participation.read'],
    })
    const result = await loadOperacionalContext()
    expect(result.ok).toBe(false)
  })

  it('L role resolves when lead.read is held', async () => {
    setupSupabaseMock({
      personaId: PERSONA_ID,
      capabilities: ['talleres_crecimiento.lead.read'],
    })
    const result = await loadOperacionalContext()
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.context.role).toBe('L')
  })

  it('L role also matches volunteer.read', async () => {
    setupSupabaseMock({
      personaId: PERSONA_ID,
      capabilities: ['talleres_crecimiento.volunteer.read'],
    })
    const result = await loadOperacionalContext()
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.context.role).toBe('L')
  })

  it('C role resolves when coordinator.read is held', async () => {
    setupSupabaseMock({
      personaId: PERSONA_ID,
      capabilities: ['talleres_crecimiento.coordinator.read'],
    })
    const result = await loadOperacionalContext()
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.context.role).toBe('C')
  })

  it('D role resolves when director.read is held', async () => {
    setupSupabaseMock({
      personaId: PERSONA_ID,
      capabilities: ['talleres_crecimiento.director.read'],
    })
    const result = await loadOperacionalContext()
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.context.role).toBe('D')
  })

  it('metrics.read alone does NOT resolve D (not a role discriminator)', async () => {
    // metrics.read is auto-granted to BOTH director and coordinador
    // (20260810120000_talleres_role_auto_grant.sql:72-82), so on its own
    // it cannot discriminate the role. Alone ⇒ no operational role.
    setupSupabaseMock({
      personaId: PERSONA_ID,
      capabilities: ['talleres_crecimiento.metrics.read'],
    })
    const result = await loadOperacionalContext()
    expect(result.ok).toBe(false)
  })

  it('coordinador con metrics.read NO es D — resuelve C (landmine fix)', async () => {
    // The landmine: a coordinador is auto-granted metrics.read. If
    // resolveRole treated metrics.read as a D signal the coordinador would
    // be promoted to GLOBAL director in the UI. It must stay C.
    setupSupabaseMock({
      personaId: PERSONA_ID,
      capabilities: [
        'talleres_crecimiento.coordinator.read',
        'talleres_crecimiento.metrics.read',
      ],
    })
    const result = await loadOperacionalContext()
    if (!result.ok) throw new Error('expected ok')
    expect(result.context.role).toBe('C')
  })

  it('D role resolves via admin.manage (global admin)', async () => {
    setupSupabaseMock({
      personaId: PERSONA_ID,
      capabilities: ['talleres_crecimiento.admin.manage'],
    })
    const result = await loadOperacionalContext()
    if (!result.ok) throw new Error('expected ok')
    expect(result.context.role).toBe('D')
  })

  it('multi-role: D > C > L — director caps dominate', async () => {
    setupSupabaseMock({
      personaId: PERSONA_ID,
      capabilities: [
        'talleres_crecimiento.lead.read',
        'talleres_crecimiento.coordinator.read',
        'talleres_crecimiento.director.read',
      ],
    })
    const result = await loadOperacionalContext()
    if (!result.ok) throw new Error('expected ok')
    expect(result.context.role).toBe('D')
  })

  it('multi-role: C > L when no D caps', async () => {
    setupSupabaseMock({
      personaId: PERSONA_ID,
      capabilities: [
        'talleres_crecimiento.lead.read',
        'talleres_crecimiento.coordinator.read',
      ],
    })
    const result = await loadOperacionalContext()
    if (!result.ok) throw new Error('expected ok')
    expect(result.context.role).toBe('C')
  })
})

// ─── scopedEquipoIds — coordinator scope surfaced in context ─────────────

describe('scopedEquipoIds — coordinator scope surfaced in context', () => {
  it('collects the equipo id from scoped coordinator.* grants', async () => {
    setupSupabaseMock({
      personaId: PERSONA_ID,
      capabilities: [
        { key: 'talleres_crecimiento.coordinator.read', scopeId: 'equipo-A' },
        { key: 'talleres_crecimiento.coordinator.write', scopeId: 'equipo-A' },
        { key: 'talleres_crecimiento.metrics.read', scopeId: 'equipo-A' },
      ],
    })
    const result = await loadOperacionalContext()
    if (!result.ok) throw new Error('expected ok')
    expect(result.context.role).toBe('C')
    expect([...result.context.scopedEquipoIds]).toEqual(['equipo-A'])
  })

  it('is empty for a global director (no coordinator.* grants)', async () => {
    setupSupabaseMock({
      personaId: PERSONA_ID,
      capabilities: ['talleres_crecimiento.director.read'],
    })
    const result = await loadOperacionalContext()
    if (!result.ok) throw new Error('expected ok')
    expect(result.context.role).toBe('D')
    expect([...result.context.scopedEquipoIds]).toEqual([])
  })

  it('dedupes multiple scoped grants across distinct equipos', async () => {
    setupSupabaseMock({
      personaId: PERSONA_ID,
      capabilities: [
        { key: 'talleres_crecimiento.coordinator.read', scopeId: 'equipo-A' },
        { key: 'talleres_crecimiento.coordinator.read', scopeId: 'equipo-B' },
        { key: 'talleres_crecimiento.coordinator.write', scopeId: 'equipo-A' },
      ],
    })
    const result = await loadOperacionalContext()
    if (!result.ok) throw new Error('expected ok')
    expect([...result.context.scopedEquipoIds].sort()).toEqual(['equipo-A', 'equipo-B'])
  })

  it('ignores coordinator.* grants without a scopeId (global-ish)', async () => {
    setupSupabaseMock({
      personaId: PERSONA_ID,
      capabilities: ['talleres_crecimiento.coordinator.read'],
    })
    const result = await loadOperacionalContext()
    if (!result.ok) throw new Error('expected ok')
    expect(result.context.role).toBe('C')
    expect([...result.context.scopedEquipoIds]).toEqual([])
  })
})

// ─── Equipo (L) ──────────────────────────────────────────────────────────

describe('loadEquipoGrupos — owner-scoped via asignaciones', () => {
  it('queries taller_grupo_asignaciones filtered by persona + activo + lider', async () => {
    setupSupabaseMock({
      personaId: PERSONA_ID,
      capabilities: ['talleres_crecimiento.lead.read'],
    })
    const ctxResult = await loadOperacionalContext()
    if (!ctxResult.ok) throw new Error('expected ok')
    await loadEquipoGrupos(ctxResult.context)

    const filters = capturedFiltersFor('taller_grupo_asignaciones')
    expect(filters.some((f) => f.column === 'persona_id' && f.value === PERSONA_ID)).toBe(true)
    expect(filters.some((f) => f.column === 'activo' && f.value === true)).toBe(true)
    expect(filters.some((f) => f.column === 'rol' && f.value === 'lider')).toBe(true)
  })
})

describe('loadEquipoReporte — single latest reporte by grupo', () => {
  it('queries taller_reportes filtered by grupo_id', async () => {
    setupSupabaseMock({
      personaId: PERSONA_ID,
      capabilities: ['talleres_crecimiento.lead.read'],
    })
    const ctxResult = await loadOperacionalContext()
    if (!ctxResult.ok) throw new Error('expected ok')
    await loadEquipoReporte(ctxResult.context, 'g-1')

    const filters = capturedFiltersFor('taller_reportes')
    expect(filters.some((f) => f.column === 'grupo_id' && f.value === 'g-1')).toBe(true)
    // Leader's own reporte view — includes observaciones_generales (the
    // leader's own report); excludes JSONB blobs and PII.
    const selectColumns = filters[0]?.selectColumns ?? ''
    expect(selectColumns).toMatch(/observaciones_generales/)
    expect(selectColumns).not.toMatch(/firmantes_snapshot/)
  })
})

// ─── Coordinacion (C) ────────────────────────────────────────────────────

describe('loadCoordInscripcionesPendientes — only pendiente', () => {
  it('filters taller_inscripciones by estado=pendiente', async () => {
    setupSupabaseMock({
      personaId: PERSONA_ID,
      capabilities: ['talleres_crecimiento.coordinator.read'],
    })
    const ctxResult = await loadOperacionalContext()
    if (!ctxResult.ok) throw new Error('expected ok')
    await loadCoordInscripcionesPendientes(ctxResult.context)

    const filters = capturedFiltersFor('taller_inscripciones')
    const estadoFilter = filters.find((f) => f.column === 'estado')
    expect(estadoFilter?.value).toBe('pendiente')
  })
})

// ─── Direccion (D) ────────────────────────────────────────────────────────

describe('loadDirResumen — counts across 4 tables', () => {
  it('queries taller_ediciones filtered to abierto|en_curso', async () => {
    setupSupabaseMock({
      personaId: PERSONA_ID,
      capabilities: ['talleres_crecimiento.director.read'],
    })
    const ctxResult = await loadOperacionalContext()
    if (!ctxResult.ok) throw new Error('expected ok')
    await loadDirResumen(ctxResult.context)

    // taller_ediciones: estado in [abierto, en_curso]
    const tallerFilters = capturedFiltersFor('taller_ediciones')
    expect(
      tallerFilters.some(
        (f) => f.column === 'estado' && Array.isArray(f.value) && (f.value as string[]).includes('abierto'),
      ),
    ).toBe(true)
    expect(
      tallerFilters.some(
        (f) => f.column === 'estado' && Array.isArray(f.value) && (f.value as string[]).includes('en_curso'),
      ),
    ).toBe(true)
  })

  it('queries taller_inscripciones by estado=pendiente', async () => {
    setupSupabaseMock({
      personaId: PERSONA_ID,
      capabilities: ['talleres_crecimiento.director.read'],
    })
    const ctxResult = await loadOperacionalContext()
    if (!ctxResult.ok) throw new Error('expected ok')
    await loadDirResumen(ctxResult.context)

    const inscFilters = capturedFiltersFor('taller_inscripciones')
    expect(inscFilters.some((f) => f.column === 'estado' && f.value === 'pendiente')).toBe(true)
  })

  it('queries taller_solicitudes_retiro by estado=pendiente', async () => {
    setupSupabaseMock({
      personaId: PERSONA_ID,
      capabilities: ['talleres_crecimiento.director.read'],
    })
    const ctxResult = await loadOperacionalContext()
    if (!ctxResult.ok) throw new Error('expected ok')
    await loadDirResumen(ctxResult.context)

    const solicitudFilters = capturedFiltersFor('taller_solicitudes_retiro')
    expect(solicitudFilters.some((f) => f.column === 'estado' && f.value === 'pendiente')).toBe(true)
  })

  it('queries taller_certificados filtering revoked out (revocado_at IS NULL)', async () => {
    setupSupabaseMock({
      personaId: PERSONA_ID,
      capabilities: ['talleres_crecimiento.director.read'],
    })
    const ctxResult = await loadOperacionalContext()
    if (!ctxResult.ok) throw new Error('expected ok')
    await loadDirResumen(ctxResult.context)

    const certFilters = capturedFiltersFor('taller_certificados')
    expect(certFilters.some((f) => f.column === 'revocado_at' && f.value === null)).toBe(true)
  })
})

// ─── PR34 — loadEdicionLocalDetalle ──────────────────────────────────────

/**
 * Build a thenable supabase mock keyed by table.
 *
 * The helper does 6 queries:
 *   1. taller_ediciones → maybeSingle → row|error
 *   2. talleres_crecimiento_cohortes → maybeSingle → row|null
 *   3. taller_periodos_generales → maybeSingle → row|null
 *   4. taller_inscripciones → head count (total)
 *   5. taller_inscripciones → head count (aprobadas/pendientes)
 *   6. taller_certificados → head count
 *
 * Each table-specific builder is a thenable (Promise-like) so the
 * awaited `select({count,head}).eq(...)` chains resolve to the
 * configured count. taller_inscripciones distinguishes total vs
 * aprobadas via the last `.in(...)` filter — when present, the
 * aprobadas count is returned, otherwise the total.
 */
function buildEdicionDetalleClientMock(opts: {
  edicion: unknown
  cohorte?: unknown
  periodo?: unknown
  inscripcionesTotal?: number
  inscripcionesAprobadas?: number
  certificados?: number
}): { from: jest.Mock; calls: string[]; filters: Array<{ table: string; column: string; value: unknown; op: 'eq' | 'in' }> } {
  const calls: string[] = []
  const filters: Array<{ table: string; column: string; value: unknown; op: 'eq' | 'in' }> = []

  function makeBuilder(table: string): unknown {
    let lastFilter: { column: string; value: unknown; isIn?: boolean } | null = null
    const b: Record<string, unknown> = {}
    b['select'] = jest.fn(() => b)
    b['eq'] = jest.fn((column: string, value: unknown) => {
      lastFilter = { column, value }
      filters.push({ table, column, value, op: 'eq' })
      return b
    })
    b['in'] = jest.fn((column: string, value: unknown) => {
      lastFilter = { column, value, isIn: true }
      filters.push({ table, column, value, op: 'in' })
      return b
    })
    b['order'] = jest.fn(() => b)
    b['limit'] = jest.fn(() => b)
    b['maybeSingle'] = jest.fn(() => {
      if (table === 'taller_ediciones') {
        return Promise.resolve({ data: opts.edicion ?? null, error: null })
      }
      if (table === 'talleres_crecimiento_cohortes') {
        return Promise.resolve({ data: opts.cohorte ?? null, error: null })
      }
      if (table === 'taller_periodos_generales') {
        return Promise.resolve({ data: opts.periodo ?? null, error: null })
      }
      return Promise.resolve({ data: null, error: null })
    })
    // Make the builder thenable. The helper destructures `{ count }`
    // from the awaited result of head queries, so when awaited we
    // return the right count per table.
    Object.defineProperty(b, 'then', {
      value: (resolve: (v: unknown) => void) => {
        if (table === 'taller_certificados') {
          resolve({ count: opts.certificados ?? 0, error: null })
          return
        }
        if (table === 'taller_inscripciones') {
          if (lastFilter?.isIn) {
            resolve({ count: opts.inscripcionesAprobadas ?? 0, error: null })
            return
          }
          resolve({ count: opts.inscripcionesTotal ?? 0, error: null })
          return
        }
        resolve({ count: 0, error: null })
      },
    })
    return b
  }

  return {
    calls,
    filters,
    from: jest.fn((table: string) => {
      calls.push(table)
      return makeBuilder(table)
    }),
  }
}

describe('loadEdicionLocalDetalle — joins edicion + taller + cohorte + periodo + counts', () => {
  const fullEdicion = {
    id: 'e-1',
    taller_id: 't-1',
    nombre_snapshot: 'Otoño 2026',
    tipo: 'pareja',
    link_type: 'matrimonio',
    modalidad_inscripcion: 'periodo_general',
    estado: 'abierto',
    sesiones_snapshot: 8,
    duracion_estimada_minutos_snapshot: 90,
    firmantes: [
      { persona_id: 'p-1', rol_etiqueta: 'Director', orden: 1 },
      { persona_id: 'p-2', rol_etiqueta: 'Coordinador', orden: 2 },
    ],
    periodo_general_id: 'pg-1',
    talleres: {
      id: 't-1',
      slug: 'matrimonio-sobre-la-roca',
      nombre: 'Matrimonio sobre la Roca',
      estado: 'active',
    },
  }

  const fullCohorte = {
    id: 'c-1',
    dream_team_equipo_id: 'eq-1',
    edicion: 'Otoño 2026',
    started_at: '2026-09-01T00:00:00Z',
    ended_at: null,
  }

  const fullPeriodo = {
    id: 'pg-1',
    fecha_apertura_automatica: '2026-08-01T00:00:00Z',
    fecha_cierre_automatica: '2026-11-30T00:00:00Z',
    fecha_apertura_manual: null,
    fecha_cierre_manual: null,
    fecha_cierre_real: null,
    motivo_cierre: null,
  }

  it('returns null when taller_ediciones has no row for the given id', async () => {
    const { from } = buildEdicionDetalleClientMock({ edicion: null })
    const result = await loadEdicionLocalDetalle({ from }, 'e-1')
    expect(result).toBeNull()
  })

  it('returns a fully-hydrated EdicionLocalDetalle when all joins succeed', async () => {
    const { from } = buildEdicionDetalleClientMock({
      edicion: fullEdicion,
      cohorte: fullCohorte,
      periodo: fullPeriodo,
      inscripcionesTotal: 12,
      inscripcionesAprobadas: 8,
      certificados: 3,
    })
    const result = await loadEdicionLocalDetalle({ from }, 'e-1')
    expect(result).not.toBeNull()
    if (!result) return

    expect(result.id).toBe('e-1')
    expect(result.taller_id).toBe('t-1')
    expect(result.taller_slug).toBe('matrimonio-sobre-la-roca')
    expect(result.taller_nombre).toBe('Matrimonio sobre la Roca')
    expect(result.nombre_snapshot).toBe('Otoño 2026')
    expect(result.tipo).toBe('pareja')
    expect(result.link_type).toBe('matrimonio')
    expect(result.modalidad_inscripcion).toBe('periodo_general')
    expect(result.estado).toBe('abierto')
    expect(result.sesiones_snapshot).toBe(8)
    expect(result.duracion_estimada_minutos_snapshot).toBe(90)
    expect(result.firmantes).toHaveLength(2)
    expect(result.firmantes[0]?.persona_id).toBe('p-1')

    expect(result.cohorte).not.toBeNull()
    expect(result.cohorte?.id).toBe('c-1')
    expect(result.cohorte?.dream_team_equipo_id).toBe('eq-1')
    expect(result.cohorte?.edicion).toBe('Otoño 2026')

    expect(result.periodo_general).not.toBeNull()
    expect(result.periodo_general?.id).toBe('pg-1')

    expect(result.inscripciones_count).toBe(12)
    expect(result.inscripciones_aprobadas_count).toBe(8)
    expect(result.certificados_count).toBe(3)
  })

  it('PR42 — cohorte + inscripciones + certificados queries filter by edicion.id (NOT the abstract taller_id)', async () => {
    // Bug #3 + #4 — the previous implementation filtered the
    // cohorte, inscripciones, and certificados queries by
    // `edicionRow.taller_id` (the *abstract* taller id), which
    // always returned 0 rows because the FK edge targets
    // `taller_ediciones(id)`. The fix uses `edicionRow.id` (the
    // edicion's own primary key).
    const { from, filters } = buildEdicionDetalleClientMock({
      edicion: fullEdicion,
      cohorte: fullCohorte,
      periodo: fullPeriodo,
      inscripcionesTotal: 12,
      inscripcionesAprobadas: 8,
      certificados: 3,
    })
    await loadEdicionLocalDetalle({ from }, 'e-1')

    // The taller_id filter ALWAYS equals the edicion id (e-1), NEITHER
    // the abstract taller id (t-1) NOR the taller.slug.
    const tallerIdFilters = filters.filter((f) => f.column === 'taller_id')
    expect(tallerIdFilters.length).toBeGreaterThanOrEqual(4)
    for (const f of tallerIdFilters) {
      expect(f.value).toBe('e-1')
      expect(f.value).not.toBe('t-1')
    }
  })

  it('returns cohorte=null and periodo_general=null when those joins miss', async () => {
    const permanenteEdicion = {
      ...fullEdicion,
      id: 'e-2',
      taller_id: 't-2',
      nombre_snapshot: 'Permanente',
      tipo: 'individual' as const,
      link_type: null,
      modalidad_inscripcion: 'permanente_custom' as const,
      estado: 'borrador' as const,
      sesiones_snapshot: 4,
      duracion_estimada_minutos_snapshot: 60,
      firmantes: [],
      periodo_general_id: null,
      talleres: {
        id: 't-2',
        slug: 'discipulado-1',
        nombre: 'Discipulado 1',
        estado: 'active',
      },
    }
    const { from } = buildEdicionDetalleClientMock({
      edicion: permanenteEdicion,
      // No cohorte, no periodo.
      inscripcionesTotal: 0,
      inscripcionesAprobadas: 0,
      certificados: 0,
    })

    const result = await loadEdicionLocalDetalle({ from }, 'e-2')
    expect(result).not.toBeNull()
    if (!result) return

    expect(result.cohorte).toBeNull()
    expect(result.periodo_general).toBeNull()
    expect(result.firmantes).toEqual([])
    expect(result.link_type).toBeNull()
    expect(result.modalidad_inscripcion).toBe('permanente_custom')
    expect(result.inscripciones_count).toBe(0)
    expect(result.inscripciones_aprobadas_count).toBe(0)
    expect(result.certificados_count).toBe(0)
  })
})

// ─── loadCoordTalleresAgrupados — group ediciones under their abstract taller ──
//
// The Coordinación surface must show DISTINCT talleres (the abstract offering),
// not one card/count per edición. This loader reads taller_ediciones, embeds the
// abstract talleres(nombre), and groups by taller_id. Orphan ediciones (taller_id
// NULL — best-effort backfill missed) fall back to their own singleton group.

/**
 * Thenable client mock: `.from(t).select(cols).order()` awaits to
 * { data: rows, error }. Records the select columns for assertion.
 */
function buildAgrupadosClientMock(
  rows: unknown[],
  error: unknown = null
): { from: jest.Mock; selectCols: string[] } {
  const selectCols: string[] = []
  const from = jest.fn(() => {
    const b: Record<string, unknown> = {}
    b['select'] = jest.fn((cols: string) => {
      selectCols.push(cols)
      return b
    })
    b['order'] = jest.fn(() => b)
    Object.defineProperty(b, 'then', {
      value: (resolve: (v: unknown) => void) => resolve({ data: rows, error }),
    })
    return b
  }) as jest.Mock
  return { from, selectCols }
}

function agrupadosCtx(from: jest.Mock): OperacionalContext {
  return {
    supabase: { from },
    personaId: PERSONA_ID,
    role: 'C',
    capabilities: [],
  } as unknown as OperacionalContext
}

describe('loadCoordTalleresAgrupados — group ediciones by abstract taller', () => {
  it('selects taller_id and embeds the abstract talleres(nombre)', async () => {
    const { from, selectCols } = buildAgrupadosClientMock([])
    await loadCoordTalleresAgrupados(agrupadosCtx(from))
    expect(selectCols[0]).toMatch(/taller_id/)
    expect(selectCols[0]).toMatch(/talleres\s*\(/)
  })

  it('groups multiple ediciones under one taller (distinct talleres, not ediciones)', async () => {
    const rows = [
      {
        id: 'e-1',
        taller_id: 't-1',
        nombre_snapshot: 'Septiembre 2026',
        tipo: 'individual',
        estado: 'borrador',
        talleres: { id: 't-1', nombre: 'Matrimonio sobre la Roca' },
      },
      {
        id: 'e-2',
        taller_id: 't-1',
        nombre_snapshot: 'Octubre 2026',
        tipo: 'pareja',
        estado: 'abierto',
        talleres: { id: 't-1', nombre: 'Matrimonio sobre la Roca' },
      },
      {
        id: 'e-3',
        taller_id: 't-2',
        nombre_snapshot: 'Cohorte 1',
        tipo: 'individual',
        estado: 'borrador',
        talleres: { id: 't-2', nombre: 'Discipulado 1' },
      },
    ]
    const { from } = buildAgrupadosClientMock(rows)
    const groups = await loadCoordTalleresAgrupados(agrupadosCtx(from))

    expect(groups).toHaveLength(2) // distinct talleres, NOT 3 ediciones
    const roca = groups.find((g) => g.taller_id === 't-1')
    expect(roca?.taller_nombre).toBe('Matrimonio sobre la Roca')
    expect(roca?.ediciones).toHaveLength(2)
    expect(roca?.ediciones.map((e) => e.id)).toEqual(['e-1', 'e-2'])

    const disc = groups.find((g) => g.taller_id === 't-2')
    expect(disc?.ediciones).toHaveLength(1)
    expect(disc?.ediciones[0]?.estado).toBe('borrador')
  })

  it('falls back to a singleton group labeled by nombre_snapshot when taller_id is null', async () => {
    const rows = [
      {
        id: 'e-9',
        taller_id: null,
        nombre_snapshot: 'Edición huérfana',
        tipo: 'individual',
        estado: 'borrador',
        talleres: null,
      },
    ]
    const { from } = buildAgrupadosClientMock(rows)
    const groups = await loadCoordTalleresAgrupados(agrupadosCtx(from))
    expect(groups).toHaveLength(1)
    expect(groups[0]?.taller_nombre).toBe('Edición huérfana')
    expect(groups[0]?.ediciones).toHaveLength(1)
  })

  it('returns [] on query error', async () => {
    const { from } = buildAgrupadosClientMock(null as unknown as unknown[], {
      message: 'boom',
    })
    const groups = await loadCoordTalleresAgrupados(agrupadosCtx(from))
    expect(groups).toEqual([])
  })
})
