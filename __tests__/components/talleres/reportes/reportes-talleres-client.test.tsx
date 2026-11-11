/**
 * R3g (odd/tasks/talleres-rediseno.md, S1/S2/S4) — the /talleres/reportes
 * screen (artboard design/talleres-interior/25): hero summary, quick ranges,
 * the three tabs with their lists and pills, the read-only detail, the URL
 * and neutral «tú» (no voseo).
 */
import React from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ReportesTalleresClient } from '@/components/talleres/reportes/reportes-talleres-client'
import type { ConsultaReportes, EdicionReporte, ReporteGrupo } from '@/lib/platform/talleres/reportes-vista'

const HOY = '2026-11-11'
const POR_DEFECTO: ConsultaReportes = { vista: 'talleres', rango: 'anio', filtro: null }

function edicion(over: Partial<EdicionReporte> = {}): EdicionReporte {
  return {
    id: 'ed-1',
    tallerId: 't-1',
    tallerNombre: 'Mujer de Hoy',
    tallerSlug: 'mujer-de-hoy',
    nombre: 'Edición oct 2026',
    estado: 'en_curso',
    fechaInicio: '2026-10-01',
    fechaFin: '2026-11-30',
    cerradaEn: null,
    inscripciones: 26,
    certificados: 0,
    completaron: null,
    conResultado: 0,
    ...over,
  }
}

const EDICIONES: readonly EdicionReporte[] = [
  edicion(),
  edicion({ id: 'ed-2', nombre: 'Edición jul 2026', estado: 'cerrado', cerradaEn: null, fechaInicio: '2026-07-01', fechaFin: '2026-08-20', inscripciones: 24, certificados: 0 }),
  edicion({
    id: 'ed-3',
    tallerId: 't-2',
    tallerNombre: 'Parejas',
    tallerSlug: 'parejas',
    nombre: 'Edición sep 2026',
    estado: 'cerrado',
    cerradaEn: '2026-10-31T00:00:00Z',
    fechaInicio: '2026-09-01',
    fechaFin: '2026-10-30',
    inscripciones: 26,
    completaron: 24,
    conResultado: 26,
    certificados: 22,
  }),
  edicion({ id: 'ed-viejo', tallerId: 't-3', tallerNombre: 'Punto de Partida', tallerSlug: 'pdp', nombre: 'Edición mar 2025', estado: 'cerrado', cerradaEn: '2025-05-01T00:00:00Z', fechaInicio: '2025-03-01', fechaFin: '2025-04-30', inscripciones: 31, completaron: 25, conResultado: 31, certificados: 22 }),
]

const GRUPOS: readonly ReporteGrupo[] = [
  { id: 'r-1', grupoId: 'g-1', grupoNombre: 'Grupo 1', estado: 'enviado', firmaLiderFecha: '2026-08-18T00:00:00Z', reabiertoMotivo: null, tallerNombre: 'Mujer de Hoy', edicionId: 'ed-2' },
  { id: 'r-2', grupoId: 'g-2', grupoNombre: 'Grupo 2', estado: 'reabierto', firmaLiderFecha: '2026-08-20T00:00:00Z', reabiertoMotivo: 'Faltaba una recuperación', tallerNombre: 'Mujer de Hoy', edicionId: 'ed-2' },
  { id: 'r-3', grupoId: 'abcdef12-3456', grupoNombre: null, estado: 'borrador', firmaLiderFecha: null, reabiertoMotivo: null, tallerNombre: null, edicionId: null },
]

function montar(props: Partial<React.ComponentProps<typeof ReportesTalleresClient>> = {}) {
  return render(
    <ReportesTalleresClient
      hoy={HOY}
      ediciones={EDICIONES}
      grupos={GRUPOS}
      consultaInicial={POR_DEFECTO}
      mostrarContadores={false}
      {...props}
    />,
  )
}

let replaceState: jest.SpyInstance

beforeEach(() => {
  replaceState = jest.spyOn(window.history, 'replaceState')
})

afterEach(() => {
  replaceState.mockRestore()
})

const NO_VOSEO = /\b(tenés|podés|tocá|explorá|mirá|vos|inscripto|necesitás|quitá|elegí)\b/i

