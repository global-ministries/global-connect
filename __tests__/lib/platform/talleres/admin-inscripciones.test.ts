/**
 * @jest-environment node
 *
 * PR42 — Tests for the `/admin/talleres/inscripciones` global loader,
 * also consumed by `/talleres/[taller]/[edicion]` (T4).
 *
 * Covers:
 *   - The loader does NOT enforce the capability gate (that's the
 *     page's job). We mock the client and assert the SQL shape.
 *   - The cohorte + taller joins resolve in TS, not via embedded
 *     resource (PR38 pattern + the !taller_id hint context).
 *   - Filters translate to `.eq()` clauses on the SQL side.
 *   - The tall taller_id value used by the FK joins is the *edicion*
 *     id, not the abstract taller id.
 *
 * T6b (odd/tasks/talleres-consolidar-pantallas.md) — bug fix: the loader
 * used to embed `usuarios!persona_principal_id` directly in its SELECT.
 * That embed runs under the CALLER's own `usuarios` RLS
 * (`puede_ver_usuario`), which denies it for any viewer who is not the
 * target, an admin/pastor, or a Grupos de Vida leader/director sharing a
 * group with them. A plain taller coordinador matches none of those, so
 * the embed resolved to `null` and the old `if (!persona) continue`
 * silently dropped every row — since this loader is called by
 * `/talleres/[taller]/[edicion]`, that coordinador's own "Inscritos"
 * section rendered EMPTY. Names now come from the SECURITY DEFINER RPC
 * `talleres_coord_inscripciones_personas` (same fix as
 * `loadCoordInscripcionesPendientes`, operacional.ts, T6): a row is
 * NEVER dropped for a missing persona — a name the viewer cannot read
 * degrades to '—' instead.
 */

import {
  loadAdminInscripciones,
} from '@/lib/platform/talleres/admin-inscripciones'

interface CapturedFilter {
  readonly table: string
  readonly column: string
  readonly value: unknown
  readonly op: 'eq' | 'in'
}

interface CapturedRpc {
  readonly fn: string
  readonly args: unknown
}

const captured: CapturedFilter[] = []
const capturedRpc: CapturedRpc[] = []
let selectColumnsByTable: Record<string, string> = {}
let rpcData: unknown[] = []

function makeBuilder(table: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- thenable + chain
  const b: Record<string, any> = {}
  b['select'] = jest.fn((cols: string) => {
    selectColumnsByTable[table] = cols
    return b
  })
  b['eq'] = jest.fn((column: string, value: unknown) => {
    captured.push({ table, column, value, op: 'eq' })
    return b
  })
  b['in'] = jest.fn((column: string, value: unknown) => {
    captured.push({ table, column, value, op: 'in' })
    return b
  })
  b['order'] = jest.fn(() => b)
  b['limit'] = jest.fn(() => b)
  return b
}

function buildClientMock(responses: Record<string, { data: unknown; error: { message: string } | null }>) {
  return {
    from: jest.fn((table: string) => {
      const b = makeBuilder(table)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- thenable
      b['then'] = (
        resolve: (r: { data: unknown; error: { message: string } | null }) => void,
      ) => Promise.resolve(responses[table] ?? { data: [], error: null }).then(resolve)
      return b
    }),
    rpc: jest.fn((fn: string, args: unknown) => {
      capturedRpc.push({ fn, args })
      return Promise.resolve({ data: rpcData, error: null })
    }),
  }
}

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

// Scalar FK columns only — the `usuarios` embed is gone (T6b). Names are
// resolved by the RPC below, keyed by inscripcion_id.
const FULL_INSCRIPCION = {
  id: 'insc-1',
  taller_id: 'ed-1',
  estado: 'pendiente',
  link_type: null,
  created_at: '2026-08-15T12:00:00Z',
  updated_at: '2026-08-15T12:00:00Z',
  cohorte_id: 'coh-1',
  persona_principal_id: 'u-1',
  companero_id: null,
}

