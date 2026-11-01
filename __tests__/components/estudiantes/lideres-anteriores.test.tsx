/**
 * `<LideresAnteriores>` — "Líderes anteriores" in the group drawer (C6a of
 * odd/tasks/estudiantes-fase-b.md, L29). The server action is mocked.
 */
import React from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { LideresAnteriores } from '@/components/estudiantes/grupos/lideres-anteriores'
import * as acciones from '@/lib/actions/estudiantes-grupos.actions'
import type { PeriodoLider } from '@/lib/platform/estudiantes/lideres-historial'

jest.mock('@/lib/actions/estudiantes-grupos.actions', () => ({ historialLideres: jest.fn() }))

const historial = acciones.historialLideres as jest.MockedFunction<typeof acciones.historialLideres>
const GRUPO = '33333333-3333-4333-8333-333333333333'

const periodo = (n: number, parcial: Partial<PeriodoLider> = {}): PeriodoLider => ({
  servicioId: `s${n}`,
  personaId: `p${n}`,
  nombre: `Persona ${n}`,
  rol: 'Líder',
  desde: `20${10 + n}-01-15T12:00:00Z`,
  hasta: `20${10 + n}-06-20T12:00:00Z`,
  cerradoPor: null,
  ...parcial,
})

beforeEach(() => historial.mockReset())

it('lists the past leaders newest first, without the current ones', async () => {
  historial.mockResolvedValueOnce({
    ok: true,
    data: [
      periodo(9, { nombre: 'Ana Actual', hasta: null }),
      periodo(4, { nombre: 'Bea Pérez', rol: 'Entrenador', desde: '2024-09-01T12:00:00Z', hasta: '2025-06-20T12:00:00Z' }),
      periodo(5, { nombre: 'Carla Ruiz', desde: '2025-07-01T12:00:00Z', hasta: '2025-12-01T12:00:00Z' }),
    ],
  })
  render(<LideresAnteriores grupoId={GRUPO} />)

  const lista = await screen.findByRole('list', { name: 'Líderes anteriores' })
  const filas = within(lista).getAllByRole('listitem')
  expect(filas.map((f) => f.textContent)).toEqual([
    expect.stringContaining('Carla Ruiz'),
    expect.stringContaining('Bea Pérez'),
  ])
  expect(within(filas[0]).getByText('Líder · jul 2025 – dic 2025')).toBeInTheDocument()
  expect(within(filas[1]).getByText('Entrenador · sep 2024 – jun 2025')).toBeInTheDocument()
  expect(screen.queryByText('Ana Actual')).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: /Líderes anteriores · 2/ })).toBeInTheDocument()
  expect(historial).toHaveBeenCalledWith({ grupoId: GRUPO })
})

it('shows nothing when the group had no other leader', async () => {
  historial.mockResolvedValueOnce({ ok: true, data: [periodo(1, { hasta: null })] })
  const { container } = render(<LideresAnteriores grupoId={GRUPO} />)
  await waitFor(() => expect(historial).toHaveBeenCalled())
  await waitFor(() => expect(container).toBeEmptyDOMElement())
})

it('collapses a long history behind "Ver todos"', async () => {
  const user = userEvent.setup()
  historial.mockResolvedValueOnce({ ok: true, data: [1, 2, 3, 4, 5].map((n) => periodo(n)) })
  render(<LideresAnteriores grupoId={GRUPO} />)

  const lista = await screen.findByRole('list', { name: 'Líderes anteriores' })
  expect(within(lista).getAllByRole('listitem')).toHaveLength(3)
  const boton = screen.getByRole('button', { name: 'Ver los 5' })
  expect(boton).toHaveAttribute('aria-expanded', 'false')

  await user.click(boton)
  expect(within(lista).getAllByRole('listitem')).toHaveLength(5)
  expect(screen.getByRole('button', { name: 'Ver menos' })).toHaveAttribute('aria-expanded', 'true')
})

it('says so when the history cannot load', async () => {
  historial.mockResolvedValueOnce({ ok: false, message: 'No se pudieron cargar los líderes anteriores.' })
  render(<LideresAnteriores grupoId={GRUPO} />)
  expect(await screen.findByText('No se pudieron cargar los líderes anteriores.')).toBeInTheDocument()
})
