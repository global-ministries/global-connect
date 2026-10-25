/**
 * T5 / T5.2 (odd/tasks/uno-a-uno.md) — the 1:1 reminder email: one email per
 * person listing every 1:1 of tomorrow in time order (S5.8). Spanish, "tú",
 * who each 1:1 is with (the other side), the Caracas date and time, the place
 * only when there is one, a button to /mis-uno-a-uno, and never anything the
 * leader wrote (S5.5).
 */
import { renderToStaticMarkup } from 'react-dom/server'

import {
  asuntoRecordatorioUnoAUno,
  RecordatorioUnoAUnoEmail,
  type UnoAUnoRecordado,
} from '@/emails/recordatorio-uno-a-uno'

const CON_LUIS_Y_MARIA: UnoAUnoRecordado = {
  conQuien: [
    { nombre: 'Luis', apellido: 'Gómez' },
    { nombre: 'María', apellido: 'Rojas' },
  ],
  // 15:30 in Caracas (UTC-04:00).
  fechaHora: '2026-10-16T19:30:00+00:00',
  lugar: 'Café Central',
}

const CON_PEDRO: UnoAUnoRecordado = {
  conQuien: [{ nombre: 'Pedro', apellido: null }],
  // 09:00 in Caracas.
  fechaHora: '2026-10-16T13:00:00+00:00',
  lugar: null,
}

const BASE = {
  nombre: 'Ana',
  unoAUnos: [CON_LUIS_Y_MARIA],
  urlMisUnoAUno: 'https://connect.example/mis-uno-a-uno',
}

function render(over: Partial<typeof BASE> = {}): string {
  return renderToStaticMarkup(<RecordatorioUnoAUnoEmail {...BASE} {...over} />)
}

function renderUno(unoAUno: Partial<typeof CON_LUIS_Y_MARIA>): string {
  return render({ unoAUnos: [{ ...CON_LUIS_Y_MARIA, ...unoAUno }] })
}

describe('Recordatorio de 1 a 1 email', () => {
  it('has the singular subject for one 1:1 and the plural one for several (S5.8)', () => {
    expect(asuntoRecordatorioUnoAUno(1)).toBe('Recordatorio: tu 1 a 1 de mañana')
    expect(asuntoRecordatorioUnoAUno(2)).toBe('Recordatorio: tus 1 a 1 de mañana')
    expect(asuntoRecordatorioUnoAUno(5)).toBe('Recordatorio: tus 1 a 1 de mañana')
  })

  describe('with one 1:1', () => {
    it('greets the person and says who the 1:1 is with, names joined with " y "', () => {
      const html = render()
      expect(html).toContain('Hola, Ana')
      expect(html).toContain('Mañana tienes un 1 a 1 con Luis Gómez y María Rojas')
    })

    it('shows the date and time in Caracas time', () => {
      expect(render()).toContain('viernes 16 de octubre de 2026, 15:30')
    })

    it('shows the place only when there is one', () => {
      expect(render()).toContain('Café Central')
      expect(render()).toContain('Dónde:')
      expect(renderUno({ lugar: null })).not.toContain('Dónde:')
      expect(renderUno({ lugar: '   ' })).not.toContain('Dónde:')
    })
  })

  describe('with several 1:1s', () => {
    const varios = () => render({ unoAUnos: [CON_LUIS_Y_MARIA, CON_PEDRO] })

    it('says how many there are', () => {
      const html = varios()
      expect(html).toContain('Hola, Ana')
      expect(html).toContain('Mañana tienes 2 1 a 1:')
      expect(html).not.toContain('Mañana tienes un 1 a 1')
    })

    it('lists every 1:1 in time order with who and when', () => {
      const html = varios()
      const pedro = html.indexOf('Pedro')
      const luis = html.indexOf('Luis Gómez y María Rojas')
      expect(pedro).toBeGreaterThan(-1)
      expect(luis).toBeGreaterThan(pedro)
      const nueve = html.indexOf('viernes 16 de octubre de 2026, 09:00')
      const tresYMedia = html.indexOf('viernes 16 de octubre de 2026, 15:30')
      expect(nueve).toBeGreaterThan(pedro)
      expect(tresYMedia).toBeGreaterThan(luis)
      expect(html.match(/Cuándo:/g)).toHaveLength(2)
    })

    it('shows the place only for the 1:1s that have one', () => {
      const html = varios()
      expect(html.match(/Dónde:/g)).toHaveLength(1)
      expect(html.indexOf('Café Central')).toBeGreaterThan(html.indexOf('Luis Gómez'))
    })
  })

  it('has a "Ver mis 1 a 1" button to /mis-uno-a-uno', () => {
    const html = render()
    expect(html).toContain('Ver mis 1 a 1')
    expect(html).toContain('href="https://connect.example/mis-uno-a-uno"')
  })

  it('never mentions what the leader wrote, with one or several 1:1s', () => {
    for (const unoAUnos of [[CON_LUIS_Y_MARIA], [CON_LUIS_Y_MARIA, CON_PEDRO]]) {
      const html = render({ unoAUnos }).toLowerCase()
      for (const palabra of ['resumen', 'nota', 'celebraci', 'motivo']) {
        expect(html).not.toContain(palabra)
      }
    }
  })
})
