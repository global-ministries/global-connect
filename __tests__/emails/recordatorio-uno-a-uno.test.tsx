/**
 * T5 (odd/tasks/uno-a-uno.md) — the 1:1 reminder email (S5.5): Spanish, "tú",
 * who the 1:1 is with (the other side), the Caracas date and time, the place
 * only when there is one, a button to /mis-uno-a-uno, and never anything the
 * leader wrote.
 */
import { renderToStaticMarkup } from 'react-dom/server'

import {
  ASUNTO_RECORDATORIO_UNO_A_UNO,
  RecordatorioUnoAUnoEmail,
} from '@/emails/recordatorio-uno-a-uno'

const BASE = {
  nombre: 'Ana',
  conQuien: [
    { nombre: 'Luis', apellido: 'Gómez' },
    { nombre: 'María', apellido: 'Rojas' },
  ],
  // 15:30 in Caracas (UTC-04:00).
  fechaHora: '2026-10-16T19:30:00+00:00',
  lugar: 'Café Central' as string | null,
  urlMisUnoAUno: 'https://connect.example/mis-uno-a-uno',
}

function render(over: Partial<typeof BASE> = {}): string {
  return renderToStaticMarkup(<RecordatorioUnoAUnoEmail {...BASE} {...over} />)
}

describe('Recordatorio de 1 a 1 email', () => {
  it('has the subject of S5.5', () => {
    expect(ASUNTO_RECORDATORIO_UNO_A_UNO).toBe('Recordatorio: tu 1 a 1 de mañana')
  })

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
    expect(render({ lugar: null })).not.toContain('Dónde:')
    expect(render({ lugar: '   ' })).not.toContain('Dónde:')
  })

  it('has a "Ver mis 1 a 1" button to /mis-uno-a-uno', () => {
    const html = render()
    expect(html).toContain('Ver mis 1 a 1')
    expect(html).toContain('href="https://connect.example/mis-uno-a-uno"')
  })

  it('never mentions what the leader wrote', () => {
    const html = render().toLowerCase()
    for (const palabra of ['resumen', 'nota', 'celebraci', 'motivo']) {
      expect(html).not.toContain(palabra)
    }
  })
})
