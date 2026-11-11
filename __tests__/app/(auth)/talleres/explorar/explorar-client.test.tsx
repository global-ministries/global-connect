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

// Inscripción en pareja (odd/tasks/talleres-inscripcion-en-pareja.md P2) —
// the leaders-only SelectLeaderModal is gone from Explorar. Kept mocked so a
// regression that renders it again shows up as `legacy-leader-modal`.
jest.mock('@/components/modals/SelectLeaderModal', () => ({
  __esModule: true,
  default: (props: { open: boolean }) =>
    props.open ? <div data-testid="legacy-leader-modal" /> : null,
}))

// The partner picker (registered spouse, then cédula) is covered by
// __tests__/components/talleres/selector-pareja.test.tsx; here it is a stub
// that records its props and lets the test report a finished enrollment.
const selectorMock = jest.fn()
jest.mock('@/components/talleres/selector-pareja', () => ({
  SelectorPareja: (props: {
    edicionId: string
    vinculoEdicion: 'matrimonio' | 'novios' | null
    onCerrar: () => void
    onInscrito: () => void
  }) => {
    selectorMock(props)
    return (
      <div data-testid="selector-pareja">
        <button onClick={props.onInscrito}>pareja-inscrita</button>
        <button onClick={props.onCerrar}>cerrar-selector</button>
      </div>
    )
  },
}))

import { ExplorarTalleresClient } from '@/app/(auth)/talleres/explorar/explorar-client'

beforeEach(() => {
  inscribirseActionMock.mockReset()
  fabMock.mockReset()
  selectorMock.mockReset()
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
  // T5 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) — the
  // edición's own cierre_inscripcion (never the deprecated periodo dates
  // above), shown as "Inscripción hasta {fecha}".
  cierre_inscripcion: '2026-09-15',
  // T6 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) — not full
  // by default; the "Cupo completo" tests below override this.
  cupo_completo: false,
}

describe('ExplorarTalleresClient — card content (PR38)', () => {
  it('renders the abstract taller name as the title, edicion label as subtitle, plus modality and period dates', () => {
    render(
      <ExplorarTalleresClient
        talleres={[baseRow]}
      />,
    )

    // Title (PR38 widened): the abstract taller name ("Matrimonio sobre la Roca"),
    // not the edicion's nombre_snapshot ("Septiembre 2026").
    expect(screen.getByText('Matrimonio sobre la Roca')).toBeInTheDocument()

    // Subtitle: "Edición Septiembre 2026 · Pareja"
    expect(
      screen.getByText(/Edición Septiembre 2026 · Pareja/),
    ).toBeInTheDocument()

    // T9 (odd/tasks/proximo-paso.md, L21) — no internal modality jargon.
    expect(screen.queryByText(/Modalidad/)).not.toBeInTheDocument()

    // New (PR38): period dates shown when both apertura + cierre exist.
    const inscrText = screen.getByText(/Inscripciones:.*—/)
    expect(inscrText).toBeInTheDocument()

    // State badge — through edicionEstadoLabel, never the raw key.
    expect(screen.getByText('Abierta')).toBeInTheDocument()
    expect(screen.queryByText('abierto')).not.toBeInTheDocument()

    // T5 — "Inscripción hasta {cierre_inscripcion}".
    expect(screen.getByText(/inscripción hasta/i)).toBeInTheDocument()
  })

  it('never renders a raw taller_ediciones.estado key — always through edicionEstadoLabel', () => {
    render(
      <ExplorarTalleresClient
        talleres={[{ ...baseRow, id: 'ed-en-curso', estado: 'en_curso' as const }]}
      />,
    )
    expect(screen.getByText('En curso')).toBeInTheDocument()
    expect(screen.queryByText('en_curso')).not.toBeInTheDocument()
  })

  it('shows "Inscripción hasta {cierre_inscripcion}" when present', () => {
    render(<ExplorarTalleresClient talleres={[baseRow]} />)
    expect(screen.getByText(/inscripción hasta.*2026/i)).toBeInTheDocument()
  })

  it('does not show the "Inscripción hasta" line when cierre_inscripcion is null', () => {
    render(
      <ExplorarTalleresClient
        talleres={[{ ...baseRow, id: 'ed-sin-cierre', cierre_inscripcion: null }]}
      />,
    )
    expect(screen.queryByText(/inscripción hasta/i)).not.toBeInTheDocument()
  })

  it('never renders the permanente_custom modality jargon (T9)', () => {
    render(
      <ExplorarTalleresClient
        talleres={[
          { ...baseRow, id: 'ed-2', modalidad: 'permanente_custom' as const },
        ]}
      />,
    )

    expect(screen.queryByText(/Permanente custom/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Modalidad/)).not.toBeInTheDocument()
  })

  it('shows a date-only cierre_inscripcion as that same calendar day, in words (T9)', () => {
    render(
      <ExplorarTalleresClient
        talleres={[{ ...baseRow, id: 'ed-enero', cierre_inscripcion: '2027-01-03' }]}
      />,
    )
    expect(screen.getByText('Inscripción hasta el 3 de enero de 2027')).toBeInTheDocument()
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
      />,
    )

    // The period block is conditional on both dates being present.
    expect(screen.queryByText(/Inscripciones:.*—/)).not.toBeInTheDocument()
  })

  it('renders Individual for tipo=individual', () => {
    render(
      <ExplorarTalleresClient
        talleres={[
          { ...baseRow, id: 'ed-4', tipo: 'individual' as const },
        ]}
      />,
    )

    expect(
      screen.getByText(/Edición Septiembre 2026 · Individual/),
    ).toBeInTheDocument()
  })
})

