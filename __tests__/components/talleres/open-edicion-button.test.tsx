/**
 * @jest-environment jsdom
 *
 * PR36 — Tests for the OpenEdicionButton client component.
 *
 * T4 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) —
 * CloseEdicionButton is GONE (its suite removed): `cerrado`/`en_curso` are
 * now derived from the edición's own dates, never a manual transition.
 * CancelarEdicionButton (borrador|abierto → cancelado) is its replacement,
 * covered below with real DOM interaction (jsdom, not renderToStaticMarkup
 * — it needs a real Dialog open/confirm flow).
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const openActionMock = jest.fn()
const cancelarEdicionMock = jest.fn()

jest.mock('@/app/(auth)/admin/talleres/edicion/[id]/actions', () => ({
  openExistingEdicionAction: (id: string) => openActionMock(id),
}))

jest.mock('@/app/(auth)/talleres/[taller]/[edicion]/actions', () => ({
  cancelarEdicion: (...args: unknown[]) => cancelarEdicionMock(...args),
}))

import {
  CancelarEdicionButton,
  OpenEdicionButton,
} from '@/components/talleres/open-edicion-button'

beforeEach(() => {
  openActionMock.mockReset()
  cancelarEdicionMock.mockReset()
})

describe('OpenEdicionButton', () => {
  it('renders the open CTA', () => {
    render(<OpenEdicionButton edicionId="e-1" />)
    expect(screen.getByRole('button', { name: /abrir esta edición/i })).toBeInTheDocument()
  })

  it('does NOT render error/status text on first render', () => {
    render(<OpenEdicionButton edicionId="e-1" />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('calls openExistingEdicionAction with the edicionId on click, and shows the success status', async () => {
    openActionMock.mockResolvedValue({
      ok: true,
      message: 'Edición abierta. Su estado ahora se calcula a partir de las fechas de la edición.',
    })
    render(<OpenEdicionButton edicionId="e-1" />)
    fireEvent.click(screen.getByRole('button', { name: /abrir esta edición/i }))
    expect(openActionMock).toHaveBeenCalledWith('e-1')
    expect(await screen.findByRole('status')).toHaveTextContent(/su estado ahora se calcula/i)
  })

  it('shows an alert with the error message when the action fails', async () => {
    openActionMock.mockResolvedValue({ ok: false, error: 'FORBIDDEN', message: 'No autorizado.' })
    render(<OpenEdicionButton edicionId="e-1" />)
    fireEvent.click(screen.getByRole('button', { name: /abrir esta edición/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No autorizado.')
  })

  it('never renders a hardcoded red/emerald/amber palette class', () => {
    const { container } = render(<OpenEdicionButton edicionId="e-1" />)
    expect(container.innerHTML).not.toMatch(/bg-\[var\(--brand-primary\)\]/)
    expect(container.innerHTML).not.toMatch(/(red|emerald|amber)-\d/)
  })
})

describe('CancelarEdicionButton — trigger and confirm dialog', () => {
  it('renders the trigger, not the confirm dialog, on first render', () => {
    render(<CancelarEdicionButton tallerSlug="proximo-paso" edicionId="e-1" inscritos={0} />)
    expect(screen.getByRole('button', { name: /cancelar esta edición/i })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens a confirm dialog on click, with no inscritos warning when there are none', () => {
    render(<CancelarEdicionButton tallerSlug="proximo-paso" edicionId="e-1" inscritos={0} />)
    fireEvent.click(screen.getByRole('button', { name: /cancelar esta edición/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.queryByText(/inscrit/i)).not.toBeInTheDocument()
  })

  it('warns with the exact inscritos count in the confirm dialog, without blocking the action', () => {
    render(<CancelarEdicionButton tallerSlug="proximo-paso" edicionId="e-1" inscritos={3} />)
    fireEvent.click(screen.getByRole('button', { name: /cancelar esta edición/i }))
    expect(screen.getByText(/tiene 3 inscritos/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /confirmar cancelación/i })).not.toBeDisabled()
  })

  it('uses singular "inscrito" for exactly one', () => {
    render(<CancelarEdicionButton tallerSlug="proximo-paso" edicionId="e-1" inscritos={1} />)
    fireEvent.click(screen.getByRole('button', { name: /cancelar esta edición/i }))
    expect(screen.getByText(/tiene 1 inscrito\b/i)).toBeInTheDocument()
  })

  it('calls cancelarEdicion with tallerSlug/edicionId on confirm, and closes the dialog on success', async () => {
    cancelarEdicionMock.mockResolvedValue({ ok: true })
    render(<CancelarEdicionButton tallerSlug="proximo-paso" edicionId="e-1" inscritos={0} />)
    fireEvent.click(screen.getByRole('button', { name: /cancelar esta edición/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirmar cancelación/i }))
    await waitFor(() =>
      expect(cancelarEdicionMock).toHaveBeenCalledWith({ tallerSlug: 'proximo-paso', edicionId: 'e-1' }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('closes the dialog without confirming on "Volver"', () => {
    render(<CancelarEdicionButton tallerSlug="proximo-paso" edicionId="e-1" inscritos={0} />)
    fireEvent.click(screen.getByRole('button', { name: /cancelar esta edición/i }))
    fireEvent.click(screen.getByRole('button', { name: /volver/i }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(cancelarEdicionMock).not.toHaveBeenCalled()
  })

  it('shows an alert with the error message and keeps the dialog reachable when the action fails', async () => {
    cancelarEdicionMock.mockResolvedValue({ ok: false, error: 'forbidden', message: 'No tienes permisos.' })
    render(<CancelarEdicionButton tallerSlug="proximo-paso" edicionId="e-1" inscritos={0} />)
    fireEvent.click(screen.getByRole('button', { name: /cancelar esta edición/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirmar cancelación/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No tienes permisos.')
  })
})
