/**
 * @jest-environment node
 *
 * G5 (odd/tasks/ninos-cobertura.md) — inviting the new adult of a family
 * registered at the table: the shared invitation flow, with the
 * table-bound RPC deciding who may invite and until when.
 */
import type { DependenciasInvitacion } from '@/lib/platform/cuentas/invitacion-cuenta'
import { invitarFamiliaNueva } from '@/lib/platform/ninos/invitar-familia'

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

  it('after the hour, or for someone else, explains where to invite instead', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { code: '42501', message: 'sin_autoridad' } })
    const r = await invitarFamiliaNueva(deps(rpc), PADRE, { email: 'ana@example.test' })
    expect(r.status).toBe(403)
    expect(r.body).toMatchObject({ codigo: 'sin_autoridad' })
    expect(String(r.body.error)).toMatch(/Un coordinador puede invitarla desde su ficha/)
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
