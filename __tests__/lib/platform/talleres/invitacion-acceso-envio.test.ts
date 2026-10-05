import { createHash } from 'node:crypto'

import {
  enviarInvitacionAcceso,
  enviarInvitacionesPendientes,
  generarTokenInvitacion,
  hashTokenInvitacion,
} from '@/lib/platform/talleres/invitacion-acceso-envio'

type Respuesta = { data: unknown; error: { message: string } | null }

const PREPARADA = {
  ok: true,
  email: 'ana@example.com',
  nombre_invitado: 'Ana',
  nombre_invitante: 'Luis',
  taller_nombre: 'Matrimonio sobre la Roca',
}

function crearDeps(respuestas: Record<string, Respuesta | ((args: Record<string, unknown>) => Respuesta)> = {}) {
  const rpc = jest.fn((nombre: string, args?: Record<string, unknown>) => {
    const r = respuestas[nombre]
    if (typeof r === 'function') return Promise.resolve(r(args ?? {}))
    return Promise.resolve(r ?? { data: null, error: null })
  })
  const enviarCorreo = jest.fn().mockResolvedValue({ success: true, id: 'mail-1' })
  return {
    rpc,
    enviarCorreo,
    deps: {
      admin: { rpc },
      enviarCorreo,
      ahora: () => new Date('2026-10-04T12:00:00Z'),
      urlBase: 'https://connect.example.org',
    },
  }
}

describe('token helpers', () => {
  it('generates a 32-byte url-safe token', () => {
    const token = generarTokenInvitacion()
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(generarTokenInvitacion()).not.toBe(token)
  })

  it('hashes with sha256 hex', () => {
    expect(hashTokenInvitacion('abc')).toBe(createHash('sha256').update('abc').digest('hex'))
  })
})

describe('enviarInvitacionAcceso', () => {
  it('stores only the hash, emails the raw token link and records the success', async () => {
    const { rpc, enviarCorreo, deps } = crearDeps({ invitacion_acceso_preparar_envio: { data: PREPARADA, error: null } })

    const resultado = await enviarInvitacionAcceso('inv-1', deps)

    expect(resultado).toBe('enviada')
    const preparar = rpc.mock.calls.find(([n]) => n === 'invitacion_acceso_preparar_envio')?.[1] as Record<string, string>
    expect(preparar.p_invitacion_id).toBe('inv-1')
    expect(preparar.p_token_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(preparar.p_expira_en).toBe('2026-10-11T12:00:00.000Z')

    const correo = enviarCorreo.mock.calls[0][0]
    expect(correo.to).toBe('ana@example.com')
    const html = JSON.stringify(correo.template.props)
    const token = /\/activar\/([A-Za-z0-9_-]{43})/.exec(html)?.[1]
    expect(token).toBeDefined()
    expect(hashTokenInvitacion(token as string)).toBe(preparar.p_token_hash)

    expect(rpc).toHaveBeenCalledWith('invitacion_acceso_registrar_envio', { p_id: 'inv-1', p_ok: true, p_error: null })
  })

  it('records a failed send without the token or the address', async () => {
    const { rpc, enviarCorreo, deps } = crearDeps({ invitacion_acceso_preparar_envio: { data: PREPARADA, error: null } })
    enviarCorreo.mockResolvedValueOnce({ success: false, error: 'rate limited' })

    expect(await enviarInvitacionAcceso('inv-1', deps)).toBe('fallida')
    expect(rpc).toHaveBeenCalledWith('invitacion_acceso_registrar_envio', {
      p_id: 'inv-1',
      p_ok: false,
      p_error: 'rate limited',
    })
  })

  it('records a thrown send as a failure', async () => {
    const { rpc, enviarCorreo, deps } = crearDeps({ invitacion_acceso_preparar_envio: { data: PREPARADA, error: null } })
    enviarCorreo.mockRejectedValueOnce(new Error('network'))

    expect(await enviarInvitacionAcceso('inv-1', deps)).toBe('fallida')
    expect(rpc).toHaveBeenCalledWith('invitacion_acceso_registrar_envio', {
      p_id: 'inv-1',
      p_ok: false,
      p_error: 'network',
    })
  })

  it('skips an invitation the database refuses to prepare', async () => {
    const { rpc, enviarCorreo, deps } = crearDeps({
      invitacion_acceso_preparar_envio: { data: { ok: false, codigo: 'YA_USADA' }, error: null },
    })

    expect(await enviarInvitacionAcceso('inv-1', deps)).toBe('omitida')
    expect(enviarCorreo).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalledWith('invitacion_acceso_registrar_envio', expect.anything())
  })

  it('never throws when the database fails', async () => {
    const { enviarCorreo, deps } = crearDeps({
      invitacion_acceso_preparar_envio: { data: null, error: { message: 'boom' } },
    })
    expect(await enviarInvitacionAcceso('inv-1', deps)).toBe('fallida')
    expect(enviarCorreo).not.toHaveBeenCalled()
  })
})

describe('enviarInvitacionesPendientes', () => {
  it('sends every pending invitation and counts the outcomes', async () => {
    const { enviarCorreo, deps } = crearDeps({
      invitacion_acceso_pendientes_de_envio: { data: [{ id: 'a' }, { id: 'b' }], error: null },
      invitacion_acceso_preparar_envio: { data: PREPARADA, error: null },
    })
    enviarCorreo.mockResolvedValueOnce({ success: true }).mockResolvedValueOnce({ success: false, error: 'x' })

    expect(await enviarInvitacionesPendientes(deps)).toEqual({ enviadas: 1, fallidas: 1, omitidas: 0 })
  })

  it('returns zero counts when the pending list fails', async () => {
    const { deps } = crearDeps({ invitacion_acceso_pendientes_de_envio: { data: null, error: { message: 'x' } } })
    expect(await enviarInvitacionesPendientes(deps)).toEqual({ enviadas: 0, fallidas: 0, omitidas: 0 })
  })
})
