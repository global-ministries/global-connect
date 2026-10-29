/**
 * The ficha's Asistencia tab (S13): the PERSON's own attendance, a selector
 * with only the kinds that have records, per-group cards, the leader callout,
 * the 4-week curve and the historial with "· pasado" / "· como visitante";
 * Talleres as "N de M sesiones" cards without a curve.
 */
import React from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { PestanaAsistencia } from '@/components/users/ficha/pestana-asistencia'
import { aAsistenciaPersona } from '@/lib/platform/usuarios/asistencia-persona'

const marcas = (filas: readonly [string, boolean, boolean?][]) =>
  filas.map(([fecha, presente, visitante = false]) => ({ fecha, presente, era_visitante: visitante }))

const gdv = [
  {
    tipo: 'gdv', id: 'g-1', nombre: 'Mujeres de Fe', area: 'Mujeres', rol: 'Líder', actual: true, desde: '2024-01-10',
    marcas: marcas([['2026-10-06', true], ['2026-10-13', true], ['2026-10-20', false], ['2026-10-27', true]]),
  },
  {
    tipo: 'gdv', id: 'g-2', nombre: 'Generación Fuego', area: null, rol: 'Miembro', actual: false, salio: '2026-08-18',
    marcas: marcas([['2026-08-04', true], ['2026-08-11', false]]),
  },
]
const estudiantes = [
  {
    tipo: 'estudiantes', id: 'e-1', nombre: 'Transit Chicas', area: 'Transit · Secundaria', rol: 'Visitante', actual: true,
    marcas: marcas([['2026-10-21', true, true], ['2026-10-28', true]]),
  },
]
const talleres = [
  {
    tipo: 'talleres', id: 't-1', nombre: 'Crecimiento 1', area: 'Grupo martes', rol: 'Participante', actual: true,
    completado: false, total_sesiones: 8, marcas: marcas([['2026-10-07', true], ['2026-10-14', true], ['2026-10-21', false]]),
  },
  {
    tipo: 'talleres', id: 't-2', nombre: 'Bautismo', area: 'Grupo sábado', rol: 'Participante', actual: false,
    completado: true, total_sesiones: 3, marcas: marcas([['2026-08-08', true]]),
  },
]
const datos = (grupos: unknown[]) => aAsistenciaPersona({ desde: '2026-08-01', hasta: '2026-10-29', grupos })

function renderizar(grupos: unknown[] | null, onCambiarRango = jest.fn()) {
  render(<PestanaAsistencia nombre="Ana" asistencia={grupos === null ? null : datos(grupos)} onCambiarRango={onCambiarRango} />)
  return { onCambiarRango }
}

