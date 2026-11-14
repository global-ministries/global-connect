/**
 * T16b (odd/tasks/dps-asistencia-pco.md, S14.1, S14.2, S14.5, S14.6;
 * artboards design/dps-avisos-correo 01 and 02) — the service notice e-mail:
 * the subject and title of each case (one invitation, several Sundays, a
 * change of hours that keeps the answer, a change of puesto that asks again,
 * «Ya no estás programado», and everything together), «Confirmar» / «No
 * puedo» only where an answer is asked, the before → after, the Global logo
 * (EmailLayout), that replying reaches the planner, and the same texts in the
 * plain-text version. Every person is fictitious.
 */
import { renderToStaticMarkup } from 'react-dom/server'

import {
  AvisoServicioEmail,
  asuntoAvisoServicio,
  contenidoAvisoServicio,
  textoAvisoServicio,
  type AvisoServicioEmailProps,
  type BloqueEmail,
} from '@/emails/dps/aviso-servicio'

const SIN_CAMBIOS = { roles: null, fecha: null, horarios: null, llegada: null }
const bloque = (parche: Partial<BloqueEmail> = {}): BloqueEmail => ({
  aviso: 'nueva',
  fecha: '2026-11-15',
  tipo: 'domingo',
  titulo: null,
  serie: 'Tu casa tiene influencers',
  semana: 4,
  roles: [{ nombre: 'Comunicador', equipo: 'Producción Creativa' }],
  horarios: ['09:00', '11:30'],
  llegada: '07:30',
  estado: 'pendiente',
  antes: SIN_CAMBIOS,
  urlConfirmar: 'https://connect.example/dps/confirmar/TOKEN15',
  urlNoPuedo: 'https://connect.example/mis-servicios/p15#no-puedo',
  urlVer: 'https://connect.example/mis-servicios/p15',
  ...parche,
})
const props = (bloques: BloqueEmail[], parche: Partial<AvisoServicioEmailProps> = {}): AvisoServicioEmailProps => ({
  nombre: 'Valentina',
  remitente: 'Andrés Valero',
  respondeA: true,
  bloques,
  ...parche,
})
const html = (p: AvisoServicioEmailProps) => renderToStaticMarkup(<AvisoServicioEmail {...p} />)

const CAMBIO_HORA = bloque({
  aviso: 'cambio',
  fecha: '2026-11-29',
  serie: 'Tu casa tiene influencers',
  semana: 6,
  estado: 'confirmo',
  horarios: ['11:30'],
  llegada: '10:00',
  antes: { roles: null, fecha: null, horarios: ['09:00', '11:30'], llegada: '07:30' },
  urlConfirmar: null,
  urlNoPuedo: null,
  urlVer: 'https://connect.example/mis-servicios/p29',
})
const CAMBIO_PUESTO = bloque({
  aviso: 'cambio',
  roles: [{ nombre: 'Host', equipo: 'Producción Creativa' }],
  antes: { roles: [{ nombre: 'Comunicador', equipo: 'Producción Creativa' }], fecha: null, horarios: null, llegada: null },
})
const QUITADO = bloque({
  aviso: 'quitado',
  fecha: '2026-11-22',
  semana: 5,
  roles: [{ nombre: 'Host', equipo: 'Producción Creativa' }],
  urlConfirmar: null,
  urlNoPuedo: null,
  urlVer: 'https://connect.example/mis-servicios',
})

