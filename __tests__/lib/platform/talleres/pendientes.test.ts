/**
 * @jest-environment node
 *
 * T6 (odd/tasks/talleres-consolidar-pantallas.md) — loaders for
 * /talleres/pendientes, the coordinator's cross-taller inbox.
 *
 * Design decision (see this task's report): the inscripciones section
 * REUSES `loadCoordInscripcionesPendientes` (operacional.ts) rather than
 * `loadAdminInscripciones` (admin-inscripciones.ts) — the admin loader
 * embeds `usuarios!persona_principal_id`, which resolves to `null` (and
 * silently DROPS the row) for any viewer who cannot read `usuarios`
 * directly. T5's staging evidence (supabase/tests/talleres-t5-lider-
 * lectura.test.sql, finding 5) proved that gap applies to ANY talleres
 * viewer, not just a líder — so it would also apply to a plain
 * coordinador here. `loadCoordInscripcionesPendientes` already avoids
 * that trap via the SECURITY DEFINER RPC
 * `talleres_coord_inscripciones_personas`.
 *
 * This module adds exactly what that loader is missing for a
 * cross-taller inbox: which EQUIPO (dream_team_equipo_id) each row
 * belongs to, so the page can resolve per-row permissions instead of a
 * flat capability check.
 */

import {
  loadPendientesInscripciones,
  loadPendientesSolicitudes,
} from '@/lib/platform/talleres/pendientes'
import type { InscripcionAdminRow } from '@/lib/platform/talleres/inscripciones-types'
import type { CoordSolicitudRow } from '@/lib/platform/talleres/operacional'

jest.mock('@/lib/platform/talleres/operacional', () => ({
  loadCoordInscripcionesPendientes: jest.fn(),
  loadCoordSolicitudes: jest.fn(),
}))

const loadCoordInscripcionesPendientesMock = jest.requireMock(
  '@/lib/platform/talleres/operacional',
).loadCoordInscripcionesPendientes as jest.Mock
const loadCoordSolicitudesMock = jest.requireMock('@/lib/platform/talleres/operacional')
  .loadCoordSolicitudes as jest.Mock

function makeInscripcionRow(overrides: Partial<InscripcionAdminRow> = {}): InscripcionAdminRow {
  return {
    id: 'insc-1',
    edicion_id: 'ed-1',
    edicion_nombre: 'Septiembre 2026',
    edicion_estado: 'abierto',
    taller_id: 't-1',
    taller_nombre: 'Matrimonio sobre la Roca',
    taller_slug: 'matrimonio-sobre-la-roca',
    cohorte_id: null,
    cohorte_edicion: null,
    persona_principal_id: 'p-1',
    persona_principal_nombre: 'Isaac Páez',
    persona_principal_email: 'isaac@example.com',
    companero_id: null,
    companero_nombre: null,
    link_type: null,
    estado: 'pendiente',
    created_at: '2026-09-10T00:00:00Z',
    updated_at: '2026-09-10T00:00:00Z',
    grupo_id: null,
    grupo_nombre: null,
    ...overrides,
  }
}

function makeSolicitudRow(overrides: Partial<CoordSolicitudRow> = {}): CoordSolicitudRow {
  return {
    id: 'sol-1',
    inscripcion_id: 'insc-1',
    grupo_asignacion_id: null,
    tipo: 'participante_retiro',
    estado: 'pendiente',
    motivo: 'Mudanza',
    created_at: '2026-09-10T00:00:00Z',
    ...overrides,
  }
}

interface CapturedInClause {
  readonly table: string
  readonly column: string
  readonly value: readonly unknown[]
}

interface CapturedRpcCall {
  readonly fn: string
  readonly args: unknown
}

function makeClient(opts: {
  talleresData?: unknown[]
  rpcImpl?: (fn: string, args: Record<string, unknown>) => unknown
}) {
  const capturedIn: CapturedInClause[] = []
  const capturedRpc: CapturedRpcCall[] = []

  const client = {
    from: (table: string) => {
      const chain = {
        select: () => chain,
        in: (column: string, value: readonly unknown[]) => {
          capturedIn.push({ table, column, value })
          return chain
        },
        then: (resolve: (v: { data: unknown[] | null; error: null }) => unknown) =>
          Promise.resolve({ data: opts.talleresData ?? [], error: null }).then(resolve),
      }
      return chain
    },
    rpc: (fn: string, args: Record<string, unknown>) => {
      capturedRpc.push({ fn, args })
      const result = opts.rpcImpl ? opts.rpcImpl(fn, args) : null
      return Promise.resolve({ data: result, error: null })
    },
  }
  return { client, capturedIn, capturedRpc }
}

