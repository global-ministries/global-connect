/**
 * @jest-environment jsdom
 *
 * T2 (odd/tasks/talleres-asistencia-lider.md) — read view of ONE marked
 * clase on /talleres/[taller]/[edicion]/[grupo].
 *
 * Re-implements the PATTERN of components/grupos/AttendanceList.client.tsx
 * (Grupos de Vida is untouchable — never imported here): presentes and
 * ausentes in their own columns, a BadgeSistema per row, and the motivo
 * shown only under an absent person. Plus what talleres adds on top of it:
 * the clase's own title ("Clase {numero} · {tema}", falling back to
 * "Clase {numero}" when taller_sesiones.tema is NULL) and the
 * taller_asistencias.estado → label/variante map of
 * components/talleres/labels.ts, so no raw catalogue key is ever rendered
 * (docs/talleres-de-punta-a-punta.md §9).
 *
 * Every prop is plain JSON (number | string | null | array of objects) —
 * it crosses the RSC → client boundary from the server page.
 */

import { render, screen } from '@testing-library/react'

import {
  LecturaAsistenciaClase,
  type AsistenciaFila,
} from '@/components/talleres/lectura-asistencia-clase.client'

const FILAS: readonly AsistenciaFila[] = [
  { id: 'as-1', nombre: 'Ana Gómez', estado: 'presente', motivo: null },
  { id: 'as-2', nombre: 'Luis Ruiz', estado: 'ausente', motivo: 'Viaje de trabajo' },
  { id: 'as-3', nombre: '—', estado: 'ausente', motivo: null },
  { id: 'as-4', nombre: 'Carla Soto', estado: 'no_aplica', motivo: null },
]

describe('LecturaAsistenciaClase — título de la clase', () => {
  it('titles the view "Clase {numero} · {tema}" when taller_sesiones.tema exists', () => {
    render(<LecturaAsistenciaClase numero={3} tema="Introducción" filas={FILAS} />)
    expect(
      screen.getByRole('heading', { level: 3, name: 'Clase 3 · Introducción' }),
    ).toBeTruthy()
  })

  it('falls back to "Clase {numero}" when tema is NULL', () => {
    render(<LecturaAsistenciaClase numero={3} tema={null} filas={FILAS} />)
    expect(screen.getByRole('heading', { level: 3, name: 'Clase 3' })).toBeTruthy()
    expect(screen.queryByText(/·/)).toBeNull()
  })
})

describe('LecturaAsistenciaClase — presentes / ausentes (patrón AttendanceList)', () => {
  it('splits the rows into Presentes and Ausentes columns with their counts', () => {
    render(<LecturaAsistenciaClase numero={1} tema={null} filas={FILAS} />)
    expect(screen.getByText('Presentes (1)')).toBeTruthy()
    expect(screen.getByText('Ausentes (2)')).toBeTruthy()
    expect(screen.getByText('Ana Gómez')).toBeTruthy()
    expect(screen.getByText('Luis Ruiz')).toBeTruthy()
  })

  it('renders "Sin registros" in a column with no rows', () => {
    render(
      <LecturaAsistenciaClase
        numero={1}
        tema={null}
        filas={[{ id: 'as-1', nombre: 'Ana Gómez', estado: 'presente', motivo: null }]}
      />,
    )
    expect(screen.getAllByText('Sin registros')).toHaveLength(1)
  })

  it('shows the motivo only under an absent person, never under a present one', () => {
    render(
      <LecturaAsistenciaClase
        numero={1}
        tema={null}
        filas={[
          // Defensive: the DB CHECK only allows motivo with estado='ausente',
          // but the read view never leaks one if a row ever violates it.
          { id: 'as-1', nombre: 'Ana Gómez', estado: 'presente', motivo: 'no debería verse' },
          { id: 'as-2', nombre: 'Luis Ruiz', estado: 'ausente', motivo: 'Viaje de trabajo' },
        ]}
      />,
    )
    expect(screen.getByText('Viaje de trabajo')).toBeTruthy()
    expect(screen.queryByText('no debería verse')).toBeNull()
  })
})

describe('LecturaAsistenciaClase — badges (docs §9, nunca una clave cruda)', () => {
  it('labels every estado through the map instead of rendering the raw key', () => {
    render(<LecturaAsistenciaClase numero={1} tema={null} filas={FILAS} />)
    expect(screen.getByText('Presente')).toBeTruthy()
    expect(screen.getAllByText('Ausente')).toHaveLength(2)
    expect(screen.getByText('No aplica')).toBeTruthy()
    expect(screen.queryByText('presente')).toBeNull()
    expect(screen.queryByText('ausente')).toBeNull()
    expect(screen.queryByText('no_aplica')).toBeNull()
  })

  it('renders each estado label as a BadgeSistema (rounded-full span)', () => {
    render(<LecturaAsistenciaClase numero={1} tema={null} filas={FILAS} />)
    const badge = screen.getByText('Presente')
    expect(badge.tagName).toBe('SPAN')
    expect(badge.classList.contains('rounded-full')).toBe(true)
  })
})

describe('LecturaAsistenciaClase — no_aplica', () => {
  it('shows a third column only when there is at least one no_aplica row', () => {
    render(
      <LecturaAsistenciaClase
        numero={1}
        tema={null}
        filas={[
          { id: 'as-1', nombre: 'Ana Gómez', estado: 'presente', motivo: null },
          { id: 'as-2', nombre: 'Luis Ruiz', estado: 'ausente', motivo: null },
        ]}
      />,
    )
    expect(screen.queryByText(/No aplica/)).toBeNull()
  })

  it('keeps no_aplica rows visible (never dropped) in their own column', () => {
    render(<LecturaAsistenciaClase numero={1} tema={null} filas={FILAS} />)
    expect(screen.getByText('No aplica (1)')).toBeTruthy()
    expect(screen.getByText('Carla Soto')).toBeTruthy()
  })
})