describe('Asistencia tab', () => {
  it('says so when the viewer may not see it', () => {
    renderizar(null)
    expect(screen.getByText('No puedes ver esta asistencia')).toBeInTheDocument()
  })

  it('shows an empty state without records, and keeps the range', () => {
    renderizar([])
    expect(screen.getByText('Sin registros de asistencia')).toBeInTheDocument()
    expect(screen.getByLabelText('Desde')).toHaveValue('2026-08-01')
    expect(screen.queryByRole('group', { name: 'Tipo de asistencia' })).not.toBeInTheDocument()
  })

  it('offers only the kinds with records', () => {
    renderizar([...gdv, ...talleres])
    const selector = screen.getByRole('group', { name: 'Tipo de asistencia' })
    expect(within(selector).getAllByRole('button').map((b) => b.textContent)).toEqual(['Grupos de Vida', 'Talleres'])
    expect(within(selector).getByRole('button', { name: 'Grupos de Vida' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows group cards with rol, Actual / "Salió el …", % and reuniones, plus "Todos los grupos"', () => {
    renderizar(gdv)
    const lista = screen.getByRole('region', { name: 'Asistencia por grupo' })
    expect(within(lista).getByRole('button', { name: /Todos los grupos/ })).toHaveAttribute('aria-pressed', 'true')
    const actual = within(lista).getByRole('button', { name: /Mujeres de Fe/ })
    expect(actual).toHaveTextContent('Líder')
    expect(actual).toHaveTextContent('Desde 10 ene 2024')
    expect(actual).toHaveTextContent('75%')
    expect(actual).toHaveTextContent('4 reuniones')
    expect(within(lista).getByRole('button', { name: /Generación Fuego/ })).toHaveTextContent('Salió el 18 ago 2026')
  })

  it('narrows the curve and historial to the chosen group', async () => {
    const user = userEvent.setup()
    renderizar(gdv)
    await user.click(screen.getByRole('button', { name: /Generación Fuego/ }))
    expect(screen.getByRole('button', { name: /Generación Fuego/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('heading', { name: 'Asistencia en Generación Fuego' })).toBeInTheDocument()
    const historial = screen.getByRole('list', { name: 'Historial' })
    expect(within(historial).getAllByRole('listitem')).toHaveLength(2)
  })

  it('links the leader to the group attendance', () => {
    renderizar(gdv)
    expect(screen.getByRole('link', { name: /Ver asistencia del grupo/ })).toHaveAttribute('href', '/grupos-vida/g-1/asistencia')
    expect(screen.getByText(/Como líder, cuenta su propia presencia/)).toBeInTheDocument()
  })

  it('draws the 4-week curve and marks past groups in the historial', () => {
    renderizar(gdv)
    expect(screen.getAllByRole('img', { name: /Promedio de las últimas 4 semanas/i })).toHaveLength(3)
    const filas = within(screen.getByRole('list', { name: 'Historial' })).getAllByRole('listitem')
    expect(filas[0]).toHaveTextContent('Mujeres de Fe')
    expect(filas[0]).toHaveTextContent('Asistió')
    expect(filas.find((f) => f.textContent?.includes('Generación Fuego'))).toHaveTextContent('· pasado')
  })

  it('shows only Estudiantes without a selector, with the área line and "· como visitante"', () => {
    renderizar(estudiantes)
    expect(screen.queryByRole('group', { name: 'Tipo de asistencia' })).not.toBeInTheDocument()
    const tarjeta = screen.getByRole('button', { name: /Transit Chicas/ })
    expect(tarjeta).toHaveTextContent('Transit · Secundaria')
    expect(tarjeta).toHaveTextContent('Visitante')
    expect(screen.queryByRole('button', { name: /Todos los grupos/ })).not.toBeInTheDocument()
    const filas = within(screen.getByRole('list', { name: 'Historial' })).getAllByRole('listitem')
    expect(filas[1]).toHaveTextContent('· como visitante')
    expect(filas[0]).not.toHaveTextContent('· como visitante')
  })

  it('shows Talleres as "N de M sesiones" cards and no curve', async () => {
    const user = userEvent.setup()
    renderizar([...gdv, ...talleres])
    await user.click(screen.getByRole('button', { name: 'Talleres' }))
    const lista = screen.getByRole('region', { name: 'Asistencia por taller' })
    expect(within(lista).getByText('Crecimiento 1')).toBeInTheDocument()
    expect(lista).toHaveTextContent('2 de 8')
    expect(lista).toHaveTextContent('En curso')
    expect(lista).toHaveTextContent('Completado')
    expect(screen.getByRole('list', { name: 'Historial' })).not.toHaveTextContent('· pasado')
    expect(screen.queryByRole('img', { name: /Promedio/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Ver asistencia del grupo/ })).not.toBeInTheDocument()
  })

  it('applies the Desde/Hasta range', async () => {
    const user = userEvent.setup()
    const { onCambiarRango } = renderizar(gdv)
    const desde = screen.getByLabelText('Desde')
    await user.clear(desde)
    await user.type(desde, '2026-01-01')
    await user.click(screen.getByRole('button', { name: 'Aplicar' }))
    expect(onCambiarRango).toHaveBeenCalledWith('2026-01-01', '2026-10-29')
  })
})