describe('one invitation (01 · A)', () => {
  const p = props([bloque()])

  it('says who, when and what in the subject and the title', () => {
    expect(asuntoAvisoServicio(p)).toBe('Te invitamos a servir el domingo 15 · Comunicador')
    const c = contenidoAvisoServicio(p)
    expect(c.titulo).toBe('Te invitamos a servir el domingo 15')
    expect(c.preview).toBe('Servicios 9:00 y 11:30 · llegada 7:30. Confirma con un toque.')
    expect(c.parrafos).toEqual(['¡Hola, Valentina! Andrés Valero te programó para servir este domingo. Revisa los detalles y dinos si puedes.'])
  })

  it('renders the Global logo, the service and the two buttons with their links', () => {
    const h = html(p)
    expect(h).toContain('logo-global.png')
    expect(h).toContain('Domingo 15 de noviembre')
    expect(h).toContain('Tu casa tiene influencers · Parte 4')
    expect(h).toContain('Comunicador · Producción Creativa')
    expect(h).toContain('href="https://connect.example/dps/confirmar/TOKEN15"')
    expect(h).toContain('href="https://connect.example/mis-servicios/p15#no-puedo"')
    expect(h).toMatch(/>Confirmar</)
    expect(h).toMatch(/>No puedo</)
    expect(h).toContain('Confirmas con un toque, sin iniciar sesión.')
  })

  it('tells that replying reaches the planner (S14.1)', () => {
    const h = html(p)
    expect(h).toContain('¿Dudas? Responde este correo y le llega a Andrés Valero.')
    expect(h).toContain('Si respondes este correo, tu respuesta le llega a Andrés Valero.')
    const sinCorreo = html(props([bloque()], { respondeA: false }))
    expect(sinCorreo).toContain('¿Dudas? Escríbele a quien planifica tu equipo.')
    expect(sinCorreo).not.toContain('Si respondes este correo')
  })

  it('has the same content as plain text, with the links spelled out', () => {
    const t = textoAvisoServicio(p)
    expect(t).toContain('DREAM TEAM · GLOBAL BARQUISIMETO')
    expect(t).toContain('Te invitamos a servir el domingo 15')
    expect(t).toContain('DOMINGO 15 DE NOVIEMBRE')
    expect(t).toContain('Tu puesto: Comunicador · Producción Creativa')
    expect(t).toContain('Servicios: 9:00 y 11:30')
    expect(t).toContain('Llegada: 7:30')
    expect(t).toContain('Confirmar (un toque, sin iniciar sesión):\nhttps://connect.example/dps/confirmar/TOKEN15')
    expect(t).toContain('No puedo (abre Global Connect para escribir el motivo):\nhttps://connect.example/mis-servicios/p15#no-puedo')
    expect(t).not.toMatch(/<[a-z]/i)
  })
})

describe('several Sundays in one e-mail (01 · B)', () => {
  const p = props([
    bloque({ fecha: '2026-12-06', urlConfirmar: 'https://c/x/T6' }),
    bloque({ fecha: '2026-11-15' }),
    bloque({ fecha: '2026-11-29', urlConfirmar: 'https://c/x/T29' }),
  ])

  it('lists the dates in the subject and keeps one answer per Sunday, in date order', () => {
    expect(asuntoAvisoServicio(p)).toBe('Te invitamos a servir 3 domingos · 15 nov, 29 nov y 6 dic')
    const c = contenidoAvisoServicio(p)
    expect(c.titulo).toBe('Te invitamos a servir 3 domingos')
    expect(c.secciones[0].bloques.map((b) => b.fecha)).toEqual(['Domingo 15 de noviembre', 'Domingo 29 de noviembre', 'Domingo 6 de diciembre'])
    expect(c.secciones[0].bloques.every((b) => b.botones !== null)).toBe(true)
    expect(html(p).match(/>Confirmar</g)).toHaveLength(3)
  })

  it('asks once for a Sunday with two puestos', () => {
    const c = contenidoAvisoServicio(props([bloque({ roles: [{ nombre: 'Comunicador', equipo: 'PC' }, { nombre: 'Host', equipo: 'PC' }] })]))
    expect(c.asunto).toBe('Te invitamos a servir el domingo 15 · Comunicador y Host')
    expect(c.secciones[0].bloques[0].botones?.pista).toBe('Confirmas con un toque, sin iniciar sesión. Una respuesta vale para tus dos puestos de ese día.')
  })
})