const RPC_PERSONA = {
  inscripcion_id: 'insc-1',
  pp_nombre: 'Isaac',
  pp_apellido: 'Páez',
  pp_email: 'isaac@example.com',
  comp_nombre: null,
  comp_apellido: null,
}

const FULL_COHORTE = {
  id: 'coh-1',
  edicion: 'Septiembre 2026',
}

beforeEach(() => {
  captured.length = 0
  capturedRpc.length = 0
  selectColumnsByTable = {}
  rpcData = []
})

describe('loadAdminInscripciones — joins', () => {
  it('queries taller_inscripciones with scalar FK columns and resolves names via the RPC', async () => {
    rpcData = [RPC_PERSONA]
    const client = buildClientMock({
      taller_inscripciones: { data: [FULL_INSCRIPCION], error: null },
      taller_ediciones: { data: [FULL_EDICION], error: null },
      talleres_crecimiento_cohortes: { data: [FULL_COHORTE], error: null },
    })

    const result = await loadAdminInscripciones(client, {})
    expect(result.rows).toHaveLength(1)
    const row = result.rows[0]!
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
    expect(result.total).toBe(1)
  })

  it('selects scalar FK columns (no usuarios embed) and calls the RPC with the RLS-visible inscripcion ids', async () => {
    rpcData = [RPC_PERSONA]
    const client = buildClientMock({
      taller_inscripciones: { data: [FULL_INSCRIPCION], error: null },
      taller_ediciones: { data: [FULL_EDICION], error: null },
      talleres_crecimiento_cohortes: { data: [FULL_COHORTE], error: null },
    })
    await loadAdminInscripciones(client, {})

    const inscSelect = selectColumnsByTable['taller_inscripciones']
    expect(inscSelect).toBeDefined()
    expect(inscSelect).not.toMatch(/usuarios/)
    expect(inscSelect).toMatch(/persona_principal_id/)
    expect(inscSelect).toMatch(/companero_id/)

    expect(capturedRpc).toHaveLength(1)
    expect(capturedRpc[0]?.fn).toBe('talleres_coord_inscripciones_personas')
    expect(capturedRpc[0]?.args).toEqual({ p_inscripcion_ids: ['insc-1'] })

    const callArgs = (client.from as jest.Mock).mock.calls.map((c) => c[0])
    expect(callArgs).toContain('taller_inscripciones')
    expect(callArgs).toContain('taller_ediciones')
    expect(callArgs).toContain('talleres_crecimiento_cohortes')
  })

  it('PR42 — taller_id filter on the lookup queries uses the edicion id (not the abstract taller id)', async () => {
    rpcData = [RPC_PERSONA]
    const client = buildClientMock({
      taller_inscripciones: { data: [FULL_INSCRIPCION], error: null },
      taller_ediciones: { data: [FULL_EDICION], error: null },
      talleres_crecimiento_cohortes: { data: [FULL_COHORTE], error: null },
    })
    await loadAdminInscripciones(client, {})

    // The edicion lookup is `.in('id', [...])` over the collected
    // edicion ids from the inscripcion rows. The cohort lookup is
    // `.in('id', [...])` over the cohorte ids.
    const edFilters = captured.filter((f) => f.table === 'taller_ediciones')
    expect(edFilters.some((f) => f.column === 'id' && f.op === 'in')).toBe(true)
    const cohFilters = captured.filter(
      (f) => f.table === 'talleres_crecimiento_cohortes',
    )
    expect(cohFilters.some((f) => f.column === 'id' && f.op === 'in')).toBe(true)
  })
})

