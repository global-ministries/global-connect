/**
 * @jest-environment node
 *
 * T10 (odd/tasks/talleres-reserva-publica.md, S6; L30) — the notice email
 * shows the practical rows the database writes (Empieza, Lugar,
 * Indicaciones) and keeps the line breaks of the indicaciones.
 */

import { renderToStaticMarkup } from 'react-dom/server'

import { TallerAvisoEmail } from '../../../../emails/taller-aviso'

describe('TallerAvisoEmail — practical rows (T10)', () => {
  const html = renderToStaticMarkup(
    <TallerAvisoEmail
      nombre="Pía"
      titulo="Aprobamos tu inscripción"
      cuerpo="Tienes tu lugar en Mujer de Hoy. Empieza el jueves 26 de noviembre a las 7:00 p. m. en Salón 2."
      filas={[
        ['Taller', 'Noviembre 2026'],
        ['Empieza', 'jueves 26 de noviembre · 7:00 p. m.'],
        ['Lugar', 'Salón 2'],
        ['Indicaciones', 'Trae tu Biblia\nEntra por la puerta lateral'],
      ]}
      url="https://example.test/talleres/mi-recorrido"
      cta="Ver mi taller"
      tallerNombre="Mujer de Hoy"
    />,
  )

  it('renders every row label and value', () => {
    for (const texto of ['Empieza', 'jueves 26 de noviembre · 7:00 p. m.', 'Lugar', 'Salón 2', 'Indicaciones']) {
      expect(html).toContain(texto)
    }
  })

  it('keeps the line breaks of the indicaciones (pre-line)', () => {
    expect(html).toMatch(/white-space:pre-line[^>]*>Trae tu Biblia\nEntra por la puerta lateral</)
  })
})