// T6 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) — when the
// edición's cupo is full, the card shows "Cupo completo" and self-enroll
// is disabled, exactly like the pre-existing "Ya inscrito" case.
describe('ExplorarTalleresClient — cupo completo (T6)', () => {
  it('disables the card and shows "Cupo completo" when cupo_completo is true', () => {
    render(
      <ExplorarTalleresClient
        talleres={[{ ...baseRow, id: 'ed-lleno', cupo_completo: true }]}
      />,
    )

    expect(screen.getByText('Cupo completo')).toBeInTheDocument()
    expect(screen.getByLabelText(/Seleccionar Matrimonio sobre la Roca/)).toBeDisabled()
  })

  it('never shows "Cupo completo" when ya_inscrito is already true', () => {
    render(
      <ExplorarTalleresClient
        talleres={[{ ...baseRow, id: 'ed-inscrito-lleno', ya_inscrito: true, cupo_completo: true }]}
      />,
    )

    expect(screen.getByText('Ya inscrito')).toBeInTheDocument()
    expect(screen.queryByText('Cupo completo')).not.toBeInTheDocument()
  })

  it('does not open the FAB when selecting a full edición is attempted', () => {
    render(
      <ExplorarTalleresClient
        talleres={[{ ...baseRow, id: 'ed-lleno-2', cupo_completo: true }]}
      />,
    )

    fireEvent.click(screen.getByLabelText(/Seleccionar Matrimonio sobre la Roca/))
    expect(screen.queryByTestId('explorar-fab')).not.toBeInTheDocument()
  })
})

