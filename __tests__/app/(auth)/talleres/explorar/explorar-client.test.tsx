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

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

const inscribirseActionMock = jest.fn()
const fabMock = jest.fn()

jest.mock('@/app/(auth)/talleres/explorar/actions', () => ({
  inscribirseATaller: (...args: unknown[]) => inscribirseActionMock(...args),
}))

jest.mock('@/components/talleres/explorar-fab', () => ({
  TallerExplorarFab: (props: {
    tallerId: string
    onInscribirse: () => Promise<{ ok: boolean; error?: string }>
    hidden?: boolean
  }) => {
    fabMock(props)
    return (
      <button
        data-testid="explorar-fab"
        data-taller-id={props.tallerId}
        onClick={() => {
          void props.onInscribirse()
        }}
      >
        Inscribirme
      </button>
    )
  },
}))

// PR G — the cónyuge picker. Mocked so the test drives the selection
// without the real Dialog / `/api/lideres/buscar` fetch. When open, it
// exposes a single button that reports a chosen usuario id.
jest.mock('@/components/modals/SelectLeaderModal', () => ({
  __esModule: true,
  default: (props: {
    open: boolean
    onClose: () => void
    onSelect: (usuario: { id: string; nombre: string; apellido: string }) => void
  }) =>
    props.open ? (
      <div data-testid="conyuge-modal">
        <button
          onClick={() =>
            props.onSelect({ id: 'companero-1', nombre: 'Ana', apellido: 'García' })
          }
        >
          pick-conyuge
        </button>
      </div>
    ) : null,
}))

import { ExplorarTalleresClient } from '@/app/(auth)/talleres/explorar/explorar-client'

beforeEach(() => {
  inscribirseActionMock.mockReset()
  fabMock.mockReset()
})

const baseRow = {
  id: 'ed-1',
  nombre: 'Matrimonio sobre la Roca',
  slug: 'matrimonio-sobre-la-roca',
  tipo: 'pareja' as const,
  link_type: 'matrimonio' as const,
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
  it('renders the abstract taller name as the title, edicion label as subtitle, plus modality and period dates', () => {
    render(
      <ExplorarTalleresClient
        talleres={[baseRow]}
        defaultCohorteId=""
      />,
    )

    // Title (PR38 widened): the abstract taller name ("Matrimonio sobre la Roca"),
    // not the edicion's nombre_snapshot ("Septiembre 2026").
    expect(screen.getByText('Matrimonio sobre la Roca')).toBeInTheDocument()

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
})

describe('ExplorarTalleresClient — spouse self-enroll (PR G)', () => {
  it('pareja: FAB opens the cónyuge picker, then enrolls with companeroId + linkType', async () => {
    inscribirseActionMock.mockResolvedValue({ ok: true, inscripcionId: 'insc-1' })
    render(<ExplorarTalleresClient talleres={[baseRow]} defaultCohorteId="" />)

    // Select the pareja card → FAB appears.
    fireEvent.click(
      screen.getByLabelText(/Seleccionar Matrimonio sobre la Roca/),
    )
    const fab = await screen.findByTestId('explorar-fab')

    // Clicking the FAB on a pareja taller must NOT enroll yet — it opens
    // the cónyuge picker first.
    fireEvent.click(fab)
    expect(screen.getByTestId('conyuge-modal')).toBeInTheDocument()
    expect(inscribirseActionMock).not.toHaveBeenCalled()

    // Picking a cónyuge fires the enrollment with the couple fields.
    fireEvent.click(screen.getByText('pick-conyuge'))
    await waitFor(() =>
      expect(inscribirseActionMock).toHaveBeenCalledWith({
        tallerId: 'ed-1',
        cohorteId: 'coh-1',
        companeroId: 'companero-1',
        linkType: 'matrimonio',
      }),
    )
  })

  it('individual: FAB enrolls directly without opening the picker', async () => {
    inscribirseActionMock.mockResolvedValue({ ok: true, inscripcionId: 'insc-2' })
    render(
      <ExplorarTalleresClient
        talleres={[
          {
            ...baseRow,
            id: 'ed-ind',
            tipo: 'individual' as const,
            link_type: null,
          },
        ]}
        defaultCohorteId=""
      />,
    )

    fireEvent.click(
      screen.getByLabelText(/Seleccionar Matrimonio sobre la Roca/),
    )
    const fab = await screen.findByTestId('explorar-fab')
    fireEvent.click(fab)

    await waitFor(() =>
      expect(inscribirseActionMock).toHaveBeenCalledWith({
        tallerId: 'ed-ind',
        cohorteId: 'coh-1',
        companeroId: null,
        linkType: null,
      }),
    )
    expect(screen.queryByTestId('conyuge-modal')).not.toBeInTheDocument()
  })
})
