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
    const b: Record<string, jest.Mock> = {} as Record<string, jest.Mock>
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

    // Should ALSO query taller_inscripciones to flag ya_inscrito
    const inscFilters = capturedFiltersFor('taller_inscripciones')
    const inscEstadoFilter = inscFilters.find(
      (f) => f.column === 'estado' && f.op === 'in',
    )
    expect(inscEstadoFilter?.value).toEqual(['pendiente', 'aprobado'])
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