beforeEach(() => {
  loadCoordInscripcionesPendientesMock.mockReset()
  loadCoordSolicitudesMock.mockReset()
})

// ─── loadPendientesInscripciones ───────────────────────────────────────────

describe('loadPendientesInscripciones', () => {
  it('reuses loadCoordInscripcionesPendientes for the row data (never re-implements the join)', async () => {
    loadCoordInscripcionesPendientesMock.mockResolvedValue([])
    const { client } = makeClient({})
    await loadPendientesInscripciones(client)
    expect(loadCoordInscripcionesPendientesMock).toHaveBeenCalledTimes(1)
  })

  it('T10 (odd/tasks/talleres-consolidar-pantallas.md): forwards an explicit estados filter unchanged', async () => {
    loadCoordInscripcionesPendientesMock.mockResolvedValue([])
    const { client } = makeClient({})
    await loadPendientesInscripciones(client, ['pendiente', 'aprobado', 'no_aprobado', 'retirado'])
    expect(loadCoordInscripcionesPendientesMock).toHaveBeenCalledWith(
      expect.anything(),
      ['pendiente', 'aprobado', 'no_aprobado', 'retirado'],
    )
  })

  it('returns the rows unchanged', async () => {
    const row = makeInscripcionRow()
    loadCoordInscripcionesPendientesMock.mockResolvedValue([row])
    const { client } = makeClient({ talleresData: [{ id: 't-1', dream_team_equipo_id: 'eq-1' }] })
    const result = await loadPendientesInscripciones(client)
    expect(result.rows).toEqual([row])
  })

  it('builds equipoIdByTallerId from a single batched talleres lookup, deduping repeated taller ids', async () => {
    const rows = [
      makeInscripcionRow({ id: 'insc-1', taller_id: 't-1' }),
      makeInscripcionRow({ id: 'insc-2', taller_id: 't-1' }),
      makeInscripcionRow({ id: 'insc-3', taller_id: 't-2' }),
    ]
    loadCoordInscripcionesPendientesMock.mockResolvedValue(rows)
    const { client, capturedIn } = makeClient({
      talleresData: [
        { id: 't-1', dream_team_equipo_id: 'eq-1' },
        { id: 't-2', dream_team_equipo_id: 'eq-2' },
      ],
    })
    const result = await loadPendientesInscripciones(client)

    const tallerLookups = capturedIn.filter((c) => c.table === 'talleres')
    expect(tallerLookups).toHaveLength(1)
    expect(new Set(tallerLookups[0]?.value)).toEqual(new Set(['t-1', 't-2']))

    expect(result.equipoIdByTallerId.get('t-1')).toBe('eq-1')
    expect(result.equipoIdByTallerId.get('t-2')).toBe('eq-2')
  })

  it('maps a taller with a null dream_team_equipo_id to null (never drops it from the map)', async () => {
    const rows = [makeInscripcionRow({ taller_id: 't-1' })]
    loadCoordInscripcionesPendientesMock.mockResolvedValue(rows)
    const { client } = makeClient({
      talleresData: [{ id: 't-1', dream_team_equipo_id: null }],
    })
    const result = await loadPendientesInscripciones(client)
    expect(result.equipoIdByTallerId.get('t-1')).toBeNull()
  })

  it('makes no talleres query and returns an empty map when there are zero rows', async () => {
    loadCoordInscripcionesPendientesMock.mockResolvedValue([])
    const { client, capturedIn } = makeClient({})
    const result = await loadPendientesInscripciones(client)
    expect(result.rows).toEqual([])
    expect(result.equipoIdByTallerId.size).toBe(0)
    expect(capturedIn.filter((c) => c.table === 'talleres')).toHaveLength(0)
  })
})

// ─── loadPendientesSolicitudes ─────────────────────────────────────────────

