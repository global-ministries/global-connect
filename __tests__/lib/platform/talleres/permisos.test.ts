/**
 * T1 (odd/tasks/talleres-consolidar-pantallas.md) — app helper for the
 * talleres_mis_permisos(p_equipo_id) RPC (migration
 * 20260919120000_talleres_mis_permisos.sql).
 *
 * Mirrors the mock pattern used for generateCertificateForInscription in
 * __tests__/lib/platform/talleres/certificates.test.ts: a minimal
 * `{ rpc }` client, RPC calls recorded for assertion, and a best-effort
 * contract (never throws — returns the safe all-false fallback on error).
 */

import {
  cargarPermisos,
  cargarPermisosPorEquipos,
  PERMISOS_TALLER_ALL_FALSE,
  type PermisosTaller,
} from '@/lib/platform/talleres/permisos'

interface RpcCall {
  readonly name: string
  readonly args: { p_equipo_id: string | null }
}

function makeClient(
  result: { data: unknown; error: { message: string } | null },
  calls: RpcCall[],
): { rpc: (name: string, args: RpcCall['args']) => Promise<typeof result> } {
  return {
    rpc: (name, args) => {
      calls.push({ name, args })
      return Promise.resolve(result)
    },
  }
}

const FULL_TRUE_ROW = {
  ver: true,
  editar_taller: true,
  abrir_edicion: true,
  editar_edicion: true,
  gestionar_grupos: true,
  aprobar_inscripciones: true,
  resolver_retiros: true,
  asignar_equipo: true,
  ver_reportes: true,
  ver_metricas: true,
}

const FULL_TRUE_EXPECTED: PermisosTaller = {
  ver: true,
  editarTaller: true,
  abrirEdicion: true,
  editarEdicion: true,
  gestionarGrupos: true,
  aprobarInscripciones: true,
  resolverRetiros: true,
  asignarEquipo: true,
  verReportes: true,
  verMetricas: true,
}

describe('cargarPermisos — talleres_mis_permisos RPC wrapper', () => {
  it('calls talleres_mis_permisos with the given equipo id', async () => {
    const calls: RpcCall[] = []
    const client = makeClient({ data: FULL_TRUE_ROW, error: null }, calls)
    await cargarPermisos(client, 'equipo-1')
    expect(calls).toHaveLength(1)
    expect(calls[0]?.name).toBe('talleres_mis_permisos')
    expect(calls[0]?.args.p_equipo_id).toBe('equipo-1')
  })

  it('passes null through unchanged (mirrors auth_has_talleres_capability_scoped\'s NULL semantics)', async () => {
    const calls: RpcCall[] = []
    const client = makeClient({ data: PERMISOS_TALLER_ALL_FALSE, error: null }, calls)
    await cargarPermisos(client, null)
    expect(calls[0]?.args.p_equipo_id).toBeNull()
  })

  it('maps every snake_case RPC key to its camelCase field, 1:1', async () => {
    const calls: RpcCall[] = []
    const client = makeClient({ data: FULL_TRUE_ROW, error: null }, calls)
    const result = await cargarPermisos(client, 'equipo-1')
    expect(result).toEqual(FULL_TRUE_EXPECTED)
  })

  it('treats any non-true RPC value as false (defensive against nulls/strings)', async () => {
    const calls: RpcCall[] = []
    const client = makeClient(
      { data: { ...FULL_TRUE_ROW, ver: null, editar_taller: 'true', ver_metricas: undefined }, error: null },
      calls,
    )
    const result = await cargarPermisos(client, 'equipo-1')
    expect(result.ver).toBe(false)
    expect(result.editarTaller).toBe(false)
    expect(result.verMetricas).toBe(false)
  })

  it('returns the safe all-false fallback on an RPC error, never throws', async () => {
    const calls: RpcCall[] = []
    const client = makeClient({ data: null, error: { message: 'permission denied' } }, calls)
    const result = await cargarPermisos(client, 'equipo-1')
    expect(result).toEqual(PERMISOS_TALLER_ALL_FALSE)
  })

  it('returns the safe all-false fallback when the client throws', async () => {
    const client = { rpc: () => Promise.reject(new Error('network down')) }
    const result = await cargarPermisos(client, 'equipo-1')
    expect(result).toEqual(PERMISOS_TALLER_ALL_FALSE)
  })

  it('returns the safe all-false fallback when data is missing or malformed', async () => {
    const calls: RpcCall[] = []
    const client = makeClient({ data: null, error: null }, calls)
    const result = await cargarPermisos(client, 'equipo-1')
    expect(result).toEqual(PERMISOS_TALLER_ALL_FALSE)
  })
})

