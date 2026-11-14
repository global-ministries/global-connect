/**
 * «Explorar» (odd/tasks/home-por-rol.md S15): Talleres with the real number of
 * open enrollments, and «Inscribir a mis hijos» for an adult without children.
 */
import React from 'react'
import { render, screen, within } from '@testing-library/react'

import { PantallaInicio } from '@/components/inicio/pantalla-inicio'
import { SeccionExplorar } from '@/components/inicio/seccion-explorar'

const explorar = () => screen.getByRole('region', { name: 'Explorar' })

describe('SeccionExplorar · Talleres', () => {
  it.each([
    [3, '3 con inscripción abierta'],
    [1, '1 con inscripción abierta'],
    [0, 'Ver talleres'],
    [null, 'Ver talleres'],
    [undefined, 'Ver talleres'],
  ])('con %p talleres abiertos dice «%s»', (abiertos, detalle) => {
    render(<SeccionExplorar tiles={['talleres']} ancha={false} talleresAbiertos={abiertos} />)

    const talleres = within(explorar()).getByRole('link', { name: /Talleres/ })
    expect(talleres).toHaveAttribute('href', '/talleres/explorar')
    expect(talleres).toHaveTextContent(`Talleres${detalle}`)
  })
})

describe('SeccionExplorar · Inscribir a mis hijos', () => {
  it('lleva a la sección Mis hijos del perfil', () => {
    render(<SeccionExplorar tiles={['talleres', 'mis-hijos']} ancha={false} talleresAbiertos={2} />)

    const enlaces = within(explorar()).getAllByRole('link')
    expect(enlaces.map((e) => e.textContent)).toEqual([
      'Talleres2 con inscripción abierta',
      'Inscribir a mis hijosRegístralos para el check-in del domingo',
    ])
    expect(enlaces[1]).toHaveAttribute('href', '/perfil#mis-hijos')
  })
})

describe('PantallaInicio · Explorar', () => {
  it('pasa el número de talleres abiertos a la sección', () => {
    render(<PantallaInicio nombre="Ana" hoy="2026-11-09" secciones={[{ id: 'explorar', tiles: ['talleres'] }]} talleresAbiertos={5} />)

    expect(within(explorar()).getByRole('link', { name: /Talleres/ })).toHaveTextContent('5 con inscripción abierta')
  })
})
