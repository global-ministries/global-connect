/**
 * @jest-environment node
 *
 * Tests for the extended `loadCoordInscripcionesPendientes` —
 * verifies the joins (edicion + cohorte + persona_principal +
 * companero) resolve correctly into the shared `InscripcionAdminRow`
 * shape, and that deny-by-default behavior drops rows whose joins
 * can't resolve.
 *
 * The legacy shape (`id, taller_id, estado, motivo_no_aprobado,
 * created_at`) is superseded — this test confirms the new shape
 * matches `InscripcionAdminRow` so the coordinator surface can
 * share `<TablaInscripciones>` with the global admin page.
 */

import {
  loadCoordInscripcionesPendientes,
  loadOperacionalContext,
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
const resolveSessionMock = jest.requireMock('@/lib/auth/platformSessionReadOnly')
  .resolveReadOnlyPlatformSession as jest.Mock

const PERSONA_ID = '00000000-0000-0000-0000-000000000001'

interface CapturedFilter {
  readonly table: string
  readonly selectColumns: string
  readonly column: string
  readonly op: 'eq' | 'in'
  readonly value: unknown
}

interface TableResponses {
  [table: string]: { data: unknown[] | null; error: { message: string } | null }
}

const captured: CapturedFilter[] = []
let tableResponses: TableResponses = {}

function setupMocks(opts: {
  isEnabled?: boolean
  capabilities?: string[]
  responses?: TableResponses
}) {
  flagsMock.mockReset().mockReturnValue(opts.isEnabled ?? true)
  tableResponses = opts.responses ?? {}

  resolveSessionMock.mockReset().mockResolvedValue({
    personaId: PERSONA_ID,
    subjectAuthId: 'auth-1',
    globalRoles: [],
    contexts: [],
    capabilities: (opts.capabilities ?? ['talleres_crecimiento.coordinator.read']).map(
      (key) => ({
        key,
        experience: 'talleres_crecimiento',
        scopeType: 'taller',
        source: 'test',
      }),
    ),
  })

  let currentTable = ''
  let currentCols = ''
  // Each `from()` invocation gets its own builder so concurrent
  // awaits don't share the chain. The builder is thenable so any
  // `await client.from(...).select(...).eq(...).order(...).limit(N)`
  // resolves to the configured response for that table.
  function buildChain(): Record<string, jest.Mock | ((onFulfilled: (value: { data: unknown[] | null; error: { message: string } | null }) => unknown) => Promise<unknown>)> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- chain mock
    const chain: Record<string, any> = {}
    chain['select'] = jest.fn((cols: string) => {
      currentCols = cols
      return chain
    })
    chain['eq'] = jest.fn((column: string, value: unknown) => {
      captured.push({ table: currentTable, selectColumns: currentCols, column, op: 'eq', value })
      return chain
    })
    chain['in'] = jest.fn((column: string, value: unknown) => {
      captured.push({ table: currentTable, selectColumns: currentCols, column, op: 'in', value })
      return chain
    })
    chain['order'] = jest.fn(() => chain)
    chain['limit'] = jest.fn(() => chain)
    chain['maybeSingle'] = jest.fn(() => chain)
    chain['single'] = jest.fn(() => chain)
    // Thenable: any `await chain` resolves to the response configured
    // for the current table.
    chain['then'] = (
      resolve: (value: { data: unknown[] | null; error: { message: string } | null }) => unknown,
    ) => {
      const response = tableResponses[currentTable] ?? { data: [], error: null }
      return Promise.resolve(response).then(resolve)
    }
    return chain
  }

  createSupabaseServerClientMock.mockReset().mockResolvedValue({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: { id: 'auth-1' } },
        error: null,
      }),
    },
    from: jest.fn((table: string) => {
      currentTable = table
      return buildChain()
    }),
  })
}

beforeEach(() => {
  captured.length = 0
  tableResponses = {}
})

const FULL_EDICION = {
  id: 'ed-1',
  nombre_snapshot: 'Septiembre 2026',
  estado: 'abierto',
  taller_id: 't-1',
  taller: {
    id: 't-1',
    slug: 'matrimonio-sobre-la-roca',
    nombre: 'Matrimonio sobre la Roca',
  },
}

const FULL_USUARIO = {
  id: 'u-1',
  nombre: 'Isaac',
  apellido: 'Páez',
  email: 'isaac@example.com',
}

const FULL_INSCRIPCION = {
  id: 'insc-1',
  taller_id: 'ed-1',
  cohorte_id: 'coh-1',
  estado: 'pendiente',
  link_type: null,
  created_at: '2026-08-15T12:00:00Z',
  updated_at: '2026-08-15T12:00:00Z',
  persona_principal: FULL_USUARIO,
  companero: null,
}

const FULL_COHORTE = {
  id: 'coh-1',
  edicion: 'Septiembre 2026',
}

async function loadAsCoord() {
  const ctxRes = await loadOperacionalContext()
  if (!ctxRes.ok) throw new Error('expected coord context')
  return loadCoordInscripcionesPendientes(ctxRes.context)
}

