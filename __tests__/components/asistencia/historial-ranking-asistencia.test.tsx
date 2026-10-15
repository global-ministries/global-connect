/**
 * @jest-environment jsdom
 *
 * ui-areas-formularios — group attendance history and rankings on the design
 * system: icon-only actions carry labels, KPI cards link to the rankings and
 * the percentage scale maps to status tokens.
 */

import { render, screen } from '@testing-library/react'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}))
// recharts needs ResizeObserver and a real layout; the empty chart is covered in reporte-asistencia-usuario.
jest.mock('@/components/asistencia/GraficoTendencia.client', () => ({ __esModule: true, default: () => null }))

import HistorialAsistenciaClient from '@/components/asistencia/HistorialAsistencia.client'
import RankingAsistenciaClient from '@/components/asistencia/RankingAsistencia.client'
import { claseBarraAsistencia, claseTextoAsistencia } from '@/components/asistencia/partes-asistencia'

const reporte = {
  kpis: {
    asistencia_promedio: 82,
    total_reuniones: 4,
    miembro_mas_constante: { id: 'm1', nombre: 'Ana Pérez', asistencias: 4 },
    miembro_mas_ausencias: { id: 'm2', nombre: 'Luis Gómez', ausencias: 3 },
  },
  series_temporales: [],
  eventos_historial: [{ id: 'e1', fecha: '2026-10-01T00:00:00Z', tema: 'Fe', presentes: 8, total: 10, porcentaje: 80 }],
}

describe('HistorialAsistencia on the design system', () => {
  it('labels the view and edit links of each event', () => {
    render(<HistorialAsistenciaClient grupoId="g1" reporte={reporte} />)

    for (const enlace of screen.getAllByRole('link', { name: 'Ver evento' })) {
      expect(enlace.getAttribute('href')).toBe('/grupos-vida/g1/asistencia/e1')
    }
    for (const enlace of screen.getAllByRole('link', { name: 'Editar evento' })) {
      expect(enlace.getAttribute('href')).toBe('/grupos-vida/g1/asistencia/editar/e1')
    }
  })

  it('links the member KPI cards to their rankings', () => {
    render(<HistorialAsistenciaClient grupoId="g1" reporte={reporte} />)

    expect(screen.getByRole('link', { name: /Más Constante/ }).getAttribute('href')).toBe('/grupos-vida/g1/asistencia/historial/mas-constantes')
    expect(screen.getByRole('link', { name: /Más Ausencias/ }).getAttribute('href')).toBe('/grupos-vida/g1/asistencia/historial/mas-ausencias')
  })

  it('shows an empty state without events', () => {
    render(<HistorialAsistenciaClient grupoId="g1" reporte={{ ...reporte, eventos_historial: [] }} />)

    expect(screen.getByText('No hay eventos en este período')).toBeTruthy()
  })
})

describe('RankingAsistencia on the design system', () => {
  const miembros = [
    { id: 'm1', nombre: 'Ana Pérez', email: 'a@x.com', asistencias: 4, ausencias: 0, total_registros: 4, porcentaje: 100 },
    { id: 'm2', nombre: 'Luis Gómez', email: 'l@x.com', asistencias: 1, ausencias: 3, total_registros: 4, porcentaje: 25 },
  ]

  it('lists the members in ranking order with their status', () => {
    render(<RankingAsistenciaClient modo="constantes" miembros={miembros} totalEventos={4} grupoNombre="Norte" />)

    const filas = screen.getAllByRole('listitem')
    expect(filas).toHaveLength(2)
    expect(filas[0].textContent).toContain('Ana Pérez')
    expect(filas[0].textContent).toContain('Bien')
    expect(filas[1].textContent).toContain('Prestar atención')
  })

  it('shows an empty state without members', () => {
    render(<RankingAsistenciaClient modo="ausentes" miembros={[]} totalEventos={0} grupoNombre="Norte" />)

    expect(screen.getByText('Sin datos de asistencia')).toBeTruthy()
    expect(screen.getByText('N/D')).toBeTruthy()
  })
})

describe('attendance percentage scale', () => {
  it.each([
    [80, 'bg-success', 'text-success'],
    [60, 'bg-warning', 'text-amber-700 dark:text-amber-400'],
    [40, 'bg-[var(--brand-primary)]', 'text-danger'],
    [39, 'bg-danger', 'text-danger'],
  ])('%i%% maps to %s / %s', (porcentaje, barra, texto) => {
    expect(claseBarraAsistencia(porcentaje)).toBe(barra)
    expect(claseTextoAsistencia(porcentaje)).toBe(texto)
  })
})
