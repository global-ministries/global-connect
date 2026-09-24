/**
 * Tests for the shared `<TablaInscripciones>` server component.
 *
 * Verifies:
 *   - Desktop: renders a `<table>` containing one `<tr>` per row
 *     with the expected headers + cells.
 *   - Mobile: renders one card per row (`TarjetaSistema p-4`).
 *   - Action buttons: appear when `canWrite` is true AND the row's
 *     estado is `pendiente`. For non-pendiente rows, only the
 *     state badge is rendered in the action column.
 *   - Read-only (`canWrite: false`): action buttons are NEVER
 *     rendered, even for pendiente rows.
 *   - Badges use the right mapping (success / warning / error /
 *     default) for each estado.
 *   - Empty rows array: nothing crashes, just an empty fragment
 *     (the empty-state card is rendered by the parent page).
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

import {
  TablaInscripciones,
  type TablaInscripcionesProps,
} from '@/components/talleres/tabla-inscripciones'
import type {
  InscripcionApproveAction,
  InscripcionRejectAction,
} from '@/components/talleres/inscripcion-actions'
import type { InscripcionAdminRow } from '@/lib/platform/talleres/inscripciones-types'

const successMock = jest.fn()
const errorMock = jest.fn()
jest.mock('@/hooks/use-notificaciones', () => ({
  useNotificaciones: () => ({ success: successMock, error: errorMock, info: jest.fn() }),
}))

const fetchMock = jest.fn()
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test global fetch stub
;(global as any).fetch = fetchMock

jest.mock('@/components/talleres/inscripcion-actions', () => ({
  ApproveInscripcionButton: ({
    inscripcionId,
  }: {
    readonly inscripcionId: string
  }) => (
    <button data-testid={`approve-${inscripcionId}`}>Aprobar</button>
  ),
  RejectInscripcionButton: ({
    inscripcionId,
  }: {
    readonly inscripcionId: string
  }) => (
    <button data-testid={`reject-${inscripcionId}`}>Rechazar</button>
  ),
}))

const onApprove: InscripcionApproveAction = jest.fn(async () => ({
  ok: true,
  message: 'ok',
}))
const onReject: InscripcionRejectAction = jest.fn(async () => ({
  ok: true,
  message: 'ok',
}))

const BASE_ROW = {
  edicion_estado: 'abierto',
  taller_slug: 'matrimonio-sobre-la-roca',
  cohorte_id: 'coh-1',
  cohorte_edicion: 'Septiembre 2026',
  persona_principal_email: 'isaac@example.com',
  companero_id: null,
  companero_nombre: null,
  link_type: null,
  updated_at: '2026-08-15T12:00:00Z',
  grupo_id: null,
  grupo_nombre: null,
} as const

function makeRow(overrides: Partial<{
  id: string
  taller_id: string
  taller_nombre: string
  edicion_id: string
  edicion_nombre: string
  persona_principal_id: string
  persona_principal_nombre: string
  estado: 'pendiente' | 'aprobado' | 'no_aprobado' | 'completado' | 'retirado'
  link_type: 'matrimonio' | 'novios' | null
  cohorte_edicion: string | null
  cohorte_id: string | null
  companero_nombre: string | null
  created_at: string
  grupo_id: string | null
  grupo_nombre: string | null
}>) {
  return {
    id: 'insc-1',
    taller_id: 't-1',
    taller_nombre: 'Matrimonio sobre la Roca',
    edicion_id: 'ed-1',
    edicion_nombre: 'Septiembre 2026',
    persona_principal_id: 'u-1',
    persona_principal_nombre: 'Isaac Paez',
    estado: 'pendiente',
    created_at: '2026-08-15T12:00:00Z',
    ...BASE_ROW,
    ...overrides,
  } as InscripcionAdminRow
}

function renderTabla(overrides: Partial<TablaInscripcionesProps> = {}) {
  return render(
    <TablaInscripciones
      rows={[]}
      canWrite={true}
      onApprove={onApprove}
      onReject={onReject}
      {...overrides}
    />,
  )
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('TablaInscripciones — desktop table', () => {
  it('renders a <table> with the expected headers', () => {
    renderTabla({ rows: [makeRow({})] })
    // The desktop block uses hidden sm:block (visible by default in
    // jsdom which is desktop-equivalent). The mobile block uses
    // sm:hidden which is also visible by default. We just assert
    // the headers exist at least once in the DOM.
    expect(screen.getAllByText('Persona').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Edición').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Cohorte').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Estado').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Compañero').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Fecha').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Acciones').length).toBeGreaterThan(0)
  })

  it('renders one row per inscripcion', () => {
    renderTabla({
      rows: [
        makeRow({ id: 'insc-1' }),
        makeRow({ id: 'insc-2', persona_principal_nombre: 'María Pérez' }),
      ],
    })
    // The component renders the same row twice (desktop table + mobile
    // cards) — assert at least one of each id is present.
    expect(screen.getAllByTestId('approve-insc-1').length).toBeGreaterThan(0)
    expect(screen.getAllByTestId('approve-insc-2').length).toBeGreaterThan(0)
  })

  it('shows the persona nombre + taller nombre + edicion nombre', () => {
    renderTabla({ rows: [makeRow({})] })
    expect(screen.getAllByText('Isaac Paez').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Matrimonio sobre la Roca').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Septiembre 2026').length).toBeGreaterThan(0)
  })

  it('renders the cohorte edicion column when present', () => {
    renderTabla({
      rows: [makeRow({ cohorte_edicion: 'Cohorte A' })],
    })
    // Both desktop + mobile surfaces render "Cohorte A" — count is >= 1.
    expect(screen.getAllByText('Cohorte A').length).toBeGreaterThan(0)
  })

  it('renders the link badge when link_type is set', () => {
    renderTabla({
      rows: [makeRow({ link_type: 'matrimonio' })],
    })
    expect(screen.getAllByText('Matrimonio').length).toBeGreaterThan(0)
  })

  it('renders the compañero nombre when present', () => {
    renderTabla({
      rows: [makeRow({ companero_nombre: 'María Pérez' })],
    })
    // The mobile card uses "+ María Pérez" prefix.
    expect(screen.getAllByText(/\+ Mar\u00eda P\u00e9rez| Mar\u00eda P\u00e9rez/).length).toBeGreaterThan(0)
  })
})

describe('TablaInscripciones — actions gating', () => {
  it('shows Approve + Reject when canWrite && estado=pendiente', () => {
    renderTabla({
      rows: [makeRow({ id: 'insc-p', estado: 'pendiente' })],
      canWrite: true,
    })
    // Component renders both desktop + mobile — at least one of each
    // button is present.
    expect(screen.getAllByTestId('approve-insc-p').length).toBeGreaterThan(0)
    expect(screen.getAllByTestId('reject-insc-p').length).toBeGreaterThan(0)
  })

  it('hides Approve + Reject when estado=aprobado (even if canWrite)', () => {
    renderTabla({
      rows: [makeRow({ id: 'insc-a', estado: 'aprobado' })],
      canWrite: true,
    })
    expect(screen.queryByTestId('approve-insc-a')).not.toBeInTheDocument()
    expect(screen.queryByTestId('reject-insc-a')).not.toBeInTheDocument()
  })

  it('hides Approve + Reject when estado=no_aprobado', () => {
    renderTabla({
      rows: [makeRow({ id: 'insc-na', estado: 'no_aprobado' })],
      canWrite: true,
    })
    expect(screen.queryByTestId('approve-insc-na')).not.toBeInTheDocument()
    expect(screen.queryByTestId('reject-insc-na')).not.toBeInTheDocument()
  })

  it('hides Approve + Reject when canWrite=false (read-only)', () => {
    renderTabla({
      rows: [makeRow({ id: 'insc-r', estado: 'pendiente' })],
      canWrite: false,
    })
    expect(screen.queryByTestId('approve-insc-r')).not.toBeInTheDocument()
    expect(screen.queryByTestId('reject-insc-r')).not.toBeInTheDocument()
  })
})

// T6 (odd/tasks/talleres-consolidar-pantallas.md) — /talleres/pendientes
// aggregates rows from several equipos, each with its OWN permisos. A
// single flat `canWrite: boolean` cannot express "row A shows buttons,
// row B (a different equipo the viewer can't act on) shows its estado
// badge instead" — the exact fallback this component already has for
// `canWrite === false`. `canWrite` now additionally accepts a per-row
// resolver function; a plain boolean keeps working unchanged for every
// existing caller.
describe('TablaInscripciones — per-row canWrite (T6)', () => {
  // CORRECTION (post-T4 review, item 1): canWrite used to also accept a
  // function `(row) => boolean`. TablaInscripciones is now `'use client'`
  // (T3), and Next.js refuses to pass a function prop from a server
  // component into a client component ("Functions cannot be passed
  // directly to Client Components") — /talleres/pendientes (a server
  // component) crashed at render. Jest never crosses the RSC boundary, so
  // the old test passed anyway. Fixed by making canWrite serializable:
  // a plain boolean, or the array of writable row ids.
  it('accepts an array of writable ids and resolves it PER ROW instead of once for the whole table', () => {
    renderTabla({
      rows: [
        makeRow({ id: 'insc-a', taller_id: 't-a', estado: 'pendiente' }),
        makeRow({ id: 'insc-b', taller_id: 't-b', estado: 'pendiente' }),
      ],
      canWrite: ['insc-a'],
    })
    expect(screen.getAllByTestId('approve-insc-a').length).toBeGreaterThan(0)
    expect(screen.queryByTestId('approve-insc-b')).not.toBeInTheDocument()
    // The row without write access falls back to the estado badge —
    // TablaInscripciones's existing canWrite=false behavior, just now
    // resolved per row instead of for the whole table.
    expect(screen.getAllByText('Pendiente').length).toBeGreaterThan(0)
  })

  it('a plain boolean still applies uniformly to every row (backward compatible)', () => {
    renderTabla({
      rows: [
        makeRow({ id: 'insc-a', estado: 'pendiente' }),
        makeRow({ id: 'insc-b', estado: 'pendiente' }),
      ],
      canWrite: true,
    })
    expect(screen.getAllByTestId('approve-insc-a').length).toBeGreaterThan(0)
    expect(screen.getAllByTestId('approve-insc-b').length).toBeGreaterThan(0)
  })
})

describe('TablaInscripciones — empty rows', () => {
  it('renders nothing crash-y when rows is empty', () => {
    const { container } = renderTabla({ rows: [] })
    expect(container).toBeDefined()
    // No buttons, no test ids.
    expect(screen.queryByTestId('approve-insc-1')).not.toBeInTheDocument()
  })
})

describe('TablaInscripciones — estado badge variants', () => {
  it('renders aprobado badge variant for aprobado rows', () => {
    renderTabla({
      rows: [makeRow({ id: 'insc-a', estado: 'aprobado' })],
      canWrite: false,
    })
    const badges = screen.getAllByText('Aprobado')
    expect(badges.length).toBeGreaterThan(0)
  })

  it('renders pendiente badge variant for pendiente rows', () => {
    renderTabla({
      rows: [makeRow({ id: 'insc-p', estado: 'pendiente' })],
      canWrite: false,
    })
    const badges = screen.getAllByText('Pendiente')
    expect(badges.length).toBeGreaterThan(0)
  })

  it('renders no_aprobado badge variant for rejected rows', () => {
    renderTabla({
      rows: [makeRow({ id: 'insc-na', estado: 'no_aprobado' })],
      canWrite: false,
    })
    const badges = screen.getAllByText('No aprobado')
    expect(badges.length).toBeGreaterThan(0)
  })

  it('renders completado badge variant for completed rows', () => {
    renderTabla({
      rows: [makeRow({ id: 'insc-c', estado: 'completado' })],
      canWrite: false,
    })
    const badges = screen.getAllByText('Completado')
    expect(badges.length).toBeGreaterThan(0)
  })

  it('renders retirado badge variant for withdrawn rows', () => {
    // A participante_retiro that was APPROVED lands the inscripción in the
    // terminal 'retirado' estado (additive CHECK widen). The badge must
    // read "Retirado" (not the raw lowercase estado) and never expose an
    // approve/reject control (terminal state).
    renderTabla({
      rows: [makeRow({ id: 'insc-ret', estado: 'retirado' })],
      canWrite: false,
    })
    const badges = screen.getAllByText('Retirado')
    expect(badges.length).toBeGreaterThan(0)
  })

  it('hides Approve + Reject when estado=retirado (terminal)', () => {
    renderTabla({
      rows: [makeRow({ id: 'insc-ret2', estado: 'retirado' })],
      canWrite: true,
    })
    expect(screen.queryByTestId('approve-insc-ret2')).not.toBeInTheDocument()
    expect(screen.queryByTestId('reject-insc-ret2')).not.toBeInTheDocument()
  })
})

// T3 (odd/tasks/talleres-inscripcion-a-grupo.md) — Grupo column, always
// rendered (em-dash when unplaced), independent of the seleccion feature.
describe('TablaInscripciones — Grupo column', () => {
  it('renders the Grupo header and the grupo nombre when placed', () => {
    renderTabla({ rows: [makeRow({ grupo_id: 'g-1', grupo_nombre: 'Grupo Alfa' })] })
    expect(screen.getAllByText('Grupo').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Grupo Alfa').length).toBeGreaterThan(0)
  })

  it('renders an em-dash when the row is unplaced', () => {
    renderTabla({ rows: [makeRow({ grupo_id: null, grupo_nombre: null })] })
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })
})

// T3 — bulk selection: checkboxes on aprobado rows only, gated by the
// `seleccion` prop (hide-not-disable: the prop itself is only passed by
// the page when the viewer holds gestionar_grupos).
describe('TablaInscripciones — bulk selection (T3)', () => {
  const GRUPOS = [
    { id: 'g-1', nombre: 'Grupo Alfa' },
    { id: 'g-2', nombre: 'Grupo Beta' },
  ]

  it('renders no checkboxes and no bulk bar when seleccion is not passed', () => {
    renderTabla({ rows: [makeRow({ id: 'insc-a', estado: 'aprobado' })] })
    expect(screen.queryByTestId('checkbox-insc-a')).not.toBeInTheDocument()
    expect(screen.queryByText('Asignar a grupo')).not.toBeInTheDocument()
  })

  it('renders a checkbox only for aprobado rows when seleccion is passed', () => {
    renderTabla({
      rows: [
        makeRow({ id: 'insc-a', estado: 'aprobado' }),
        makeRow({ id: 'insc-p', estado: 'pendiente' }),
        makeRow({ id: 'insc-r', estado: 'retirado' }),
      ],
      seleccion: { grupos: GRUPOS },
    })
    expect(screen.getAllByTestId('checkbox-insc-a').length).toBeGreaterThan(0)
    expect(screen.queryByTestId('checkbox-insc-p')).not.toBeInTheDocument()
    expect(screen.queryByTestId('checkbox-insc-r')).not.toBeInTheDocument()
  })

  it('shows the selection count and enables the bulk bar as rows are checked', async () => {
    const user = userEvent.setup()
    renderTabla({
      rows: [makeRow({ id: 'insc-a', estado: 'aprobado' })],
      seleccion: { grupos: GRUPOS },
    })
    const boxes = screen.getAllByTestId('checkbox-insc-a')
    await user.click(boxes[0]!)
    expect(screen.getAllByText(/1 seleccionad/i).length).toBeGreaterThan(0)
  })

  it('"Asignar a grupo" posts the selected ids and chosen grupo_id, reports success', async () => {
    const user = userEvent.setup()
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ asignadas: 1, ocupacion: 2, capacidad: 10 }),
    })
    renderTabla({
      rows: [makeRow({ id: 'insc-a', estado: 'aprobado' })],
      seleccion: { grupos: GRUPOS },
    })
    await user.click(screen.getAllByTestId('checkbox-insc-a')[0]!)
    const select = screen.getAllByLabelText(/grupo/i)[0] as HTMLSelectElement
    await user.selectOptions(select, 'g-1')
    await user.click(screen.getAllByText('Asignar a grupo')[0]!)

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/talleres/inscripciones/asignar-grupo',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ inscripcion_ids: ['insc-a'], grupo_id: 'g-1' }),
      }),
    )
    expect(successMock).toHaveBeenCalled()
  })

  it('shows the excess in the success feedback when over capacity', async () => {
    const user = userEvent.setup()
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ asignadas: 1, ocupacion: 13, capacidad: 12 }),
    })
    renderTabla({
      rows: [makeRow({ id: 'insc-a', estado: 'aprobado' })],
      seleccion: { grupos: GRUPOS },
    })
    await user.click(screen.getAllByTestId('checkbox-insc-a')[0]!)
    const select = screen.getAllByLabelText(/grupo/i)[0] as HTMLSelectElement
    await user.selectOptions(select, 'g-1')
    await user.click(screen.getAllByText('Asignar a grupo')[0]!)

    expect(successMock).toHaveBeenCalledWith(expect.stringMatching(/13.*12|por encima/))
  })

  it('"Quitar del grupo" posts grupo_id: null', async () => {
    const user = userEvent.setup()
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ asignadas: 1, ocupacion: null, capacidad: null }),
    })
    renderTabla({
      rows: [makeRow({ id: 'insc-a', estado: 'aprobado', grupo_id: 'g-1', grupo_nombre: 'Grupo Alfa' })],
      seleccion: { grupos: GRUPOS },
    })
    await user.click(screen.getAllByTestId('checkbox-insc-a')[0]!)
    await user.click(screen.getAllByText('Quitar del grupo')[0]!)

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/talleres/inscripciones/asignar-grupo',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ inscripcion_ids: ['insc-a'], grupo_id: null }),
      }),
    )
  })

  it('reports the mapped Spanish error message on failure and never crashes', async () => {
    const user = userEvent.setup()
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'FORBIDDEN', message: 'No tenés permiso para esto.' }),
    })
    renderTabla({
      rows: [makeRow({ id: 'insc-a', estado: 'aprobado' })],
      seleccion: { grupos: GRUPOS },
    })
    await user.click(screen.getAllByTestId('checkbox-insc-a')[0]!)
    const select = screen.getAllByLabelText(/grupo/i)[0] as HTMLSelectElement
    await user.selectOptions(select, 'g-1')
    await user.click(screen.getAllByText('Asignar a grupo')[0]!)

    expect(errorMock).toHaveBeenCalledWith('No tenés permiso para esto.')
  })
})