describe('loadAdminInscripciones — filters', () => {
  it('estado filter applies as .eq() on the inscripciones query', async () => {
    const client = buildClientMock({
      taller_inscripciones: { data: [], error: null },
    })
    await loadAdminInscripciones(client, { estado: 'pendiente' })
    const estadoFilter = captured.find(
      (f) => f.table === 'taller_inscripciones' && f.column === 'estado',
    )
    expect(estadoFilter?.op).toBe('eq')
    expect(estadoFilter?.value).toBe('pendiente')
  })

  it('edicion_id filter applies as .eq(taller_id, edicion_id)', async () => {
    const client = buildClientMock({
      taller_inscripciones: { data: [], error: null },
    })
    await loadAdminInscripciones(client, { edicion_id: 'ed-99' })
    const tallerIdFilter = captured.find(
      (f) =>
        f.table === 'taller_inscripciones' &&
        f.column === 'taller_id' &&
        f.op === 'eq',
    )
    expect(tallerIdFilter?.value).toBe('ed-99')
  })

  it('taller_id filter (abstract id) is applied as a post-query filter on the edicion set', async () => {
    rpcData = [RPC_PERSONA]
    const client = buildClientMock({
      taller_inscripciones: { data: [FULL_INSCRIPCION], error: null },
      taller_ediciones: { data: [FULL_EDICION], error: null },
      talleres_crecimiento_cohortes: { data: [], error: null },
    })
    // The abstract taller id for FULL_INSCRIPCION is t-1.
    const result = await loadAdminInscripciones(client, { taller_id: 't-1' })
    // The row matches because the joined edicion.taller_id === t-1.
    expect(result.rows).toHaveLength(1)

    // A mismatch filters out the row.
    const empty = await loadAdminInscripciones(client, { taller_id: 't-OTHER' })
    expect(empty.rows).toHaveLength(0)
  })

  it('estado filter rejects invalid values (defense against URL tampering)', async () => {
    const client = buildClientMock({
      taller_inscripciones: { data: [], error: null },
    })
    // Estado is whitelisted in the page; the loader trusts the
    // caller. Document the contract here.
    await loadAdminInscripciones(client, { estado: 'no_aprobado' })
    const estadoFilter = captured.find(
      (f) => f.table === 'taller_inscripciones' && f.column === 'estado',
    )
    expect(estadoFilter?.value).toBe('no_aprobado')
  })
})

describe('loadAdminInscripciones — empty + error', () => {
  it('returns empty when taller_inscripciones returns an empty array', async () => {
    const client = buildClientMock({
      taller_inscripciones: { data: [], error: null },
    })
    const result = await loadAdminInscripciones(client, {})
    expect(result.rows).toEqual([])
    expect(result.total).toBe(0)
  })

  it('makes no RPC call when there are zero inscripciones', async () => {
    const client = buildClientMock({
      taller_inscripciones: { data: [], error: null },
    })
    await loadAdminInscripciones(client, {})
    expect(capturedRpc).toHaveLength(0)
  })

  it('returns empty when taller_inscripciones returns an error', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock
    const erroringClient: any = {
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          order: jest.fn(() => ({
            limit: jest.fn(() => Promise.resolve({ data: null, error: { message: 'sql fail' } })),
          })),
        })),
      })),
    }
    const result = await loadAdminInscripciones(erroringClient, {})
    expect(result.rows).toEqual([])
    expect(result.total).toBe(0)
  })

  it('skips rows whose edicion join resolves to null (deny-by-default)', async () => {
    rpcData = [RPC_PERSONA]
    const client = buildClientMock({
      // The inscripcion references an edicion that doesn't exist in
      // the joined edicion set. The loader must drop the row.
      taller_inscripciones: { data: [FULL_INSCRIPCION], error: null },
      taller_ediciones: { data: [], error: null },
      talleres_crecimiento_cohortes: { data: [], error: null },
    })
    const result = await loadAdminInscripciones(client, {})
    expect(result.rows).toHaveLength(0)
  })

  // T6b — regression guard for the production bug: a plain taller
  // coordinador (full talleres capabilities, no Grupos de Vida
  // leadership) cannot read `usuarios` for anyone but themselves. The
  // pre-fix loader embedded `usuarios!persona_principal_id`, which
  // resolved to `null` for that viewer, and `if (!persona) continue`
  // dropped the row — the coordinador's own "Inscritos" section
  // (rendered by /talleres/[taller]/[edicion], T4) showed EMPTY even
  // though the enrollment was fully RLS-visible. The row must survive
  // and degrade its name to '—' instead.
  it('T6b — never drops a row when the RPC yields no persona (masked name instead of hiding the enrollment)', async () => {
    rpcData = [] // The RPC found no match — same shape a denied-embed viewer sees.
    const client = buildClientMock({
      taller_inscripciones: { data: [FULL_INSCRIPCION], error: null },
      taller_ediciones: { data: [FULL_EDICION], error: null },
      talleres_crecimiento_cohortes: { data: [FULL_COHORTE], error: null },
    })
    const result = await loadAdminInscripciones(client, {})
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]?.persona_principal_id).toBe('u-1')
    expect(result.rows[0]?.persona_principal_nombre).toBe('—')
    expect(result.rows[0]?.persona_principal_email).toBeNull()
    expect(result.total).toBe(1)
  })
})

