/**
 * The access email of a public reservation (T5b, S4): an invitation with no
 * inviter (origen taller_publico) gets the "Activa tu cuenta Global" copy; a
 * spouse invitation keeps the existing one.
 */
import { AccesoTallerConyugeEmail } from '@/emails/acceso-taller-conyuge'
import { AccesoTallerPublicoEmail } from '@/emails/acceso-taller-publico'
import { enviarInvitacionAcceso } from '@/lib/platform/talleres/invitacion-acceso-envio'

function crearDeps(nombreInvitante: string | null) {
  const rpc = jest.fn(async (nombre: string) =>
    nombre === 'invitacion_acceso_preparar_envio'
      ? {
          data: { ok: true, email: 'daniela@example.com', nombre_invitado: 'Daniela', nombre_invitante: nombreInvitante, taller_nombre: 'Mujer de Hoy' },
          error: null,
        }
      : { data: { ok: true }, error: null },
  )
  const enviarCorreo = jest.fn().mockResolvedValue({ success: true })
  return { enviarCorreo, deps: { admin: { rpc }, enviarCorreo, ahora: () => new Date('2026-11-10T12:00:00Z'), urlBase: 'https://connect.example.org' } }
}

describe('access email copy', () => {
  it('uses the public template when nobody invited the person', async () => {
    const { enviarCorreo, deps } = crearDeps(null)
    expect(await enviarInvitacionAcceso('inv-1', deps)).toBe('enviada')
    const correo = enviarCorreo.mock.calls[0][0]
    expect(correo.template.type).toBe(AccesoTallerPublicoEmail)
    expect(correo.template.props).toMatchObject({ nombreInvitado: 'Daniela', tallerNombre: 'Mujer de Hoy' })
    expect(correo.template.props.urlActivar).toMatch(/^https:\/\/connect\.example\.org\/activar\/[A-Za-z0-9_-]{43}$/)
  })

  it('keeps the spouse template when a member invited them', async () => {
    const { enviarCorreo, deps } = crearDeps('Luis Pérez')
    await enviarInvitacionAcceso('inv-2', deps)
    const correo = enviarCorreo.mock.calls[0][0]
    expect(correo.template.type).toBe(AccesoTallerConyugeEmail)
    expect(correo.template.props).toMatchObject({ nombreInvitante: 'Luis Pérez' })
  })
})