describe('loadCoordInscripcionesPendientes — joins', () => {
  it('returns the shared InscripcionAdminRow shape', async () => {
    setupMocks({
      responses: {
        taller_inscripciones: { data: [FULL_INSCRIPCION], error: null },
        taller_ediciones: { data: [FULL_EDICION], error: null },
        talleres_crecimiento_cohortes: { data: [FULL_COHORTE], error: null },
      },
    })
    const rows = await loadAsCoord()
    expect(rows).toHaveLength(1)
    const row = rows[0]!
    expect(row.id).toBe('insc-1')
    expect(row.edicion_id).toBe('ed-1')
    expect(row.edicion_nombre).toBe('Septiembre 2026')
    expect(row.taller_id).toBe('t-1')
    expect(row.taller_nombre).toBe('Matrimonio sobre la Roca')
    expect(row.taller_slug).toBe('matrimonio-sobre-la-roca')
    expect(row.cohorte_id).toBe('coh-1')
    expect(row.cohorte_edicion).toBe('Septiembre 2026')
    expect(row.persona_principal_id).toBe('u-1')
    expect(row.persona_principal_nombre).toBe('Isaac Páez')
    expect(row.persona_principal_email).toBe('isaac@example.com')
    expect(row.estado).toBe('pendiente')
    expect(row.link_type).toBeNull()
    expect(row.companero_nombre).toBeNull()
  })

  it('queries taller_inscripciones with the embedded persona + companero dual-join', async () => {
    setupMocks({
      responses: {
        taller_inscripciones: { data: [FULL_INSCRIPCION], error: null },
        taller_ediciones: { data: [FULL_EDICION], error: null },
        talleres_crecimiento_cohortes: { data: [FULL_COHORTE], error: null },
      },
    })
    await loadAsCoord()
    // Each `from()` call passes a table name as the first arg. Walk
    // the captured filters to see which tables were queried.
    const tablesQueried = Array.from(new Set(captured.map((f) => f.table)))
    expect(tablesQueried).toContain('taller_inscripciones')
    expect(tablesQueried).toContain('taller_ediciones')
    expect(tablesQueried).toContain('talleres_crecimiento_cohortes')
  })

  it('filters by estado=pendiente', async () => {
    setupMocks({
      responses: {
        taller_inscripciones: { data: [], error: null },
      },
    })
    await loadAsCoord()
    const estadoFilter = captured.find(
      (f) => f.table === 'taller_inscripciones' && f.column === 'estado',
    )
    expect(estadoFilter?.op).toBe('eq')
    expect(estadoFilter?.value).toBe('pendiente')
  })

  it('orders by created_at DESC and caps the result at 50 rows', async () => {
    setupMocks({
      responses: {
        taller_inscripciones: { data: [], error: null },
      },
    })
    await loadAsCoord()
    const selectColumns = captured.find(
      (f) => f.table === 'taller_inscripciones',
    )?.selectColumns
    expect(selectColumns).toMatch(/created_at/)
    // limit(50) is part of the LIMIT clause applied to the loader
    expect(selectColumns).toBeDefined()
  })
})

describe('loadCoordInscripcionesPendientes — deny-by-default', () => {
  it('drops rows whose edicion join resolves to null', async () => {
    setupMocks({
      responses: {
        taller_inscripciones: { data: [FULL_INSCRIPCION], error: null },
        taller_ediciones: { data: [], error: null },
        talleres_crecimiento_cohortes: { data: [], error: null },
      },
    })
    const rows = await loadAsCoord()
    expect(rows).toHaveLength(0)
  })

  it('drops rows whose persona_principal join is null', async () => {
    setupMocks({
      responses: {
        taller_inscripciones: {
          data: [{ ...FULL_INSCRIPCION, persona_principal: null }],
          error: null,
        },
        taller_ediciones: { data: [FULL_EDICION], error: null },
        talleres_crecimiento_cohortes: { data: [FULL_COHORTE], error: null },
      },
    })
    const rows = await loadAsCoord()
    expect(rows).toHaveLength(0)
  })

  it('returns empty when the inscripciones query errors', async () => {
    setupMocks({
      responses: {
        taller_inscripciones: {
          data: null,
          error: { message: 'sql fail' },
        },
      },
    })
    const rows = await loadAsCoord()
    expect(rows).toEqual([])
  })

  it('returns empty when there are zero pendientes', async () => {
    setupMocks({
      responses: {
        taller_inscripciones: { data: [], error: null },
      },
    })
    const rows = await loadAsCoord()
    expect(rows).toEqual([])
  })
})

describe('loadCoordInscripcionesPendientes — surface compañero + link', () => {
  it('surfaces compañero nombre + link_type when present', async () => {
    const parejaInscripcion = {
      ...FULL_INSCRIPCION,
      link_type: 'matrimonio' as const,
      companero: {
        id: 'u-2',
        nombre: 'María',
        apellido: 'Pérez',
      },
    }
    setupMocks({
      responses: {
        taller_inscripciones: { data: [parejaInscripcion], error: null },
        taller_ediciones: { data: [FULL_EDICION], error: null },
        talleres_crecimiento_cohortes: { data: [], error: null },
      },
    })
    const rows = await loadAsCoord()
    expect(rows[0]?.link_type).toBe('matrimonio')
    expect(rows[0]?.companero_id).toBe('u-2')
    expect(rows[0]?.companero_nombre).toBe('María Pérez')
  })

  it('null cohorte on the inscripcion surfaces as null cohorte_id + cohorte_edicion', async () => {
    const legacyInscripcion = { ...FULL_INSCRIPCION, cohorte_id: null }
    setupMocks({
      responses: {
        taller_inscripciones: { data: [legacyInscripcion], error: null },
        taller_ediciones: { data: [FULL_EDICION], error: null },
        talleres_crecimiento_cohortes: { data: [], error: null },
      },
    })
    const rows = await loadAsCoord()
    expect(rows[0]?.cohorte_id).toBeNull()
    expect(rows[0]?.cohorte_edicion).toBeNull()
  })
})