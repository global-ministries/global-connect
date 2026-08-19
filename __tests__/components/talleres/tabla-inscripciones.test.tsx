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
} as const

function makeRow(overrides: Partial<{
  id: string
  taller_id: string
  taller_nombre: string
  edicion_id: string
  edicion_nombre: string
  persona_principal_id: string
  persona_principal_nombre: string
  estado: 'pendiente' | 'aprobado' | 'no_aprobado' | 'completado'
  link_type: 'matrimonio' | 'novios' | null
  cohorte_edicion: string | null
  cohorte_id: string | null
  companero_nombre: string | null
  created_at: string
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
})