describe('loadPendientesSolicitudes', () => {
  it('reuses loadCoordSolicitudes for the row data', async () => {
    loadCoordSolicitudesMock.mockResolvedValue([])
    const { client } = makeClient({})
    await loadPendientesSolicitudes(client)
    expect(loadCoordSolicitudesMock).toHaveBeenCalledTimes(1)
  })

  it('filters down to estado=pendiente only (loadCoordSolicitudes returns every estado)', async () => {
    loadCoordSolicitudesMock.mockResolvedValue([
      makeSolicitudRow({ id: 'sol-1', estado: 'pendiente' }),
      makeSolicitudRow({ id: 'sol-2', estado: 'aprobada' }),
      makeSolicitudRow({ id: 'sol-3', estado: 'rechazada' }),
    ])
    const { client } = makeClient({
      rpcImpl: () => 'eq-1',
      talleresData: [{ id: 't-1', nombre: 'Taller', slug: 'taller', dream_team_equipo_id: 'eq-1' }],
    })
    const result = await loadPendientesSolicitudes(client)
    expect(result.map((r) => r.id)).toEqual(['sol-1'])
  })

  it('resolves each pendiente row\'s equipo via talleres_equipo_de_solicitud, passing both target columns', async () => {
    loadCoordSolicitudesMock.mockResolvedValue([
      makeSolicitudRow({ id: 'sol-1', inscripcion_id: 'insc-1', grupo_asignacion_id: null }),
      makeSolicitudRow({
        id: 'sol-2',
        tipo: 'equipo_retiro_definitivo',
        inscripcion_id: null,
        grupo_asignacion_id: 'ga-1',
      }),
    ])
    const { client, capturedRpc } = makeClient({ rpcImpl: () => 'eq-1' })
    await loadPendientesSolicitudes(client)

    const calls = capturedRpc.filter((c) => c.fn === 'talleres_equipo_de_solicitud')
    expect(calls).toHaveLength(2)
    expect(calls).toEqual(
      expect.arrayContaining([
        { fn: 'talleres_equipo_de_solicitud', args: { p_inscripcion_id: 'insc-1', p_grupo_asignacion_id: null } },
        { fn: 'talleres_equipo_de_solicitud', args: { p_inscripcion_id: null, p_grupo_asignacion_id: 'ga-1' } },
      ]),
    )
  })

  it('enriches each row with its equipo id + taller nombre/slug', async () => {
    loadCoordSolicitudesMock.mockResolvedValue([makeSolicitudRow({ id: 'sol-1' })])
    const { client } = makeClient({
      rpcImpl: () => 'eq-1',
      talleresData: [
        { id: 't-1', nombre: 'Matrimonio sobre la Roca', slug: 'matrimonio-sobre-la-roca', dream_team_equipo_id: 'eq-1' },
      ],
    })
    const [row] = await loadPendientesSolicitudes(client)
    expect(row?.equipoId).toBe('eq-1')
    expect(row?.tallerNombre).toBe('Matrimonio sobre la Roca')
    expect(row?.tallerSlug).toBe('matrimonio-sobre-la-roca')
  })

  it('never drops a row when the equipo cannot be resolved — surfaces null taller fields instead', async () => {
    loadCoordSolicitudesMock.mockResolvedValue([makeSolicitudRow({ id: 'sol-1' })])
    const { client } = makeClient({ rpcImpl: () => null })
    const result = await loadPendientesSolicitudes(client)
    expect(result).toHaveLength(1)
    expect(result[0]?.equipoId).toBeNull()
    expect(result[0]?.tallerNombre).toBeNull()
    expect(result[0]?.tallerSlug).toBeNull()
  })

  it('makes no RPC calls and returns empty when there are zero pendiente solicitudes', async () => {
    loadCoordSolicitudesMock.mockResolvedValue([
      makeSolicitudRow({ id: 'sol-1', estado: 'aprobada' }),
    ])
    const { client, capturedRpc } = makeClient({})
    const result = await loadPendientesSolicitudes(client)
    expect(result).toEqual([])
    expect(capturedRpc).toHaveLength(0)
  })
})

// ─── R3e (odd/tasks/talleres-rediseno.md) — what the v2 inbox needs ───────

/** A client that answers each table / RPC with its own data and records the calls. */
function makeTablaClient(opts: {
  readonly tablas?: Record<string, unknown[] | { error: { message: string } }>
  readonly rpcs?: Record<string, unknown>
}) {
  const capturedIn: CapturedInClause[] = []
  const capturedRpc: CapturedRpcCall[] = []
  const client = {
    from: (table: string) => {
      const chain = {
        select: () => chain,
        in: (column: string, value: readonly unknown[]) => {
          capturedIn.push({ table, column, value })
          return chain
        },
        then: (resolve: (v: { data: unknown[] | null; error: { message: string } | null }) => unknown) => {
          const tabla = opts.tablas?.[table]
          const res =
            tabla && !Array.isArray(tabla) ? { data: null, error: tabla.error } : { data: tabla ?? [], error: null }
          return Promise.resolve(res).then(resolve)
        },
      }
      return chain
    },
    rpc: (fn: string, args: Record<string, unknown>) => {
      capturedRpc.push({ fn, args })
      return Promise.resolve({ data: opts.rpcs?.[fn] ?? null, error: null })
    },
  }
  return { client, capturedIn, capturedRpc }
}

