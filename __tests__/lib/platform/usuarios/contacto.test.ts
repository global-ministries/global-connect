/**
 * Usuarios contact rule (S13 decision 6 of odd/tasks/sistema-diseno-v2.md):
 * a leader may call and WhatsApp the people of their own active Grupo de Vida;
 * the roles that see a whole campus may contact anybody they list; a miembro
 * contacts nobody from the list. Nobody gets an action for their own row or a
 * person without a usable number.
 */
import { accionesDeContacto, contactoPermitido, puedeContactar, type PersonaContactable, type VisorUsuarios } from '@/lib/platform/usuarios/contacto'

const persona = (cambios: Partial<PersonaContactable> = {}): PersonaContactable => ({
  id: 'p-1',
  telefono: '04145550101',
  esDeMiGrupo: false,
  ...cambios,
})

const visor = (roles: string[], usuarioId = 'v-1'): VisorUsuarios => ({ roles, usuarioId })

describe('puedeContactar', () => {
  it.each(['admin', 'pastor', 'director-general', 'director-etapa'])('%s contacts anybody they list', (rol) => {
    expect(puedeContactar(visor([rol]), persona())).toBe(true)
  })

  it('a leader contacts the people of their own active group', () => {
    expect(puedeContactar(visor(['lider']), persona({ esDeMiGrupo: true }))).toBe(true)
  })

  it('a leader does not contact people outside their active group', () => {
    expect(puedeContactar(visor(['lider']), persona({ esDeMiGrupo: false }))).toBe(false)
  })

  it('a miembro contacts nobody, even somebody flagged as in their group', () => {
    expect(puedeContactar(visor(['miembro']), persona({ esDeMiGrupo: true }))).toBe(false)
  })

  it('a viewer with no role contacts nobody', () => {
    expect(puedeContactar(visor([]), persona({ esDeMiGrupo: true }))).toBe(false)
  })

  it('the highest role decides: lider + pastor contacts anybody', () => {
    expect(puedeContactar(visor(['lider', 'pastor']), persona())).toBe(true)
  })

  it('nobody contacts their own row', () => {
    expect(puedeContactar(visor(['admin'], 'p-1'), persona())).toBe(false)
  })

  it.each([null, '', '   '])('a person without a number (%p) cannot be contacted', (telefono) => {
    expect(puedeContactar(visor(['admin']), persona({ telefono }))).toBe(false)
  })
})

// The panel shows WhatsApp and Llamar when the role allows contact and disables
// them without a usable number; without permission it hides them.
describe('contactoPermitido', () => {
  it('follows the role rule without looking at the number', () => {
    expect(contactoPermitido(visor(['pastor']), persona({ telefono: null }))).toBe(true)
    expect(contactoPermitido(visor(['lider']), persona({ telefono: null, esDeMiGrupo: true }))).toBe(true)
    expect(contactoPermitido(visor(['lider']), persona({ esDeMiGrupo: false }))).toBe(false)
    expect(contactoPermitido(visor(['miembro']), persona({ esDeMiGrupo: true }))).toBe(false)
  })

  it("never for the viewer's own row", () => {
    expect(contactoPermitido(visor(['admin'], 'p-1'), persona())).toBe(false)
  })
})

describe('accionesDeContacto', () => {
  it('a Venezuelan mobile gets a tel: link with the canonical number and a WhatsApp link', () => {
    expect(accionesDeContacto(visor(['lider']), persona({ telefono: '+58 414-555-0101', esDeMiGrupo: true }))).toEqual({
      llamar: 'tel:04145550101',
      whatsapp: 'https://wa.me/584145550101',
    })
  })

  it('a landline gets only the call', () => {
    expect(accionesDeContacto(visor(['admin']), persona({ telefono: '02512345678' }))).toEqual({
      llamar: 'tel:02512345678',
      whatsapp: null,
    })
  })

  it('an unrecognized number is called as stored, without spaces, and has no WhatsApp', () => {
    expect(accionesDeContacto(visor(['admin']), persona({ telefono: '+1 305 555 0100' }))).toEqual({
      llamar: 'tel:+13055550100',
      whatsapp: null,
    })
  })

  it('without permission there is no action at all', () => {
    expect(accionesDeContacto(visor(['lider']), persona())).toEqual({ llamar: null, whatsapp: null })
  })
})
