/**
 * T16c (odd/tasks/dps-asistencia-pco.md, S14.3, S14.5, S14.6; artboard
 * design/dps-avisos-correo 03) — the reminder e-mail: the confirmed variant
 * (no buttons, «Cambiar respuesta») and the pending one (Confirmar / No
 * puedo), the arrival up front, «Tu parte» and the person's row of the order
 * marked «Tú», «Quiénes sirven contigo» as counts only, the footer with the
 * configured days, the Global logo (EmailLayout), that replying reaches the
 * planner, and the same texts in the plain-text version. Every person is
 * fictitious.
 */
import { renderToStaticMarkup } from 'react-dom/server'

import {
  RecordatorioEmail,
  contenidoRecordatorio,
  textoRecordatorio,
  type BloqueRecordatorio,
  type RecordatorioEmailProps,
} from '@/emails/dps/recordatorio'

const bloque = (parche: Partial<BloqueRecordatorio> = {}): BloqueRecordatorio => ({
  fecha: '2026-11-15',
  tipo: 'domingo',
  titulo: null,
  serie: 'Tu casa tiene influencers',
  semana: 4,
  roles: [{ nombre: 'Comunicador', equipo: 'Producción Creativa' }],
  horarios: ['09:00', '11:30'],
  llegada: '07:30',
  estado: 'confirmo',
  parte: { texto: 'Anuncios a las 9:35 y 12:05', detalle: 'Cena del Señor y Talleres de diciembre · 5 min' },
  orden: {
    hora: '9:00',
    otros: ['11:30'],
    filas: [
      { hora: '9:00', titulo: 'Cuenta regresiva', detalle: null, duracion: '5 min', mia: false },
      { hora: '9:35', titulo: 'Anuncios', detalle: 'Cena del Señor y Talleres de diciembre', duracion: '5 min', mia: true },
    ],
  },
  equipo: {
    personas: 34,
    confirmaron: 29,
    direcciones: [
      { nombre: 'Producción Creativa', personas: 4 },
      { nombre: 'Global Music', personas: 7 },
      { nombre: 'Producción Técnica', personas: 23 },
    ],
  },
  urlConfirmar: null,
  urlNoPuedo: null,
  urlVer: 'https://connect.example/mis-servicios/p15',
  ...parche,
})
const PENDIENTE = bloque({
  estado: 'pendiente',
  urlConfirmar: 'https://connect.example/dps/confirmar/TOKEN15',
  urlNoPuedo: 'https://connect.example/mis-servicios/p15#no-puedo',
})
const props = (bloques: BloqueRecordatorio[], parche: Partial<RecordatorioEmailProps> = {}): RecordatorioEmailProps => ({
  nombre: 'Valentina',
  remitente: 'Andrés Valero',
  respondeA: true,
  dias: 2,
  bloques,
  ...parche,
})
const html = (p: RecordatorioEmailProps) => renderToStaticMarkup(<RecordatorioEmail {...p} />)