describe('ExplorarTalleresClient — couple enrollment through the partner picker (P2)', () => {
  it('pareja: the FAB opens the partner picker for that edición without enrolling yet', async () => {
    render(<ExplorarTalleresClient talleres={[baseRow]} />)

    fireEvent.click(screen.getByLabelText(/Seleccionar Matrimonio sobre la Roca/))
    fireEvent.click(await screen.findByTestId('explorar-fab'))

    expect(await screen.findByTestId('selector-pareja')).toBeInTheDocument()
    expect(selectorMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ edicionId: 'ed-1', vinculoEdicion: 'matrimonio' }),
    )
    expect(inscribirseActionMock).not.toHaveBeenCalled()
    expect(screen.queryByTestId('legacy-leader-modal')).not.toBeInTheDocument()
  })

  it('pareja without vínculo: hands the picker a null vínculo so it asks the member', async () => {
    render(<ExplorarTalleresClient talleres={[{ ...baseRow, id: 'ed-abierta', link_type: null }]} />)

    fireEvent.click(screen.getByLabelText(/Seleccionar Matrimonio sobre la Roca/))
    fireEvent.click(await screen.findByTestId('explorar-fab'))

    expect(selectorMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ edicionId: 'ed-abierta', vinculoEdicion: null }),
    )
  })

  it('pareja: a finished enrollment closes the picker and confirms it', async () => {
    render(<ExplorarTalleresClient talleres={[baseRow]} />)

    fireEvent.click(screen.getByLabelText(/Seleccionar Matrimonio sobre la Roca/))
    fireEvent.click(await screen.findByTestId('explorar-fab'))
    fireEvent.click(await screen.findByText('pareja-inscrita'))

    expect(await screen.findByText('Recibimos tu inscripción.')).toBeInTheDocument()
    expect(screen.queryByTestId('selector-pareja')).not.toBeInTheDocument()
  })

  it('pareja: closing the picker keeps the selection and enrolls nothing', async () => {
    render(<ExplorarTalleresClient talleres={[baseRow]} />)

    fireEvent.click(screen.getByLabelText(/Seleccionar Matrimonio sobre la Roca/))
    fireEvent.click(await screen.findByTestId('explorar-fab'))
    fireEvent.click(await screen.findByText('cerrar-selector'))

    expect(screen.queryByTestId('selector-pareja')).not.toBeInTheDocument()
    expect(screen.getByTestId('explorar-fab')).toBeInTheDocument()
    expect(inscribirseActionMock).not.toHaveBeenCalled()
  })

  it('individual: the FAB enrolls directly with no pareja and never opens the picker', async () => {
    inscribirseActionMock.mockResolvedValue({ ok: true, inscripcionId: 'insc-2' })
    render(
      <ExplorarTalleresClient
        talleres={[{ ...baseRow, id: 'ed-ind', tipo: 'individual' as const, link_type: null }]}
      />,
    )

    fireEvent.click(screen.getByLabelText(/Seleccionar Matrimonio sobre la Roca/))
    fireEvent.click(await screen.findByTestId('explorar-fab'))

    await waitFor(() =>
      expect(inscribirseActionMock).toHaveBeenCalledWith({ edicionId: 'ed-ind', pareja: null }),
    )
    expect(await screen.findByText('Recibimos tu inscripción.')).toBeInTheDocument()
    expect(screen.queryByTestId('selector-pareja')).not.toBeInTheDocument()
  })

  it('individual: shows the action message on failure, never the raw code', async () => {
    inscribirseActionMock.mockResolvedValue({
      ok: false,
      error: 'EDICION_NO_ABIERTA',
      message: 'Las inscripciones de esta edición están cerradas.',
    })
    render(
      <ExplorarTalleresClient
        talleres={[{ ...baseRow, id: 'ed-ind', tipo: 'individual' as const, link_type: null }]}
      />,
    )

    fireEvent.click(screen.getByLabelText(/Seleccionar Matrimonio sobre la Roca/))
    fireEvent.click(await screen.findByTestId('explorar-fab'))

    expect(await screen.findByText('Las inscripciones de esta edición están cerradas.')).toBeInTheDocument()
    expect(screen.queryByText(/EDICION_NO_ABIERTA/)).not.toBeInTheDocument()
  })
})

