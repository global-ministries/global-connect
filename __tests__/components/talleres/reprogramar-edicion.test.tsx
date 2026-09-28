/**
 * @jest-environment jsdom
 *
 * T7b (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) —
 * ReprogramarEdicionDialog: two modes ("Extender la inscripción" /
 * "Mover la primera clase"), a client-side preview computed from the
 * edición's own dates + clasesPendientes (no round trip), and a submit
 * that shapes the call to `reprogramarEdicion`.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const reprogramarEdicionMock = jest.fn()

jest.mock('@/app/(auth)/talleres/[taller]/[edicion]/actions', () => ({
  reprogramarEdicion: (...args: unknown[]) => reprogramarEdicionMock(...args),
}))

import { ReprogramarEdicionDialog } from '@/components/talleres/reprogramar-edicion'

/** Same UTC-anchored formatting the component itself uses, so date assertions never depend on the test runner's local timezone. */
function fmt(dateOnly: string): string {
  const [y, m, d] = dateOnly.split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString('es', { timeZone: 'UTC' })
}

function baseProps(overrides: Partial<Parameters<typeof ReprogramarEdicionDialog>[0]> = {}) {
  return {
    tallerSlug: 'proximo-paso',
    edicionId: 'e-1',
    fechaInicio: '2026-09-01',
    fechaFin: '2026-10-27',
    cierreInscripcion: '2026-08-29',
    clasesPendientes: 4,
    primeraClaseCerrada: false,
    ...overrides,
  }
}

beforeEach(() => {
  reprogramarEdicionMock.mockReset()
})

function openDialog() {
  fireEvent.click(screen.getByRole('button', { name: /^reprogramar$/i }))
}

describe('ReprogramarEdicionDialog — trigger and dialog', () => {
  it('does not render any field before the trigger is clicked', () => {
    render(<ReprogramarEdicionDialog {...baseProps()} />)
    expect(screen.queryByLabelText(/inscripción hasta/i)).not.toBeInTheDocument()
  })

  it('opens the dialog titled "Reprogramar edición"', () => {
    render(<ReprogramarEdicionDialog {...baseProps()} />)
    openDialog()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /reprogramar edición/i })).toBeInTheDocument()
  })

  it('uses neutral Spanish copy (no voseo)', () => {
    render(<ReprogramarEdicionDialog {...baseProps()} />)
    openDialog()
    expect(screen.queryByText(/podés/i)).not.toBeInTheDocument()
  })

  it('defaults to "Extender la inscripción" with the current cierre pre-filled', () => {
    render(<ReprogramarEdicionDialog {...baseProps({ cierreInscripcion: '2026-08-29' })} />)
    openDialog()
    const radios = screen.getAllByRole('radio')
    expect(radios[0]).toBeChecked()
    expect(screen.getByLabelText(/^inscripción hasta$/i)).toHaveValue('2026-08-29')
    expect(screen.queryByLabelText(/nueva primera clase/i)).not.toBeInTheDocument()
  })
})

describe('ReprogramarEdicionDialog — mode: mover la primera clase', () => {
  it('switching to "Mover la primera clase" shows the new date field and an EMPTY optional cierre override', () => {
    render(<ReprogramarEdicionDialog {...baseProps({ cierreInscripcion: '2026-08-29' })} />)
    openDialog()
    fireEvent.click(screen.getByRole('radio', { name: /mover la primera clase/i }))
    expect(screen.getByLabelText(/nueva primera clase/i)).toBeInTheDocument()
    // Regression: the "Inscripción hasta (opcional)" field must start EMPTY
    // in move mode, not silently carry over the extend-mode's pre-filled
    // current cierre — otherwise a plain "move the start" submit would
    // wrongly pin cierre_inscripcion to its OLD value instead of letting
    // the RPC preserve the taller's own offset (COALESCE default).
    expect(screen.getByLabelText(/inscripción hasta \(opcional\)/i)).toHaveValue('')
  })

  it('disables the "Mover la primera clase" radio and the date fields when primeraClaseCerrada, with a hint', () => {
    render(<ReprogramarEdicionDialog {...baseProps({ primeraClaseCerrada: true })} />)
    openDialog()
    const moverRadio = screen.getByRole('radio', { name: /mover la primera clase/i })
    expect(moverRadio).toBeDisabled()
    expect(screen.getByText(/la primera clase ya se dictó/i)).toBeInTheDocument()
  })
})

