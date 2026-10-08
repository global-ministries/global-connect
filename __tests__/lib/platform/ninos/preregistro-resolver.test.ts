/**
 * @jest-environment node
 *
 * N8 — confirming or discarding a pre-registration at the table, then the
 * welcome email and the account invitation.
 */
import type { FamiliaPayload } from '@/lib/platform/ninos/familia'
import { parseResolucion, resolverPreregistro, type DependenciasResolver } from '@/lib/platform/ninos/preregistro-resolver'

const ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const payload = {
  padre: { nombre: 'Ana', apellido: 'Pérez', telefono: '04145551234', cedula: null, genero: 'Femenino' },
  hijos: [{ nombre: 'Sofía', apellido: 'Pérez', fecha_nacimiento: '2021-03-04', genero: 'Femenino' }],
  autorizados: [],
} as unknown as FamiliaPayload

let pendientes: Array<() => Promise<void>> = []
/** Runs the tasks the resolver left for after the response. */
async function despuesDeResponder() {
  const tareas = pendientes
  pendientes = []
  for (const t of tareas) await t()
}

function deps(over: Partial<DependenciasResolver> = {}): DependenciasResolver {
  pendientes = []
  return {
    enSegundoPlano: (tarea) => {
      pendientes.push(tarea)
    },
    rpcUsuario: jest.fn().mockResolvedValue({ data: { padre_id: 'p1', padre_nuevo: true, estado: 'confirmado' }, error: null }),
    enviarBienvenida: jest.fn().mockResolvedValue({ success: true }),
    invitar: jest.fn().mockResolvedValue({ ok: true, email: 'ana@example.test' }),
    ...over,
  }
}

describe('parseResolucion', () => {
  it('accepts discard and confirm with a payload and an optional email', () => {
    expect(parseResolucion({ accion: 'descartar' })).toEqual({ accion: 'descartar' })
    expect(parseResolucion({ accion: 'confirmar', payload, email: ' ANA@example.test ' })).toEqual({
      accion: 'confirmar', payload, email: 'ana@example.test',
    })
    expect(parseResolucion({ accion: 'confirmar', payload, email: '' })).toEqual({ accion: 'confirmar', payload, email: null })
  })
  it('rejects anything else', () => {
    expect(parseResolucion({ accion: 'borrar' })).toHaveProperty('error')
    expect(parseResolucion({ accion: 'confirmar' })).toHaveProperty('error')
    expect(parseResolucion({ accion: 'confirmar', payload, email: 'mal' })).toHaveProperty('error')
    expect(parseResolucion(null)).toHaveProperty('error')
  })
})

describe('resolverPreregistro', () => {
  it('discards through the RPC as the caller', async () => {
    const d = deps({ rpcUsuario: jest.fn().mockResolvedValue({ data: { estado: 'descartado' }, error: null }) })
    const r = await resolverPreregistro(d, ID, { accion: 'descartar' })
    expect(r).toEqual({ status: 200, body: { ok: true, estado: 'descartado' } })
    expect(d.rpcUsuario).toHaveBeenCalledWith('ninos_preregistro_resolver', { p_id: ID, p_accion: 'descartar' })
    expect(d.enviarBienvenida).not.toHaveBeenCalled()
  })

  it('confirms with the email inside the stored payload, welcomes and invites', async () => {
    const d = deps()
    const r = await resolverPreregistro(d, ID, { accion: 'confirmar', payload, email: 'ana@example.test' })
    expect(d.rpcUsuario).toHaveBeenCalledWith('ninos_preregistro_resolver', {
      p_id: ID, p_accion: 'confirmar', p_payload: { ...payload, padre: { ...payload.padre, email: 'ana@example.test' } },
    })
    expect(d.invitar).toHaveBeenCalledWith('ana@example.test')
    expect(r).toEqual({ status: 200, body: { ok: true, estado: 'confirmado', padreId: 'p1', correo: 'programado', invitacion: 'enviada' } })
    expect(d.enviarBienvenida).not.toHaveBeenCalled()
    await despuesDeResponder()
    expect(d.enviarBienvenida).toHaveBeenCalledWith({ to: 'ana@example.test', nombre: 'Ana', idempotencyKey: `ninos-bienvenida-${ID}` })
  })

  it('without email sends nothing', async () => {
    const d = deps()
    const r = await resolverPreregistro(d, ID, { accion: 'confirmar', payload, email: null })
    await despuesDeResponder()
    expect(d.enviarBienvenida).not.toHaveBeenCalled()
    expect(d.invitar).not.toHaveBeenCalled()
    expect(r.body).toMatchObject({ correo: 'sin_correo', invitacion: 'no' })
  })

  it('a parent who already has an account gets the welcome but no invitation', async () => {
    const d = deps({ invitar: jest.fn().mockResolvedValue({ ok: false, status: 409, error: 'x', codigo: 'ya_tiene_cuenta' }) })
    const r = await resolverPreregistro(d, ID, { accion: 'confirmar', payload, email: 'ana@example.test' })
    expect(r.body).toMatchObject({ ok: true, correo: 'programado', invitacion: 'no' })
  })

  it('email failures never undo the confirmation', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => {})
    const d = deps({
      enviarBienvenida: jest.fn().mockRejectedValue(new Error('resend down ana@example.test')),
      invitar: jest.fn().mockResolvedValue({ ok: false, status: 502, error: 'x' }),
    })
    const r = await resolverPreregistro(d, ID, { accion: 'confirmar', payload, email: 'ana@example.test' })
    expect(r).toEqual({ status: 200, body: { ok: true, estado: 'confirmado', padreId: 'p1', correo: 'programado', invitacion: 'fallo' } })
    await expect(despuesDeResponder()).resolves.toBeUndefined()
    expect(log).toHaveBeenCalledWith('[ninos/preregistro] bienvenida falló:', ID)
    expect(JSON.stringify(log.mock.calls)).not.toContain('ana@example.test')
    log.mockRestore()
  })

  it('maps the database errors', async () => {
    const con = (error: object) => deps({ rpcUsuario: jest.fn().mockResolvedValue({ data: null, error }) })
    expect((await resolverPreregistro(con({ code: '42501', message: 'sin_autoridad' }), ID, { accion: 'descartar' })).status).toBe(403)
    const existente = await resolverPreregistro(con({ code: '23505', message: 'padre_existente' }), ID, { accion: 'confirmar', payload, email: null })
    expect(existente).toEqual({
      status: 409,
      body: { error: 'Ya existe una persona con ese teléfono o cédula. Confírmala antes de guardar.', codigo: 'padre_existente' },
    })
    expect((await resolverPreregistro(con({ code: '22023', message: 'preregistro_resuelto' }), ID, { accion: 'descartar' })).status).toBe(409)
  })
})
