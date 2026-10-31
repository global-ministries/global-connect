import {
  accionesFicha,
  avisosFicha,
  consultaConRango,
  consultaConTab,
  enlaceAsistenciaGrupo,
  leerRango,
  leerTab,
  puedeAdministrarCuenta,
  rolPrincipal,
  telefonoPorRevisar,
  TABS_FICHA,
} from '@/lib/platform/usuarios/ficha-vista'

const persona = { id: 'u-2', email: 'ana@example.com', telefono: '04141234567', esDeMiGrupo: false }

describe('ficha tabs and the URL', () => {
  it('lists the six tabs in the approved order', () => {
    expect(TABS_FICHA.map((t) => t.etiqueta)).toEqual(['Datos', 'Familia', 'Grupos', 'Asistencia', 'Servicio', 'Cuenta'])
  })

  it('reads ?tab= and falls back to Datos', () => {
    expect(leerTab('asistencia')).toBe('asistencia')
    expect(leerTab('cuenta')).toBe('cuenta')
    expect(leerTab(null)).toBe('datos')
    expect(leerTab('ruta-crecimiento')).toBe('datos')
  })

  it('writes the tab and keeps the other params; Datos drops it', () => {
    expect(consultaConTab('', 'familia')).toBe('?tab=familia')
    expect(consultaConTab('?tab=familia&desde=2026-08-01', 'asistencia')).toBe('?tab=asistencia&desde=2026-08-01')
    expect(consultaConTab('?tab=familia', 'datos')).toBe('')
  })

  it('reads a valid Desde/Hasta range and ignores the rest', () => {
    expect(leerRango({ desde: '2026-08-01', hasta: '2026-10-29' })).toEqual({ desde: '2026-08-01', hasta: '2026-10-29' })
    expect(leerRango({ desde: 'ayer', hasta: '2026-02-31' })).toEqual({})
    expect(leerRango({ desde: ['2026-01-01'] })).toEqual({ desde: '2026-01-01' })
  })

  it('writes the range on the Asistencia tab', () => {
    expect(consultaConRango('?tab=asistencia', '2026-08-01', '2026-10-29')).toBe('?tab=asistencia&desde=2026-08-01&hasta=2026-10-29')
    expect(consultaConRango('?tab=asistencia&desde=2026-01-01', '', '')).toBe('?tab=asistencia')
  })
})

describe('header actions per viewer', () => {
  it('lets a campus role call, WhatsApp and email', () => {
    const a = accionesFicha({ roles: ['pastor'], usuarioId: 'u-1' }, persona, false)
    expect(a.contactoPermitido).toBe(true)
    expect(a.llamar).toBe('tel:04141234567')
    expect(a.whatsapp).toBe('https://wa.me/584141234567')
    expect(a.email).toBe('mailto:ana@example.com')
    expect(a.editar).toBe(false)
    expect(a.motivo).toBeNull()
  })

  it('lets a leader contact only the people of their own group', () => {
    const lider = { roles: ['lider'], usuarioId: 'u-1' }
    expect(accionesFicha(lider, { ...persona, esDeMiGrupo: true }, true).llamar).toBe('tel:04141234567')
    const ajeno = accionesFicha(lider, persona, false)
    expect(ajeno.contactoPermitido).toBe(false)
    expect(ajeno.llamar).toBeNull()
    expect(ajeno.whatsapp).toBeNull()
  })

  it('gives a miembro email only, and Editar follows puede_editar', () => {
    const a = accionesFicha({ roles: ['miembro'], usuarioId: 'u-1' }, persona, true)
    expect(a.contactoPermitido).toBe(false)
    expect(a.email).toBe('mailto:ana@example.com')
    expect(a.editar).toBe(true)
  })

  it('explains the disabled contact buttons', () => {
    const admin = { roles: ['admin'], usuarioId: 'u-1' }
    expect(accionesFicha(admin, { ...persona, telefono: null }, true).motivo).toBe(
      'Sin teléfono registrado: WhatsApp y Llamar no están disponibles.',
    )
    const revisar = accionesFicha(admin, { ...persona, telefono: '123' }, true)
    expect(revisar.whatsapp).toBeNull()
    expect(revisar.llamar).toBe('tel:123')
    expect(revisar.motivo).toBe('El teléfono necesita revisión, así que WhatsApp no está disponible.')
    expect(accionesFicha(admin, { ...persona, telefono: '02512345678' }, true).motivo).toBe(
      'Es un teléfono fijo, así que WhatsApp no está disponible.',
    )
    expect(accionesFicha(admin, { ...persona, email: null }, true).motivo).toBe('Sin email registrado.')
  })

  it('never offers contact on the viewer\u2019s own ficha', () => {
    expect(accionesFicha({ roles: ['admin'], usuarioId: 'u-2' }, persona, true).contactoPermitido).toBe(false)
  })
})

describe('notices, role and account', () => {
  it('flags a phone that is not a Venezuelan number', () => {
    expect(telefonoPorRevisar('123')).toBe(true)
    expect(telefonoPorRevisar('0414-123.45.67')).toBe(false)
    expect(telefonoPorRevisar(null)).toBe(false)
  })

  it('builds the notices: phone review, no account, no group', () => {
    expect(avisosFicha({ telefono: '123', cuenta: 'no', tieneGrupo: false }).map((a) => a.id)).toEqual(['telefono', 'cuenta', 'grupo'])
    expect(avisosFicha({ telefono: '123', cuenta: 'invitada', tieneGrupo: true })[1].titulo).toBe('Invitación enviada, todavía sin cuenta')
    expect(avisosFicha({ telefono: '04141234567', cuenta: 'si', tieneGrupo: null })).toEqual([])
    expect(avisosFicha({ telefono: null, cuenta: null, tieneGrupo: true })).toEqual([])
  })

  it('reads the role from either RPC shape', () => {
    expect(rolPrincipal(['lider'])).toEqual({ interno: 'lider', etiqueta: 'Líder' })
    expect(rolPrincipal([{ nombre_interno: 'pastor', nombre_visible: 'Pastor' }])).toEqual({ interno: 'pastor', etiqueta: 'Pastor' })
    expect(rolPrincipal(['miembro', 'admin'])).toEqual({ interno: 'admin', etiqueta: 'Administrador' })
    expect(rolPrincipal([])).toEqual({ interno: 'sin-rol', etiqueta: 'Sin rol' })
  })

  it('keeps password and role changes for admin', () => {
    expect(puedeAdministrarCuenta(['admin'])).toBe(true)
    expect(puedeAdministrarCuenta(['pastor', 'director-general'])).toBe(false)
  })

  it('links the leader callout to the group attendance', () => {
    expect(enlaceAsistenciaGrupo({ tipo: 'gdv', id: 'g-1', nombre: 'Mujeres de Fe' })).toBe('/grupos-vida/g-1/asistencia')
    expect(enlaceAsistenciaGrupo({ tipo: 'estudiantes', id: 'e-1', nombre: 'Transit 1' })).toBe('/estudiantes/grupos?q=Transit+1')
  })
})