describe('ReprogramarEdicionDialog — preview math', () => {
  it('extend mode: shows "Inscripción hasta {fecha}."', () => {
    render(<ReprogramarEdicionDialog {...baseProps({ cierreInscripcion: '2026-08-29' })} />)
    openDialog()
    fireEvent.change(screen.getByLabelText(/^inscripción hasta$/i), { target: { value: '2026-09-05' } })
    expect(screen.getByText(`Inscripción hasta ${fmt('2026-09-05')}.`)).toBeInTheDocument()
  })

  it('move mode: computes delta, moved fin, and offset-preserved cierre from the edición dates + clasesPendientes', () => {
    render(
      <ReprogramarEdicionDialog
        {...baseProps({
          fechaInicio: '2026-09-01',
          fechaFin: '2026-10-27',
          cierreInscripcion: '2026-08-29',
          clasesPendientes: 4,
        })}
      />,
    )
    openDialog()
    fireEvent.click(screen.getByRole('radio', { name: /mover la primera clase/i }))
    fireEvent.change(screen.getByLabelText(/nueva primera clase/i), { target: { value: '2026-09-08' } })
    // delta = +7 days; fin 2026-10-27 + 7 = 2026-11-03; cierre 2026-08-29 + 7 = 2026-09-05.
    const text = screen.getByText(/clases pendientes se mueven/i)
    expect(text).toHaveTextContent('Las 4 clases pendientes se mueven 7 días')
    expect(text).toHaveTextContent(`última clase ${fmt('2026-11-03')}`)
    expect(text).toHaveTextContent(`inscripción hasta ${fmt('2026-09-05')}`)
  })

  it('move mode: singular "1 día" / "clase pendiente" wording', () => {
    render(
      <ReprogramarEdicionDialog
        {...baseProps({ fechaInicio: '2026-09-01', fechaFin: '2026-09-01', cierreInscripcion: '2026-09-01', clasesPendientes: 1 })}
      />,
    )
    openDialog()
    fireEvent.click(screen.getByRole('radio', { name: /mover la primera clase/i }))
    fireEvent.change(screen.getByLabelText(/nueva primera clase/i), { target: { value: '2026-09-02' } })
    const text = screen.getByText(/clase pendiente se mueve/i)
    expect(text).toHaveTextContent('Las 1 clase pendiente se mueve 1 día')
  })

  it('move mode: an explicit "Inscripción hasta (opcional)" override replaces the offset-preserved default in the preview', () => {
    render(
      <ReprogramarEdicionDialog
        {...baseProps({ fechaInicio: '2026-09-01', fechaFin: '2026-10-27', cierreInscripcion: '2026-08-29', clasesPendientes: 4 })}
      />,
    )
    openDialog()
    fireEvent.click(screen.getByRole('radio', { name: /mover la primera clase/i }))
    fireEvent.change(screen.getByLabelText(/nueva primera clase/i), { target: { value: '2026-09-08' } })
    fireEvent.change(screen.getByLabelText(/inscripción hasta \(opcional\)/i), { target: { value: '2026-09-10' } })
    const text = screen.getByText(/clases pendientes se mueven/i)
    expect(text).toHaveTextContent(`inscripción hasta ${fmt('2026-09-10')}`)
  })

  it('shows no preview before any date is chosen', () => {
    render(<ReprogramarEdicionDialog {...baseProps({ cierreInscripcion: '' as unknown as string })} />)
    openDialog()
    // The field's own <label> also reads "Inscripción hasta" — match the
    // PREVIEW sentence specifically (it ends in a period after a date).
    expect(screen.queryByText(/^Inscripción hasta .*\.$/)).not.toBeInTheDocument()
  })
})

