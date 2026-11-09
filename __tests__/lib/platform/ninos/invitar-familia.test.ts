/**
 * @jest-environment node
 *
 * G5 (odd/tasks/ninos-cobertura.md) and T2k (odd/tasks/ninos-checkin-pco.md,
 * S9.9) — inviting the parent of a family without an account from the desk,
 * right after registering it or at any later visit: the shared invitation
 * flow, with the campus-bound RPC deciding who may invite and how often.
 */
import type { DependenciasInvitacion } from '@/lib/platform/cuentas/invitacion-cuenta'
import { cargarCuentaFamilia, invitarFamiliaNueva } from '@/lib/platform/ninos/invitar-familia'

const PADRE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

function deps(rpcUsuario: jest.Mock, correo = { success: true }): DependenciasInvitacion {
  return {
    rpcUsuario,
    admin: {
      rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
      obtenerUsuario: jest.fn().mockResolvedValue(null),
      borrarUsuario: jest.fn().mockResolvedValue({ error: null }),
      generarEnlace: jest.fn().mockResolvedValue({ data: { userId: 'au1', hashedToken: 'h' }, error: null }),
    },
    enviarCorreo: jest.fn().mockResolvedValue(correo),
    urlBase: 'https://example.test',
  }
}

const creada = { data: { id: 'inv1', email: 'ana@example.test', nombre: 'Ana', auth_user_id_previo: null }, error: null }

describe('invitarFamiliaNueva', () => {
  it('rejects a bad email before calling anything', async () => {
    const rpc = jest.fn()
    expect(await invitarFamiliaNueva(deps(rpc), PADRE, { email: 'mal' })).toEqual({ status: 400, body: { error: 'Escribe un correo válido.' } })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('invites with the normalized email and never replaces another one', async () => {
    const rpc = jest.fn().mockResolvedValue(creada)
    const d = deps(rpc)
    const r = await invitarFamiliaNueva(d, PADRE, { email: ' ANA@example.test ', reemplazarEmail: true })
    expect(r).toEqual({ status: 200, body: { ok: true, email: 'ana@example.test' } })
    expect(rpc).toHaveBeenCalledWith('invitacion_cuenta_crear', { p_usuario_id: PADRE, p_email: 'ana@example.test', p_reemplazar_email: false })
    expect(d.enviarCorreo).toHaveBeenCalledWith(expect.objectContaining({ to: 'ana@example.test', idempotencyKey: 'invitacion-cuenta-inv1' }))
  })

  it('outside the campus of the family explains who can invite', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { code: '42501', message: 'sin_autoridad' } })
    const d = deps(rpc)
    const r = await invitarFamiliaNueva(d, PADRE, { email: 'ana@example.test' })
    expect(r).toEqual({
      status: 403,
      body: { error: 'Solo el equipo de la mesa del campus de esta familia puede invitarla.', codigo: 'sin_autoridad' },
    })
    expect(d.enviarCorreo).not.toHaveBeenCalled()
  })

  it('a second invitation of the same family within minutes waits (cooldown)', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { code: '22023', message: 'invitacion_reciente' } })
    const d = deps(rpc)
    const r = await invitarFamiliaNueva(d, PADRE, { email: 'ana@example.test' })
    expect(r).toEqual({
      status: 429,
      body: { error: 'Ya le enviamos una invitación hace poco. Espera unos minutos para reenviarla.', codigo: 'invitacion_reciente' },
    })
    expect(d.admin.generarEnlace).not.toHaveBeenCalled()
    expect(d.enviarCorreo).not.toHaveBeenCalled()
  })

  it('passes the safety refusals through with their message', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { code: '23505', message: 'email_en_uso' } })
    expect(await invitarFamiliaNueva(deps(rpc), PADRE, { email: 'ana@example.test' })).toEqual({
      status: 409,
      body: { error: 'Ese correo ya pertenece a otra persona o a otra cuenta', codigo: 'email_en_uso' },
    })
  })

  it('a failed email can be retried', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => {})
    const r = await invitarFamiliaNueva(deps(jest.fn().mockResolvedValue(creada), { success: false }), PADRE, { email: 'ana@example.test' })
    expect(r).toEqual({ status: 502, body: { error: 'No se pudo enviar el correo. Puedes reenviarlo.' } })
    expect(JSON.stringify(log.mock.calls)).not.toContain('ana@example.test')
    log.mockRestore()
  })
})

describe('cargarCuentaFamilia', () => {
  it('reads «Sin cuenta», the email of the ficha and the last invitation for that parent', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: {
        sin_cuenta: true,
        email_ficha: 'ana@example.test',
        invitacion: { estado: 'enviada', email: 'ana@example.test', created_at: '2026-11-08T10:00:00Z' },
      },
      error: null,
    })
    expect(await cargarCuentaFamilia({ rpc }, PADRE)).toEqual({
      sinCuenta: true,
      emailFicha: 'ana@example.test',
      invitacion: { estado: 'enviada', email: 'ana@example.test', enviadaEl: '2026-11-08T10:00:00Z' },
    })
    expect(rpc).toHaveBeenCalledWith('ninos_familia_cuenta', { p_padre_id: PADRE })
  })

  it('a parent with an account', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: { sin_cuenta: false }, error: null })
    expect(await cargarCuentaFamilia({ rpc }, PADRE)).toEqual({ sinCuenta: false, emailFicha: null, invitacion: null })
  })

  it('null when the database refuses or answers nothing (nothing is shown)', async () => {
    expect(await cargarCuentaFamilia({ rpc: jest.fn().mockResolvedValue({ data: null, error: { code: '42501', message: 'sin_autoridad' } }) }, PADRE)).toBeNull()
    expect(await cargarCuentaFamilia({ rpc: jest.fn().mockResolvedValue({ data: null, error: null }) }, PADRE)).toBeNull()
  })
})