describe('«Cambió tu servicio» (02)', () => {
  it('hours only: still confirmed, before → after, no buttons', () => {
    const p = props([CAMBIO_HORA])
    expect(asuntoAvisoServicio(p)).toBe('Cambió tu servicio del domingo 29 · Comunicador')
    expect(contenidoAvisoServicio(p).parrafos[0]).toBe(
      '¡Hola, Valentina! Andrés Valero cambió la hora de tu servicio. Como tu puesto es el mismo, sigues confirmado: no tienes que hacer nada.',
    )
    const h = html(p)
    expect(h).toContain('Sigues confirmado')
    expect(h).not.toMatch(/>Confirmar</)
    expect(h).toContain('Ver o cambiar mi respuesta')
    const t = textoAvisoServicio(p)
    expect(t).toContain('Servicios: antes 9:00 y 11:30 → ahora 11:30 (cambió)')
    expect(t).toContain('Llegada: antes 7:30 → ahora 10:00 (cambió)')
  })

  it('another puesto: confirm again with the buttons', () => {
    const p = props([CAMBIO_PUESTO])
    expect(asuntoAvisoServicio(p)).toBe('Cambió tu puesto del domingo 15 · ahora Host')
    expect(contenidoAvisoServicio(p).parrafos[0]).toBe('¡Hola, Valentina! Andrés Valero te cambió de puesto. Como es otro puesto, necesitamos que confirmes de nuevo.')
    expect(html(p)).toMatch(/>Confirmar</)
    expect(textoAvisoServicio(p)).toContain('Tu puesto: antes Comunicador → ahora Host (cambió) · Producción Creativa')
  })
})

describe('«Ya no estás programado» (02)', () => {
  it('is kind, has no buttons and links Mis servicios', () => {
    const p = props([QUITADO])
    expect(asuntoAvisoServicio(p)).toBe('Ya no estás programado el domingo 22 · Host')
    expect(contenidoAvisoServicio(p).parrafos).toEqual([
      '¡Hola, Valentina! Andrés Valero ajustó el equipo del domingo 22 y ese día ya no te toca servir como Host.',
      'No tienes que hacer nada. Gracias por tu disposición; te avisaremos cuando te toque de nuevo.',
    ])
    const h = html(p)
    expect(h).not.toMatch(/>Confirmar</)
    expect(h).toContain('href="https://connect.example/mis-servicios"')
    expect(textoAvisoServicio(p)).toContain('Puesto: Host · Producción Creativa (ya no)')
  })
})

describe('everything of one send together (02 · combinado)', () => {
  it('groups invitation, change and removal under their headings', () => {
    const p = props([QUITADO, CAMBIO_HORA, bloque()])
    const c = contenidoAvisoServicio(p)
    expect(c.asunto).toBe('Novedades de tus servicios · domingos 15, 22 y 29')
    expect(c.titulo).toBe('Novedades de tus servicios')
    expect(c.preview).toBe('Te invitamos el 15, cambió el 29 y ya no estás el 22.')
    expect(c.secciones.map((s) => s.titulo)).toEqual(['Nueva invitación · responde', 'Cambió tu servicio', 'Ya no estás programado'])
    expect(c.secciones[0].bloques[0].estado).toEqual({ texto: 'Pendiente de respuesta', tono: 'aviso' })
    const t = textoAvisoServicio(p)
    expect(t.indexOf('NUEVA INVITACIÓN · RESPONDE')).toBeLessThan(t.indexOf('CAMBIÓ TU SERVICIO'))
    expect(t.indexOf('CAMBIÓ TU SERVICIO')).toBeLessThan(t.indexOf('YA NO ESTÁS PROGRAMADO'))
  })

  it('greets without a name and without a planner', () => {
    const c = contenidoAvisoServicio(props([bloque()], { nombre: '', remitente: null, respondeA: false }))
    expect(c.parrafos[0]).toBe('¡Hola! Te programaron para servir este domingo. Revisa los detalles y dinos si puedes.')
  })
})

describe('AvisoServicioEmail footer', () => {
  it('says the reply reaches the planner instead of «no respondas»', () => {
    const h = renderToStaticMarkup(<AvisoServicioEmail {...props([bloque()], { respondeA: true, remitente: 'Andrés Valero' })} />)
    expect(h).not.toContain('no respondas directamente')
    expect(h).toContain('Si respondes este correo, tu respuesta le llega a Andrés Valero.')
  })
})