// T9 (odd/tasks/proximo-paso.md, L21–L23) — the confirmation and the badge
// follow the real estado of the person's inscripción (an edición with
// inscripción automática approves it right away), and every text is neutral
// Spanish (tú, never voseo).
describe('ExplorarTalleresClient — estado real de la inscripción (T9)', () => {
  const individual = { ...baseRow, id: 'ed-ind', tipo: 'individual' as const, link_type: null }

  async function inscribirYRecargar(estado: 'aprobado' | 'pendiente') {
    inscribirseActionMock.mockResolvedValue({ ok: true, inscripcionId: 'insc-9' })
    const { rerender } = render(<ExplorarTalleresClient talleres={[individual]} />)
    fireEvent.click(screen.getByLabelText(/Seleccionar Matrimonio sobre la Roca/))
    fireEvent.click(await screen.findByTestId('explorar-fab'))
    await waitFor(() => expect(inscribirseActionMock).toHaveBeenCalledTimes(1))
    // The action revalidates /talleres/explorar: the page sends the rows again
    // with the new inscripción and its estado.
    rerender(
      <ExplorarTalleresClient
        talleres={[{ ...individual, ya_inscrito: true, estado_inscripcion: estado }]}
      />,
    )
  }

  it('approved right away: «¡Listo, ya estás inscrito!»', async () => {
    await inscribirYRecargar('aprobado')
    expect(await screen.findByText('¡Listo, ya estás inscrito!')).toBeInTheDocument()
    expect(screen.queryByText(/Pendiente de aprobación/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Recibimos tu inscripción/)).not.toBeInTheDocument()
  })

  it('pending: «Recibimos tu inscripción. La coordinación la confirmará.»', async () => {
    await inscribirYRecargar('pendiente')
    expect(
      await screen.findByText('Recibimos tu inscripción. La coordinación la confirmará.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('¡Listo, ya estás inscrito!')).not.toBeInTheDocument()
  })

  it('badge: «Ya inscrito» when approved, «Pendiente» when it waits for the coordinación', () => {
    render(
      <ExplorarTalleresClient
        talleres={[
          { ...baseRow, id: 'ed-a', ya_inscrito: true, estado_inscripcion: 'aprobado' as const },
          { ...baseRow, id: 'ed-p', nombre: 'Próximo Paso', ya_inscrito: true, estado_inscripcion: 'pendiente' as const },
        ]}
      />,
    )
    expect(screen.getByText('Ya inscrito')).toBeInTheDocument()
    expect(screen.getByText('Pendiente')).toBeInTheDocument()
  })

  it('renders no voseo nor «inscripto», and no modality jargon', () => {
    const { container } = render(
      <ExplorarTalleresClient
        talleres={[
          { ...baseRow, id: 'ed-x', ya_inscrito: true, modalidad: 'permanente_custom' as const },
          { ...baseRow, id: 'ed-y', nombre: 'Próximo Paso' },
        ]}
      />,
    )
    const texto = container.textContent ?? ''
    expect(texto).not.toMatch(/Tocá|inscripto|Permanente custom|Modalidad/)
  })
})

// T10 (odd/tasks/talleres-reserva-publica.md, S6) — each card says when the
// first clase is, in words, except for an edición already en curso.
describe('ExplorarTalleresClient — «Empieza el …» (T10)', () => {
  it('shows the first clase as that calendar day, in words', () => {
    render(<ExplorarTalleresClient talleres={[{ ...baseRow, primera_clase: '2026-11-26' }]} />)
    expect(screen.getByText('Empieza el 26 de noviembre de 2026')).toBeInTheDocument()
  })

  it('shows nothing when the first clase is unknown', () => {
    render(<ExplorarTalleresClient talleres={[{ ...baseRow, primera_clase: null }]} />)
    expect(screen.queryByText(/^Empieza el/)).not.toBeInTheDocument()
  })

  it('shows nothing for an edición already en curso', () => {
    render(
      <ExplorarTalleresClient talleres={[{ ...baseRow, estado: 'en_curso' as const, primera_clase: '2026-11-26' }]} />,
    )
    expect(screen.queryByText(/^Empieza el/)).not.toBeInTheDocument()
  })
})