describe('RecordatorioEmail', () => {
  it('confirmed: «Este domingo sirves», the arrival in the subject, no buttons', () => {
    const p = props([bloque()])
    const c = contenidoRecordatorio(p)
    expect(c.asunto).toBe('Este domingo sirves · Comunicador, llegada 7:30')
    expect(c.titulo).toBe('Este domingo sirves')
    expect(c.preview).toBe('Domingo 15 · servicios 9:00 y 11:30. Tu parte: Anuncios a las 9:35 y 12:05.')
    expect(c.parrafos).toEqual(['¡Hola, Valentina! Te recordamos tu servicio de este domingo. Gracias por confirmar.'])
    const h = html(p)
    expect(h).toContain('Confirmaste')
    expect(h).not.toContain('/dps/confirmar/')
    expect(h).not.toContain('No puedo')
    expect(h).toContain('Ver el servicio en Global Connect')
    expect(c.ayuda[0]).toBe('¿Ya no puedes? Avísalo cuanto antes desde el servicio en Global Connect con «Cambiar respuesta», para que Andrés Valero busque a alguien.')
  })

  it('pending: asks again with Confirmar and No puedo', () => {
    const p = props([PENDIENTE])
    const c = contenidoRecordatorio(p)
    expect(c.asunto).toBe('¿Puedes servir este domingo 15? Aún no respondes')
    expect(c.titulo).toBe('¿Puedes servir este domingo?')
    expect(c.preview).toBe('Comunicador · servicios 9:00 y 11:30, llegada 7:30. Responde con un toque.')
    expect(c.parrafos).toEqual([
      '¡Hola, Valentina! Andrés Valero te programó para este domingo y aún no sabemos si puedes. Responde con un toque para que pueda organizar el equipo.',
    ])
    const h = html(p)
    expect(h).toContain('Pendiente de respuesta')
    expect(h).toContain('href="https://connect.example/dps/confirmar/TOKEN15"')
    expect(h).toContain('href="https://connect.example/mis-servicios/p15#no-puedo"')
    expect(c.ayuda[0]).toBe('También puedes responder desde tu panel en Global Connect, en «Mis servicios».')
  })

  it('shows the arrival, the part, the order with «Tú» and who serves with you (counts only)', () => {
    const h = html(props([bloque()]))
    expect(h).toContain('7:30')
    expect(h).toContain('Tu parte')
    expect(h).toContain('Anuncios a las 9:35 y 12:05')
    expect(h).toContain('Orden del servicio')
    expect(h).toContain('A las 11:30 es el mismo orden.')
    expect(h).toContain('Tú')
    expect(h).toContain('Quiénes sirven contigo')
    expect(h).toContain('34 personas · 29 confirmaron')
    expect(h).toContain('Producción Creativa 4 · Global Music 7 · Producción Técnica 23')
    // The Global logo of EmailLayout.
    expect(h).toContain('logo-global.png')
  })

  it('says how many days before in the footer, in the HTML and the text', () => {
    expect(contenidoRecordatorio(props([bloque()])).pie).toEqual(['Recibes este recordatorio 2 días antes; tu director puede cambiarlo.'])
    expect(contenidoRecordatorio(props([bloque()], { dias: 1 })).pie).toEqual(['Recibes este recordatorio 1 día antes; tu director puede cambiarlo.'])
    expect(html(props([bloque()], { dias: 3 }))).toContain('Recibes este recordatorio 3 días antes; tu director puede cambiarlo.')
    expect(textoRecordatorio(props([bloque()], { dias: 3 }))).toContain('Recibes este recordatorio 3 días antes; tu director puede cambiarlo.')
  })

  it('replying reaches the planner; without one it says whom to write', () => {
    expect(html(props([bloque()]))).toContain('Si respondes este correo, tu respuesta le llega a Andrés Valero.')
    expect(contenidoRecordatorio(props([bloque()])).ayuda).toContain('¿Dudas? Responde este correo y le llega a Andrés Valero.')
    const sin = contenidoRecordatorio(props([bloque()], { remitente: null, respondeA: false }))
    expect(sin.ayuda).toContain('¿Dudas? Escríbele a quien planifica tu equipo.')
    expect(sin.ayuda[0]).toBe('¿Ya no puedes? Avísalo cuanto antes desde el servicio en Global Connect con «Cambiar respuesta».')
  })

  it('two plans the same day in one e-mail: one block each, asking only where pending', () => {
    const p = props([bloque({ titulo: 'Bautizos', tipo: 'especial', fecha: '2026-11-17', roles: [{ nombre: 'Audio', equipo: 'Producción Técnica' }] }), { ...PENDIENTE, fecha: '2026-11-17', tipo: 'especial', titulo: 'Cena' }])
    const c = contenidoRecordatorio(p)
    expect(c.asunto).toBe('¿Puedes servir el martes 17? Aún no respondes')
    const h = html(p)
    expect(h.match(/\/dps\/confirmar\//g)).toHaveLength(1)
    expect(h).toContain('Bautizos')
    expect(h).toContain('Cena')
    expect(h).toContain('Confirmaste')
  })

  it('works without an order, a part or a team', () => {
    const p = props([bloque({ parte: null, orden: null, equipo: null })])
    expect(contenidoRecordatorio(p).preview).toBe('Domingo 15 · servicios 9:00 y 11:30 · llegada 7:30.')
    const h = html(p)
    expect(h).not.toContain('Orden del servicio')
    expect(h).not.toContain('Quiénes sirven contigo')
    expect(h).not.toContain('Tu parte')
  })

  it('the plain text says the same', () => {
    const t = textoRecordatorio(props([PENDIENTE]))
    expect(t).toContain('¿Puedes servir este domingo?')
    expect(t).toContain('DOMINGO 15 DE NOVIEMBRE')
    expect(t).toContain('Estado: Pendiente de respuesta')
    expect(t).toContain('Llegada: 7:30')
    expect(t).toContain('Tu parte: Anuncios a las 9:35 y 12:05 (Cena del Señor y Talleres de diciembre · 5 min)')
    expect(t).toContain('Confirmar (un toque, sin iniciar sesión):\nhttps://connect.example/dps/confirmar/TOKEN15')
    expect(t).toContain('No puedo (abre Global Connect para escribir el motivo):\nhttps://connect.example/mis-servicios/p15#no-puedo')
    expect(t).toContain('ORDEN DEL SERVICIO (9:00; a las 11:30 es el mismo orden)')
    expect(t).toContain(' 9:35  Anuncios · Cena del Señor y Talleres de diciembre (5 min)   ← TÚ')
    expect(t).toContain('QUIÉNES SIRVEN CONTIGO\n34 personas · 29 confirmaron')
    expect(t).toContain('Yo Soy Global · Campus Barquisimeto')
  })
})