describe('loadPendientesInscripciones — origen, por_verificar y grupo (R3e)', () => {
  it('reads origen, por_verificar and grupo_id of the returned rows in one batched taller_inscripciones lookup', async () => {
    loadCoordInscripcionesPendientesMock.mockResolvedValue([
      makeInscripcionRow({ id: 'insc-1' }),
      makeInscripcionRow({ id: 'insc-2' }),
    ])
    const { client, capturedIn } = makeTablaClient({
      tablas: {
        talleres: [{ id: 't-1', dream_team_equipo_id: 'eq-1' }],
        taller_inscripciones: [
          { id: 'insc-1', origen: 'publico', por_verificar: true, grupo_id: null },
          { id: 'insc-2', origen: 'app', por_verificar: false, grupo_id: 'g-1' },
        ],
      },
    })
    const result = await loadPendientesInscripciones(client)

    const lookups = capturedIn.filter((c) => c.table === 'taller_inscripciones')
    expect(lookups).toHaveLength(1)
    expect(lookups[0]?.column).toBe('id')
    expect(new Set(lookups[0]?.value)).toEqual(new Set(['insc-1', 'insc-2']))
    expect(result.extraPorInscripcion.get('insc-1')).toEqual({ origen: 'publico', porVerificar: true, grupoId: null })
    expect(result.extraPorInscripcion.get('insc-2')).toEqual({ origen: 'app', porVerificar: false, grupoId: 'g-1' })
  })

  it('degrades quietly (empty map, rows kept) when the lookup fails', async () => {
    const row = makeInscripcionRow()
    loadCoordInscripcionesPendientesMock.mockResolvedValue([row])
    const { client } = makeTablaClient({ tablas: { taller_inscripciones: { error: { message: 'boom' } } } })
    const result = await loadPendientesInscripciones(client)
    expect(result.rows).toEqual([row])
    expect(result.extraPorInscripcion.size).toBe(0)
  })

  it('makes no taller_inscripciones lookup when there are zero rows', async () => {
    loadCoordInscripcionesPendientesMock.mockResolvedValue([])
    const { client, capturedIn } = makeTablaClient({})
    const result = await loadPendientesInscripciones(client)
    expect(result.extraPorInscripcion.size).toBe(0)
    expect(capturedIn).toHaveLength(0)
  })
})

describe('loadPendientesSolicitudes — persona y edición del retiro (R3e)', () => {
  it('names the persona and the edición of a participante retiro through the existing RPC and one batched lookup', async () => {
    loadCoordSolicitudesMock.mockResolvedValue([
      makeSolicitudRow({ id: 'sol-1', inscripcion_id: 'insc-1' }),
      makeSolicitudRow({ id: 'sol-2', tipo: 'equipo_retiro_definitivo', inscripcion_id: null, grupo_asignacion_id: 'ga-1' }),
    ])
    const { client, capturedRpc, capturedIn } = makeTablaClient({
      rpcs: {
        talleres_equipo_de_solicitud: 'eq-1',
        talleres_coord_inscripciones_personas: [
          { inscripcion_id: 'insc-1', pp_nombre: 'Andreína', pp_apellido: 'Colmenárez', pp_email: 'a@example.com', comp_nombre: null, comp_apellido: null },
        ],
      },
      tablas: {
        talleres: [{ nombre: 'Mujer de Hoy', slug: 'mujer-de-hoy', dream_team_equipo_id: 'eq-1' }],
        taller_inscripciones: [{ id: 'insc-1', taller_id: 'ed-1' }],
      },
    })
    const result = await loadPendientesSolicitudes(client)

    const personas = capturedRpc.filter((c) => c.fn === 'talleres_coord_inscripciones_personas')
    expect(personas).toEqual([{ fn: 'talleres_coord_inscripciones_personas', args: { p_inscripcion_ids: ['insc-1'] } }])
    expect(capturedIn.filter((c) => c.table === 'taller_inscripciones')).toEqual([
      { table: 'taller_inscripciones', column: 'id', value: ['insc-1'] },
    ])
    expect(result[0]).toMatchObject({ personaNombre: 'Andreína Colmenárez', personaCorreo: 'a@example.com', edicionId: 'ed-1' })
    expect(result[1]).toMatchObject({ personaNombre: null, personaCorreo: null, edicionId: null })
  })

  it('keeps the row with null persona and edición when the RPC returns nothing', async () => {
    loadCoordSolicitudesMock.mockResolvedValue([makeSolicitudRow({ id: 'sol-1' })])
    const { client } = makeTablaClient({ rpcs: { talleres_equipo_de_solicitud: 'eq-1' } })
    const [row] = await loadPendientesSolicitudes(client)
    expect(row).toMatchObject({ id: 'sol-1', personaNombre: null, edicionId: null })
  })
})