describe('loadAdminInscripciones — cohort + companero', () => {
  it('surfaces cohorte_edicion when the cohorte join lands', async () => {
    rpcData = [RPC_PERSONA]
    const client = buildClientMock({
      taller_inscripciones: { data: [FULL_INSCRIPCION], error: null },
      taller_ediciones: { data: [FULL_EDICION], error: null },
      talleres_crecimiento_cohortes: { data: [FULL_COHORTE], error: null },
    })
    const result = await loadAdminInscripciones(client, {})
    expect(result.rows[0]?.cohorte_edicion).toBe('Septiembre 2026')
  })

  it('null cohorte on the inscripcion surfaces as null cohorte_id + cohorte_edicion', async () => {
    rpcData = [RPC_PERSONA]
    const legacyInscripcion = {
      ...FULL_INSCRIPCION,
      cohorte_id: null,
    }
    const client = buildClientMock({
      taller_inscripciones: { data: [legacyInscripcion], error: null },
      taller_ediciones: { data: [FULL_EDICION], error: null },
      talleres_crecimiento_cohortes: { data: [], error: null },
    })
    const result = await loadAdminInscripciones(client, {})
    expect(result.rows[0]?.cohorte_id).toBeNull()
    expect(result.rows[0]?.cohorte_edicion).toBeNull()
  })

  it('surfaces compañero nombre + link_type when present', async () => {
    const parejaInscripcion = {
      ...FULL_INSCRIPCION,
      link_type: 'matrimonio' as const,
      companero_id: 'u-2',
    }
    const parejaRpc = {
      ...RPC_PERSONA,
      comp_nombre: 'María',
      comp_apellido: 'Pérez',
    }
    rpcData = [parejaRpc]
    const client = buildClientMock({
      taller_inscripciones: { data: [parejaInscripcion], error: null },
      taller_ediciones: { data: [FULL_EDICION], error: null },
      talleres_crecimiento_cohortes: { data: [], error: null },
    })
    const result = await loadAdminInscripciones(client, {})
    expect(result.rows[0]?.link_type).toBe('matrimonio')
    expect(result.rows[0]?.companero_id).toBe('u-2')
    expect(result.rows[0]?.companero_nombre).toBe('María Pérez')
  })

  it('companero_nombre stays null when companero_id is null, even if the RPC row carries stray comp_* fields', async () => {
    rpcData = [{ ...RPC_PERSONA, comp_nombre: 'Should not surface', comp_apellido: 'X' }]
    const client = buildClientMock({
      taller_inscripciones: { data: [FULL_INSCRIPCION], error: null },
      taller_ediciones: { data: [FULL_EDICION], error: null },
      talleres_crecimiento_cohortes: { data: [FULL_COHORTE], error: null },
    })
    const result = await loadAdminInscripciones(client, {})
    expect(result.rows[0]?.companero_id).toBeNull()
    expect(result.rows[0]?.companero_nombre).toBeNull()
  })
})