describe('ReprogramarEdicionDialog — submit shape', () => {
  it('extend mode: sends fechaInicio null and the chosen cierreInscripcion', async () => {
    reprogramarEdicionMock.mockResolvedValue({ ok: true, reprogramacion: {} })
    render(<ReprogramarEdicionDialog {...baseProps({ cierreInscripcion: '2026-08-29' })} />)
    openDialog()
    fireEvent.change(screen.getByLabelText(/^inscripción hasta$/i), { target: { value: '2026-09-05' } })
    fireEvent.click(screen.getByRole('button', { name: /^reprogramar$/i, hidden: false }))
    await waitFor(() =>
      expect(reprogramarEdicionMock).toHaveBeenCalledWith({
        tallerSlug: 'proximo-paso',
        edicionId: 'e-1',
        fechaInicio: null,
        cierreInscripcion: '2026-09-05',
        motivo: null,
      }),
    )
  })

  it('move mode: sends the new fechaInicio and cierreInscripcion:null when the optional override is left untouched', async () => {
    reprogramarEdicionMock.mockResolvedValue({ ok: true, reprogramacion: {} })
    render(<ReprogramarEdicionDialog {...baseProps({ cierreInscripcion: '2026-08-29' })} />)
    openDialog()
    fireEvent.click(screen.getByRole('radio', { name: /mover la primera clase/i }))
    fireEvent.change(screen.getByLabelText(/nueva primera clase/i), { target: { value: '2026-09-08' } })
    fireEvent.click(screen.getByRole('button', { name: /^reprogramar$/i, hidden: false }))
    await waitFor(() =>
      expect(reprogramarEdicionMock).toHaveBeenCalledWith({
        tallerSlug: 'proximo-paso',
        edicionId: 'e-1',
        fechaInicio: '2026-09-08',
        cierreInscripcion: null,
        motivo: null,
      }),
    )
  })

  it('move mode: sends the explicit override when the optional field is filled', async () => {
    reprogramarEdicionMock.mockResolvedValue({ ok: true, reprogramacion: {} })
    render(<ReprogramarEdicionDialog {...baseProps({ cierreInscripcion: '2026-08-29' })} />)
    openDialog()
    fireEvent.click(screen.getByRole('radio', { name: /mover la primera clase/i }))
    fireEvent.change(screen.getByLabelText(/nueva primera clase/i), { target: { value: '2026-09-08' } })
    fireEvent.change(screen.getByLabelText(/inscripción hasta \(opcional\)/i), { target: { value: '2026-09-10' } })
    fireEvent.click(screen.getByRole('button', { name: /^reprogramar$/i, hidden: false }))
    await waitFor(() =>
      expect(reprogramarEdicionMock).toHaveBeenCalledWith({
        tallerSlug: 'proximo-paso',
        edicionId: 'e-1',
        fechaInicio: '2026-09-08',
        cierreInscripcion: '2026-09-10',
        motivo: null,
      }),
    )
  })

  it('sends a trimmed motivo, or null when blank', async () => {
    reprogramarEdicionMock.mockResolvedValue({ ok: true, reprogramacion: {} })
    render(<ReprogramarEdicionDialog {...baseProps({ cierreInscripcion: '2026-08-29' })} />)
    openDialog()
    fireEvent.change(screen.getByLabelText(/^inscripción hasta$/i), { target: { value: '2026-09-05' } })
    fireEvent.change(screen.getByLabelText(/motivo/i), { target: { value: '  Ajuste de agenda  ' } })
    fireEvent.click(screen.getByRole('button', { name: /^reprogramar$/i, hidden: false }))
    await waitFor(() =>
      expect(reprogramarEdicionMock).toHaveBeenCalledWith(
        expect.objectContaining({ motivo: 'Ajuste de agenda' }),
      ),
    )
  })

  it('closes the dialog on success', async () => {
    reprogramarEdicionMock.mockResolvedValue({ ok: true, reprogramacion: {} })
    render(<ReprogramarEdicionDialog {...baseProps({ cierreInscripcion: '2026-08-29' })} />)
    openDialog()
    fireEvent.change(screen.getByLabelText(/^inscripción hasta$/i), { target: { value: '2026-09-05' } })
    fireEvent.click(screen.getByRole('button', { name: /^reprogramar$/i, hidden: false }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('shows the mapped error message and keeps the dialog open when the action fails', async () => {
    reprogramarEdicionMock.mockResolvedValue({
      ok: false,
      error: 'conflict',
      message: 'La primera clase de esta edición ya se dictó; no se puede mover el inicio.',
    })
    render(<ReprogramarEdicionDialog {...baseProps({ cierreInscripcion: '2026-08-29' })} />)
    openDialog()
    fireEvent.change(screen.getByLabelText(/^inscripción hasta$/i), { target: { value: '2026-09-05' } })
    fireEvent.click(screen.getByRole('button', { name: /^reprogramar$/i, hidden: false }))
    expect(
      await screen.findByText('La primera clase de esta edición ya se dictó; no se puede mover el inicio.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
