/**
 * @jest-environment node
 *
 * R4 (odd/tasks/talleres-rediseno.md, S10 S11; L13) — the notice email keeps
 * the line breaks of an edited message: a blank line separates paragraphs
 * and a single line break stays a line break, all inside EmailLayout (the
 * church logo, like every other email of the system).
 */

import { renderToStaticMarkup } from 'react-dom/server'

import { TallerAvisoEmail } from '../../emails/taller-aviso'

function html(cuerpo: string) {
  return renderToStaticMarkup(
    <TallerAvisoEmail nombre="Carolina" titulo="Aprobamos tu inscripción" cuerpo={cuerpo} tallerNombre="Mujer de Hoy" />,
  )
}

describe('TallerAvisoEmail — line breaks of the message (S11)', () => {
  it('a blank line starts a new paragraph', () => {
    const salida = html('¡Qué alegría tenerte en Mujer de Hoy!\n\nLa primera clase es el jueves 8 de octubre.')
    expect(salida).toMatch(/<p[^>]*>¡Qué alegría tenerte en Mujer de Hoy!<\/p>/)
    expect(salida).toMatch(/<p[^>]*>La primera clase es el jueves 8 de octubre.<\/p>/)
  })

  it('a single line break stays a <br/> inside the paragraph', () => {
    const salida = html('La primera clase es el jueves 8 de octubre a las 7:00 p. m.\nNos vemos en Salón 2.')
    expect(salida).toMatch(/<p[^>]*>La primera clase es el jueves 8 de octubre a las 7:00 p\. m\.<br\/>Nos vemos en Salón 2\.<\/p>/)
  })

  it('several blank lines (or spaces on them) are one paragraph break, never an empty paragraph', () => {
    const salida = html('Uno\n \n\n\nDos')
    expect(salida).toMatch(/<p[^>]*>Uno<\/p>/)
    expect(salida).toMatch(/<p[^>]*>Dos<\/p>/)
    expect(salida).not.toMatch(/<p[^>]*><\/p>/)
  })

  it('still renders inside EmailLayout with the church logo', () => {
    const salida = html('Hola')
    expect(salida).toMatch(/<img[^>]+alt="[^"]*Global[^"]*"/i)
  })
})