/**
 * T6 (odd/tasks/talleres-consolidar-pantallas.md) — `/talleres/pendientes`
 * aggregates rows from several equipos in one page (a coordinador/director
 * sees inscripciones + solicitudes across every taller they reach). A
 * single `cargarPermisos(client, equipoId)` call is wrong there — the
 * task's own instruction: "resolve permissions per distinct equipo
 * present in the rows... and use them per row". This batches the RPC:
 * one call per DISTINCT equipo id (never once per row), deduped and
 * cached in the returned Map.
 */
describe('cargarPermisosPorEquipos — batched by distinct equipo id', () => {
  it('calls the RPC once per distinct equipo id, not once per row', async () => {
    const calls: RpcCall[] = []
    const client = makeClient({ data: FULL_TRUE_ROW, error: null }, calls)
    await cargarPermisosPorEquipos(client, ['eq-1', 'eq-2', 'eq-1', 'eq-1', 'eq-2'])
    expect(calls).toHaveLength(2)
    expect(calls.map((c) => c.args.p_equipo_id).sort()).toEqual(['eq-1', 'eq-2'])
  })

  it('returns a Map keyed by equipo id with each equipo\'s own permisos', async () => {
    const calls: RpcCall[] = []
    const responsesByEquipo: Record<string, unknown> = {
      'eq-1': FULL_TRUE_ROW,
      'eq-2': { ...FULL_TRUE_ROW, aprobar_inscripciones: false, resolver_retiros: false },
    }
    const client = {
      rpc: (_name: string, args: { p_equipo_id: string | null }) => {
        calls.push({ name: 'talleres_mis_permisos', args })
        return Promise.resolve({ data: responsesByEquipo[args.p_equipo_id ?? ''], error: null })
      },
    }
    const result = await cargarPermisosPorEquipos(client, ['eq-1', 'eq-2'])
    expect(result.get('eq-1')).toEqual(FULL_TRUE_EXPECTED)
    expect(result.get('eq-2')).toEqual({
      ...FULL_TRUE_EXPECTED,
      aprobarInscripciones: false,
      resolverRetiros: false,
    })
  })

  it('treats null equipo id as its own distinct key (mirrors cargarPermisos\' NULL semantics)', async () => {
    const calls: RpcCall[] = []
    const client = makeClient({ data: PERMISOS_TALLER_ALL_FALSE, error: null }, calls)
    const result = await cargarPermisosPorEquipos(client, ['eq-1', null])
    expect(calls).toHaveLength(2)
    expect(result.has(null)).toBe(true)
  })

  it('returns an empty Map and makes no RPC call for an empty input list', async () => {
    const calls: RpcCall[] = []
    const client = makeClient({ data: FULL_TRUE_ROW, error: null }, calls)
    const result = await cargarPermisosPorEquipos(client, [])
    expect(calls).toHaveLength(0)
    expect(result.size).toBe(0)
  })

  it('never throws — a per-equipo RPC failure resolves to the safe all-false fallback for that equipo only', async () => {
    const client = {
      rpc: (_name: string, args: { p_equipo_id: string | null }) => {
        if (args.p_equipo_id === 'eq-bad') return Promise.reject(new Error('network down'))
        return Promise.resolve({ data: FULL_TRUE_ROW, error: null })
      },
    }
    const result = await cargarPermisosPorEquipos(client, ['eq-1', 'eq-bad'])
    expect(result.get('eq-1')).toEqual(FULL_TRUE_EXPECTED)
    expect(result.get('eq-bad')).toEqual(PERMISOS_TALLER_ALL_FALSE)
  })
})
