/**
 * `servidores-invitaciones` (T3 of odd/tasks/invitaciones-pendientes.md, S4/S5):
 * the page reads the invitations the caller may see in chunks of
 * MAX_IDS_ESTADOS plus the fichas without account they may invite
 * (invitacion_cuenta_sin_cuenta), and attaches per row the summary, `null`
 * (may invite, never invited) or nothing (no authority, no derived state). A
 * failed lookup leaves the rows as they were (no invitation data).
 */
import { MAX_IDS_ESTADOS } from '@/lib/platform/cuentas/invitaciones-pendientes'
import { adjuntarInvitaciones, fetchInvitacionesServidores } from '@/lib/platform/dream-team/servidores-invitaciones'
import { ID_DHAH, fila } from '../../../../tests/helpers/servidores-conexion'

const AHORA = new Date('2026-11-02T12:00:00.000Z')

function filaRpc(usuarioId: string, extra: Record<string, unknown> = {}) {
  return {
    usuario_id: usuarioId,
    id: `inv-${usuarioId}`,
    estado: 'enviada',
    email: `${usuarioId}@example.test`,
    created_at: '2026-11-02T11:00:00.000Z',
    aceptada_at: null,
    invitado_por_nombre: 'Edmir Muñoz',
    ...extra,
  }
}

/** A session RPC: estados returns `estados(ids)`, sin_cuenta returns `sinCuenta(ids)`. */
function rpcDe(
  estados: (ids: string[]) => unknown[] = () => [],
  sinCuenta: (ids: string[]) => string[] = () => [],
) {
  return jest.fn(async (nombre: string, args: Record<string, unknown>) => {
    const ids = args.p_usuario_ids as string[]
    if (nombre === 'invitacion_cuenta_estados') return { data: estados(ids), error: null }
    if (nombre === 'invitacion_cuenta_sin_cuenta') return { data: sinCuenta(ids), error: null }
    return { data: null, error: { code: 'X', message: 'unexpected' } }
  })
}

describe('fetchInvitacionesServidores', () => {
  let errorSpy: jest.SpyInstance
  beforeEach(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => errorSpy.mockRestore())

  it('asks both RPCs for the distinct ids in chunks and summarizes per person', async () => {
    const ids = Array.from({ length: MAX_IDS_ESTADOS + 1 }, (_, i) => `p${i}`)
    const rpc = rpcDe(
      (pedidos) => pedidos.filter((id) => id === 'p0' || id === `p${MAX_IDS_ESTADOS}`).map((id) => filaRpc(id)),
      (pedidos) => pedidos.filter((id) => id === 'p1'),
    )
    const datos = await fetchInvitacionesServidores(rpc, [...ids, 'p0'], AHORA)
    expect(rpc.mock.calls.map(([nombre, args]) => [nombre, (args.p_usuario_ids as string[]).length])).toEqual([
      ['invitacion_cuenta_estados', MAX_IDS_ESTADOS],
      ['invitacion_cuenta_sin_cuenta', MAX_IDS_ESTADOS],
      ['invitacion_cuenta_estados', 1],
      ['invitacion_cuenta_sin_cuenta', 1],
    ])
    expect([...(datos?.resumenes.keys() ?? [])]).toEqual(['p0', `p${MAX_IDS_ESTADOS}`])
    expect(datos?.resumenes.get('p0')).toMatchObject({ estado: 'enviada', email: 'p0@example.test', invitadoPor: 'Edmir Muñoz', envios: 1 })
    expect([...(datos?.sinCuenta ?? [])]).toEqual(['p1'])
  })

  it('S4: the summary uses the injected time (older than 24 h = vencida)', async () => {
    const rpc = rpcDe(() => [filaRpc('p1', { created_at: '2026-11-01T11:59:59.000Z' })])
    expect((await fetchInvitacionesServidores(rpc, ['p1'], AHORA))?.resumenes.get('p1')?.estado).toBe('vencida')
  })

  it('without ids it does not call the database', async () => {
    const rpc = jest.fn()
    expect(await fetchInvitacionesServidores(rpc, [], AHORA)).toEqual({ resumenes: new Map(), sinCuenta: new Set() })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('an RPC error means no data and logs the code only', async () => {
    const rpc = jest.fn(async () => ({ data: null, error: { code: '42501', message: 'permission denied for x@example.test' } }))
    expect(await fetchInvitacionesServidores(rpc, ['p1'], AHORA)).toBeNull()
    expect(errorSpy).toHaveBeenCalledWith('[dream-team/servidores] invitaciones lookup failed', '42501')
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('example.test')
  })

  it('a sin_cuenta error also means no data and logs the code only', async () => {
    const rpc = jest.fn(async (nombre: string) =>
      nombre === 'invitacion_cuenta_estados'
        ? { data: [filaRpc('p1')], error: null }
        : { data: null, error: { code: '42883', message: 'no function for x@example.test' } },
    )
    expect(await fetchInvitacionesServidores(rpc, ['p1'], AHORA)).toBeNull()
    expect(errorSpy).toHaveBeenCalledWith('[dream-team/servidores] invitaciones lookup failed', '42883')
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('example.test')
  })

  it('a thrown lookup also means no data', async () => {
    const rpc = jest.fn(async () => {
      throw new Error('network down for x@example.test')
    })
    expect(await fetchInvitacionesServidores(rpc, ['p1'], AHORA)).toBeNull()
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('example.test')
  })
})

describe('adjuntarInvitaciones', () => {
  const ana = fila('1', 'Ana', ID_DHAH, 'Facilitador')
  const beto = fila('2', 'Beto', ID_DHAH, 'Facilitador')

  const carla = fila('3', 'Carla', ID_DHAH, 'Facilitador')

  it('attaches the summary; null when the viewer may invite but never did; nothing without authority', async () => {
    const rpc = rpcDe(
      (ids) => ids.filter((id) => id === ana.personaId).map((id) => filaRpc(id)),
      (ids) => ids.filter((id) => id === beto.personaId),
    )
    const datos = await fetchInvitacionesServidores(rpc, [ana.personaId, beto.personaId, carla.personaId], AHORA)
    const [conAna, conBeto, conCarla] = adjuntarInvitaciones([ana, beto, carla], datos)
    expect(conAna.invitacion?.email).toBe(`${ana.personaId}@example.test`)
    expect(conBeto.invitacion).toBeNull()
    expect(conCarla.invitacion).toBeUndefined()
    expect('invitacion' in conCarla).toBe(false)
  })

  it('without authority over anyone no row carries data, so the pills stay hidden', async () => {
    const datos = await fetchInvitacionesServidores(rpcDe(), [ana.personaId, beto.personaId], AHORA)
    const filas = adjuntarInvitaciones([{ ...ana, tieneCuenta: false }, { ...beto, tieneCuenta: false }], datos)
    // calcularVistaServidores hides the pills when no row carries `invitacion` (servidores-vista-invitaciones.test.ts).
    expect(filas.every((f) => !('invitacion' in f))).toBe(true)
  })

  it('without data (failed lookup) the rows stay as they were', () => {
    const filas = [ana, beto]
    expect(adjuntarInvitaciones(filas, null)).toBe(filas)
    expect(filas.every((f) => !('invitacion' in f))).toBe(true)
  })
})