describe('ReportesTalleresClient — hero and ranges', () => {
  it('sums the ediciones of this year in the summary line', () => {
    montar()
    const titulo = screen.getByRole('heading', { level: 1, name: 'Reportes de talleres' })
    const resumen = titulo.nextElementSibling as HTMLElement
    expect(resumen).toHaveTextContent('76 inscripciones · 22 certificados · 3 ediciones · este año')
  })

  it('switches the range with the pills, recalculates and mirrors it into the URL', async () => {
    montar()
    const rangos = screen.getByRole('group', { name: 'Rango de fechas' })
    expect(within(rangos).getByRole('button', { name: 'Este año' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(within(rangos).getByRole('button', { name: '2025' }))
    expect(within(rangos).getByRole('button', { name: '2025' })).toHaveAttribute('aria-pressed', 'true')
    const lista = screen.getByRole('table', { name: 'Talleres en el rango' })
    expect(within(lista).getAllByRole('button', { name: /^Abrir / }).map((b) => b.getAttribute('aria-label'))).toEqual(['Abrir Punto de Partida'])
    expect(replaceState).toHaveBeenLastCalledWith(null, '', '/talleres/reportes?rango=anterior')
  })
})

describe('ReportesTalleresClient — Por taller', () => {
  it('lists the talleres with their roll-up, most inscripciones first', () => {
    montar()
    const lista = screen.getByRole('table', { name: 'Talleres en el rango' })
    const filas = within(lista).getAllByRole('button', { name: /^Abrir / })
    expect(filas.map((b) => b.getAttribute('aria-label'))).toEqual(['Abrir Mujer de Hoy', 'Abrir Parejas'])
    expect(screen.getByRole('status')).toHaveTextContent('2 talleres')
  })

  it('opens the read-only detail of a taller with its ediciones and the link to the taller', async () => {
    montar()
    await userEvent.click(screen.getByRole('button', { name: 'Abrir Mujer de Hoy' }))
    const panel = await screen.findByRole('dialog')
    expect(within(panel).getByRole('heading', { name: 'Mujer de Hoy' })).toBeInTheDocument()
    expect(within(panel).getByText('Edición jul 2026')).toBeInTheDocument()
    expect(within(panel).getByText('Terminó sin cerrar')).toBeInTheDocument()
    expect(within(panel).getByRole('link', { name: 'Ver taller' })).toHaveAttribute('href', '/talleres/mujer-de-hoy')
  })
})

describe('ReportesTalleresClient — Por edición', () => {
  it('shows each edición with its estado and filters «Terminadas sin cerrar»', async () => {
    montar({ consultaInicial: { ...POR_DEFECTO, vista: 'ediciones' } })
    const lista = screen.getByRole('table', { name: 'Ediciones en el rango' })
    expect(within(lista).getAllByRole('button', { name: /^Abrir / })).toHaveLength(3)

    const pastilla = screen.getByRole('button', { name: /Terminadas sin cerrar/ })
    expect(pastilla).toHaveTextContent('1')
    await userEvent.click(pastilla)
    expect(pastilla).toHaveAttribute('aria-pressed', 'true')
    expect(within(screen.getByRole('table', { name: 'Ediciones en el rango' })).getAllByRole('button', { name: /^Abrir / })).toHaveLength(1)
    expect(replaceState).toHaveBeenLastCalledWith(null, '', '/talleres/reportes?vista=ediciones&filtro=sin-cerrar')
  })

  it('opens an edición with the notice to close it and the link to the edición', async () => {
    montar({ consultaInicial: { ...POR_DEFECTO, vista: 'ediciones' } })
    await userEvent.click(screen.getByRole('button', { name: 'Abrir Mujer de Hoy, Edición jul 2026' }))
    const panel = await screen.findByRole('dialog')
    expect(within(panel).getByText(/nadie la ha cerrado/)).toBeInTheDocument()
    expect(within(panel).getByRole('link', { name: 'Ver edición' })).toHaveAttribute('href', '/talleres/mujer-de-hoy/ed-2')
  })
})

describe('ReportesTalleresClient — Reportes de grupos', () => {
  it('always shows «Reabierto» and never drops a report without grupo or taller', () => {
    montar({ consultaInicial: { ...POR_DEFECTO, vista: 'grupos' } })
    const lista = screen.getByRole('table', { name: 'Reportes finales de cada grupo' })
    expect(within(lista).getAllByText('Reabierto').length).toBeGreaterThan(0)
    expect(within(lista).getAllByText('Grupo abcdef12…').length).toBeGreaterThan(0)
  })

  it('filters the reopened reports with the pill', async () => {
    montar({ consultaInicial: { ...POR_DEFECTO, vista: 'grupos' } })
    await userEvent.click(screen.getByRole('button', { name: /Reabiertos/ }))
    const lista = screen.getByRole('table', { name: 'Reportes finales de cada grupo' })
    expect(within(lista).getAllByRole('button', { name: /^Abrir / }).map((b) => b.getAttribute('aria-label'))).toEqual(['Abrir Grupo 2, Mujer de Hoy'])
  })

  it('shows the estado counters only with breadth', () => {
    const { unmount } = montar({ consultaInicial: { ...POR_DEFECTO, vista: 'grupos' } })
    expect(screen.queryByText(/Enviado:/)).not.toBeInTheDocument()
    unmount()
    montar({ consultaInicial: { ...POR_DEFECTO, vista: 'grupos' }, mostrarContadores: true })
    expect(screen.getByText(/Enviado:/)).toBeInTheDocument()
  })

  it('opens a report with why it was reopened and the link to the grupo', async () => {
    montar({ consultaInicial: { ...POR_DEFECTO, vista: 'grupos' } })
    await userEvent.click(screen.getByRole('button', { name: 'Abrir Grupo 2, Mujer de Hoy' }))
    const panel = await screen.findByRole('dialog')
    expect(within(panel).getByText('Faltaba una recuperación')).toBeInTheDocument()
    expect(within(panel).getByRole('link', { name: 'Ver grupo' })).toHaveAttribute('href', '/talleres/mujer-de-hoy/ed-2/g-2')
  })
})

describe('ReportesTalleresClient — empty and language', () => {
  it('shows an empty state with a way out when the range has no ediciones', () => {
    montar({ ediciones: [], grupos: [] })
    expect(screen.getByText('No hay ediciones en este rango')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ver últimos 6 meses' })).toBeInTheDocument()
  })

  it('uses neutral «tú», never voseo', () => {
    const { container } = montar()
    expect(container.textContent).not.toMatch(NO_VOSEO)
  })
})
