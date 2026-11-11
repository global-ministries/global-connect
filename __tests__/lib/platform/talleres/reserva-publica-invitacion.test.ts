/**
 * The access email of a public reservation (T5b, S4): the copy follows
 * `invitaciones_acceso.origen`. A taller_publico invitation gets the "Activa
 * tu cuenta Global" copy; a spouse invitation (taller_pareja) keeps the
 * existing one even when its inviter was deleted (creado_por NULL).
 */
import { AccesoTallerConyugeEmail } from '@/emails/acceso-taller-conyuge'
import { AccesoTallerPublicoEmail } from '@/emails/acceso-taller-publico'
import { enviarInvitacionAcceso } from '@/lib/platform/talleres/invitacion-acceso-envio'

type Lectura = { data: unknown; error: { message: string } | null }

function crearDeps(nombreInvitante: string | null, lectura: Lectura) {
  const rpc = jest.fn(async (nombre: string) =>
    nombre === 'invitacion_acceso_preparar_envio'
      ? {
          data: { ok: true, email: 'daniela@example.com', nombre_invitado: 'Daniela', nombre_invitante: nombreInvitante, taller_nombre: 'Mujer de Hoy' },
          error: null,
        }
      : { data: { ok: true }, error: null },
  )
  const maybeSingle = jest.fn(async () => lectura)
  const eq = jest.fn(() => ({ maybeSingle }))
  const select = jest.fn(() => ({ eq }))
  const from = jest.fn(() => ({ select }))
  const enviarCorreo = jest.fn().mockResolvedValue({ success: true })
  return {
    rpc,
    from,
    select,
    eq,
    enviarCorreo,
    deps: { admin: { rpc, from }, enviarCorreo, ahora: () => new Date('2026-11-10T12:00:00Z'), urlBase: 'https://connect.example.org' },
  }
}

const origen = (id: string, valor: string): Lectura => ({ data: { id, origen: valor }, error: null })

let errorLog: jest.SpyInstance
beforeEach(() => {
  errorLog = jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => errorLog.mockRestore())

describe('access email copy', () => {
  it('uses the public template for an origen taller_publico invitation', async () => {
    const { from, select, eq, enviarCorreo, deps } = crearDeps(null, origen('inv-1', 'taller_publico'))
    expect(await enviarInvitacionAcceso('inv-1', deps)).toBe('enviada')
    expect(from).toHaveBeenCalledWith('invitaciones_acceso')
    expect(select).toHaveBeenCalledWith('id, origen')
    expect(eq).toHaveBeenCalledWith('id', 'inv-1')
    const correo = enviarCorreo.mock.calls[0][0]
    expect(correo.template.type).toBe(AccesoTallerPublicoEmail)
    expect(correo.template.props).toMatchObject({ nombreInvitado: 'Daniela', tallerNombre: 'Mujer de Hoy' })
    expect(correo.template.props.urlActivar).toMatch(/^https:\/\/connect\.example\.org\/activar\/[A-Za-z0-9_-]{43}$/)
  })

  it('keeps the spouse template when a member invited them', async () => {
    const { enviarCorreo, deps } = crearDeps('Luis Pérez', origen('inv-2', 'taller_pareja'))
    await enviarInvitacionAcceso('inv-2', deps)
    const correo = enviarCorreo.mock.calls[0][0]
    expect(correo.template.type).toBe(AccesoTallerConyugeEmail)
    expect(correo.template.props).toMatchObject({ nombreInvitante: 'Luis Pérez' })
  })

  it('a taller_pareja invitation whose inviter was deleted keeps the spouse template with "Tu pareja"', async () => {
    const { enviarCorreo, deps } = crearDeps(null, origen('inv-3', 'taller_pareja'))
    expect(await enviarInvitacionAcceso('inv-3', deps)).toBe('enviada')
    const correo = enviarCorreo.mock.calls[0][0]
    expect(correo.template.type).toBe(AccesoTallerConyugeEmail)
    expect(correo.template.props).toMatchObject({ nombreInvitante: 'Tu pareja', nombreInvitado: 'Daniela', tallerNombre: 'Mujer de Hoy' })
  })

  it('a failed origen read sends nothing and prepares no token (the invitation stays pending)', async () => {
    const { rpc, enviarCorreo, deps } = crearDeps(null, { data: null, error: { message: 'boom' } })
    expect(await enviarInvitacionAcceso('inv-4', deps)).toBe('fallida')
    expect(rpc).not.toHaveBeenCalled()
    expect(enviarCorreo).not.toHaveBeenCalled()
    expect(JSON.stringify(errorLog.mock.calls)).toContain('inv-4')
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain('boom')
  })
})
