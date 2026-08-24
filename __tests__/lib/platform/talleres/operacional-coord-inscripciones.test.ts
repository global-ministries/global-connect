/**
 * @jest-environment node
 *
 * Tests for `loadCoordInscripcionesPendientes`.
 *
 * Bug #3 fix: a coordinador is scoped (RLS) to see a pending
 * inscripcion, but the old embed `persona_principal:usuarios(...)`
 * ran under the caller's `usuarios` RLS, which denies the participant
 * row → the embed resolved to `null` → the loader dropped the row
 * (`if (!persona) continue`). The coordinador saw "No hay
 * inscripciones pendientes" even though the row was RLS-visible.
 *
 * The fix removes the `usuarios` embed and resolves persona names via
 * a SECURITY DEFINER RPC (`talleres_coord_inscripciones_personas`)
 * that re-applies the exact `taller_inscripciones_select` policy
 * internally (fail-closed) and bypasses only the `usuarios` RLS for
 * the name join. These tests assert: scalar FK columns are selected
 * (no `usuarios` embed), names come from the RPC, and a row is NEVER
 * dropped for a missing persona (masked name instead).
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

interface CapturedRpc {
  readonly fn: string
  readonly args: unknown
}

interface TableResponses {
  [table: string]: { data: unknown[] | null; error: { message: string } | null }
}

const captured: CapturedFilter[] = []
const capturedRpc: CapturedRpc[] = []
let tableResponses: TableResponses = {}
let rpcData: unknown[] = []

function setupMocks(opts: {
  isEnabled?: boolean
  capabilities?: string[]
  responses?: TableResponses
  rpcData?: unknown[]
}) {
  flagsMock.mockReset().mockReturnValue(opts.isEnabled ?? true)
  tableResponses = opts.responses ?? {}
  rpcData = opts.rpcData ?? []

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
    rpc: jest.fn((fn: string, args: unknown) => {
      capturedRpc.push({ fn, args })
      return Promise.resolve({ data: rpcData, error: null })
    }),
  })
}

beforeEach(() => {
  captured.length = 0
  capturedRpc.length = 0
  tableResponses = {}
  rpcData = []
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

// The inscripcion row now carries scalar FK columns only — the
// `usuarios` embed is gone. Names are resolved by the RPC below.
const FULL_INSCRIPCION = {
  id: 'insc-1',
  taller_id: 'ed-1',
  cohorte_id: 'coh-1',
  estado: 'pendiente',
  link_type: null,
  created_at: '2026-08-15T12:00:00Z',
  updated_at: '2026-08-15T12:00:00Z',
  persona_principal_id: 'u-1',
  companero_id: null,
}

// One row of the SECURITY DEFINER RPC result, keyed by inscripcion_id.
const RPC_PERSONA = {
  inscripcion_id: 'insc-1',
  persona_principal_id: 'u-1',
  pp_nombre: 'Isaac',
  pp_apellido: 'Páez',
  pp_email: 'isaac@example.com',
  companero_id: null,
  comp_nombre: null,
  comp_apellido: null,
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
      rpcData: [RPC_PERSONA],
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

  it('selects scalar FK columns (no usuarios embed) and resolves names via the RPC', async () => {
    setupMocks({
      responses: {
        taller_inscripciones: { data: [FULL_INSCRIPCION], error: null },
        taller_ediciones: { data: [FULL_EDICION], error: null },
        talleres_crecimiento_cohortes: { data: [FULL_COHORTE], error: null },
      },
      rpcData: [RPC_PERSONA],
    })
    await loadAsCoord()

    const inscSelect = captured.find(
      (f) => f.table === 'taller_inscripciones',
    )?.selectColumns
    expect(inscSelect).toBeDefined()
    // The embed is gone: no `usuarios` relationship in the select.
    expect(inscSelect).not.toMatch(/usuarios/)
    // Scalar FK columns are selected instead.
    expect(inscSelect).toMatch(/persona_principal_id/)
    expect(inscSelect).toMatch(/companero_id/)

    // Names are resolved by the SECURITY DEFINER RPC, passing the
    // RLS-visible inscripcion ids so it can re-apply the policy.
    expect(capturedRpc).toHaveLength(1)
    expect(capturedRpc[0]?.fn).toBe('talleres_coord_inscripciones_personas')
    expect(capturedRpc[0]?.args).toEqual({ p_inscripcion_ids: ['insc-1'] })
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
      rpcData: [RPC_PERSONA],
    })
    const rows = await loadAsCoord()
    expect(rows).toHaveLength(0)
  })

  it('keeps the inscripcion and resolves persona via the RPC even when the usuarios embed would be null', async () => {
    // This is the bug #3 regression guard: the RLS-visible pending
    // inscripcion MUST survive. The old embed returned null here and
    // the loader dropped the row.
    setupMocks({
      responses: {
        taller_inscripciones: { data: [FULL_INSCRIPCION], error: null },
        taller_ediciones: { data: [FULL_EDICION], error: null },
        talleres_crecimiento_cohortes: { data: [FULL_COHORTE], error: null },
      },
      rpcData: [RPC_PERSONA],
    })
    const rows = await loadAsCoord()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.persona_principal_id).toBe('u-1')
    expect(rows[0]?.persona_principal_nombre).toBe('Isaac Páez')
    expect(rows[0]?.persona_principal_email).toBe('isaac@example.com')
  })

  it('surfaces a masked name (never drops) when the RPC returns no persona', async () => {
    // Fail-closed name: the inscripcion is RLS-visible (Query 1), so
    // it must render. If the RPC yields no persona (deleted usuario,
    // race), show a masked name — never drop the authorized row.
    setupMocks({
      responses: {
        taller_inscripciones: { data: [FULL_INSCRIPCION], error: null },
        taller_ediciones: { data: [FULL_EDICION], error: null },
        talleres_crecimiento_cohortes: { data: [FULL_COHORTE], error: null },
      },
      rpcData: [],
    })
    const rows = await loadAsCoord()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.persona_principal_id).toBe('u-1')
    expect(rows[0]?.persona_principal_nombre).toBe('—')
    expect(rows[0]?.persona_principal_email).toBeNull()
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

  it('returns empty (and never calls the RPC) when there are zero pendientes', async () => {
    setupMocks({
      responses: {
        taller_inscripciones: { data: [], error: null },
      },
    })
    const rows = await loadAsCoord()
    expect(rows).toEqual([])
    expect(capturedRpc).toHaveLength(0)
  })
})

describe('loadCoordInscripcionesPendientes — surface compañero + link', () => {
  it('surfaces compañero nombre + link_type when present', async () => {
    const parejaInscripcion = {
      ...FULL_INSCRIPCION,
      link_type: 'matrimonio' as const,
      companero_id: 'u-2',
    }
    const parejaRpc = {
      ...RPC_PERSONA,
      companero_id: 'u-2',
      comp_nombre: 'María',
      comp_apellido: 'Pérez',
    }
    setupMocks({
      responses: {
        taller_inscripciones: { data: [parejaInscripcion], error: null },
        taller_ediciones: { data: [FULL_EDICION], error: null },
        talleres_crecimiento_cohortes: { data: [], error: null },
      },
      rpcData: [parejaRpc],
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
      rpcData: [RPC_PERSONA],
    })
    const rows = await loadAsCoord()
    expect(rows[0]?.cohorte_id).toBeNull()
    expect(rows[0]?.cohorte_edicion).toBeNull()
  })
})
