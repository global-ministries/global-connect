/**
 * @jest-environment jsdom
 *
 * PR38 — Tests for /talleres/explorar client card (Issue #2).
 *
 * The client receives a list of `ParticipanteExplorarRow` from the
 * RSC page and renders each one as a card. The card must now
 * surface:
 *   - modality (from `talleres.modalidad_default`)
 *   - period dates (from `taller_periodos_generales`)
 *   - the edicion label (instead of "Edición undefined")
 *
 * We mock the server action and the FAB so the test stays focused
 * on the card's static rendering. We use `render` + DOM querying
 * via @testing-library/react.
 */

import { render, screen } from '@testing-library/react'
import React from 'react'

const inscribirseActionMock = jest.fn()
const fabMock = jest.fn()

jest.mock('@/app/(auth)/talleres/explorar/actions', () => ({
  inscribirseATaller: (...args: unknown[]) => inscribirseActionMock(...args),
}))

jest.mock('@/components/talleres/explorar-fab', () => ({
  TallerExplorarFab: (props: { tallerId: string }) => {
    fabMock(props)
    return <div data-testid="explorar-fab" data-taller-id={props.tallerId} />
  },
}))

import { ExplorarTalleresClient } from '@/app/(auth)/talleres/explorar/explorar-client'

beforeEach(() => {
  inscribirseActionMock.mockReset()
  fabMock.mockReset()
})

const baseRow = {
  id: 'ed-1',
  nombre: 'Septiembre 2026',
  tipo: 'pareja' as const,
  edicion: 'Septiembre 2026',
  estado: 'abierto' as const,
  ya_inscrito: false,
  cohorte_id: 'coh-1',
  modalidad: 'periodo_general' as const,
  descripcion: 'Un taller de prueba',
  fecha_apertura: '2026-08-20T00:00:00Z',
  fecha_cierre: '2026-09-30T23:59:59Z',
}

describe('ExplorarTalleresClient — card content (PR38)', () => {
  it('renders the edicion label, modality, and period dates on the card', () => {
    render(
      <ExplorarTalleresClient
        talleres={[baseRow]}
        defaultCohorteId=""
      />,
    )

    // Title: "Septiembre 2026" (was previously "Edición undefined").
    expect(screen.getByText('Septiembre 2026')).toBeInTheDocument()

    // Subtitle: "Edición Septiembre 2026 · Pareja"
    expect(
      screen.getByText(/Edición Septiembre 2026 · Pareja/),
    ).toBeInTheDocument()

    // New (PR38): modality surfaced as a label.
    expect(screen.getByText(/Modalidad: Periodo general/)).toBeInTheDocument()

    // New (PR38): period dates shown when both apertura + cierre exist.
    const inscrText = screen.getByText(/Inscripciones:.*—/)
    expect(inscrText).toBeInTheDocument()

    // State badge.
    expect(screen.getByText('abierto')).toBeInTheDocument()
  })

  it('renders the permanente_custom modality label', () => {
    render(
      <ExplorarTalleresClient
        talleres={[
          { ...baseRow, id: 'ed-2', modalidad: 'permanente_custom' as const },
        ]}
        defaultCohorteId=""
      />,
    )

    expect(screen.getByText(/Modalidad: Permanente custom/)).toBeInTheDocument()
  })

  it('does NOT render the period dates block when fecha_apertura or fecha_cierre are null', () => {
    render(
      <ExplorarTalleresClient
        talleres={[
          {
            ...baseRow,
            id: 'ed-3',
            fecha_apertura: null,
            fecha_cierre: null,
          },
        ]}
        defaultCohorteId=""
      />,
    )

    // The period block is conditional on both dates being present.
    expect(screen.queryByText(/Inscripciones:.*—/)).not.toBeInTheDocument()
    // Modality still shows even when dates are absent.
    expect(screen.getByText(/Modalidad: Periodo general/)).toBeInTheDocument()
  })

  it('renders Individual for tipo=individual', () => {
    render(
      <ExplorarTalleresClient
        talleres={[
          { ...baseRow, id: 'ed-4', tipo: 'individual' as const },
        ]}
        defaultCohorteId=""
      />,
    )

    expect(
      screen.getByText(/Edición Septiembre 2026 · Individual/),
    ).toBeInTheDocument()
  })

  it('falls back to "Edición" when the edicion label is null (no trailing colon)', () => {
    render(
      <ExplorarTalleresClient
        talleres={[
          { ...baseRow, id: 'ed-5', edicion: null },
        ]}
        defaultCohorteId=""
      />,
    )

    // Subtitle is still present; the edicion label slot falls back
    // gracefully without breaking the layout.
    expect(
      screen.getByText(/Edición\s+·\s+Pareja|Edición · Pareja/),
    ).toBeInTheDocument()
  })
})
