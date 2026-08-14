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
  loadDirResumen,
} from '@/lib/platform/talleres/operacional'

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

  it('D role also matches metrics.read', async () => {
    setupSupabaseMock({
      personaId: PERSONA_ID,
      capabilities: ['talleres_crecimiento.metrics.read'],
    })
    const result = await loadOperacionalContext()
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.context.role).toBe('D')
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
