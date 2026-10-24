/**
 * @jest-environment jsdom
 *
 * T4 (odd/tasks/uno-a-uno.md) — the reschedule and cancel dialogs.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const reprogramarMock = jest.fn()
const cancelarMock = jest.fn()

jest.mock('@/app/(auth)/mis-uno-a-uno/actions', () => ({
  reprogramarUnoAUno: (...args: unknown[]) => reprogramarMock(...args),
  cancelarUnoAUno: (...args: unknown[]) => cancelarMock(...args),
}))

import { CancelarUnoAUnoDialog } from '@/components/uno-a-uno/cancelar-uno-a-uno'
import { ReprogramarUnoAUnoDialog } from '@/components/uno-a-uno/reprogramar-uno-a-uno'

beforeEach(() => {
  reprogramarMock.mockReset()
  cancelarMock.mockReset()
})

describe('ReprogramarUnoAUnoDialog', () => {
  it('starts from the current Caracas date and time and submits the new ones', async () => {
    reprogramarMock.mockResolvedValue({ ok: true })
    render(<ReprogramarUnoAUnoDialog unoAUnoId="u-1" fechaHora="2026-10-21T01:15:00Z" />)
    fireEvent.click(screen.getByRole('button', { name: /^reprogramar$/i }))
    expect(screen.getByLabelText('Fecha')).toHaveValue('2026-10-20')
    expect(screen.getByLabelText('Hora')).toHaveValue('21:15')
    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '2026-10-22' } })
    fireEvent.click(screen.getByRole('button', { name: /guardar fecha/i }))
    await waitFor(() =>
      expect(reprogramarMock).toHaveBeenCalledWith({ id: 'u-1', fecha: '2026-10-22', hora: '21:15' }),
    )
  })

  it('shows the action error inline', async () => {
    reprogramarMock.mockResolvedValue({ ok: false, error: 'invalid-input', message: 'La fecha del 1 a 1 debe ser futura.' })
    render(<ReprogramarUnoAUnoDialog unoAUnoId="u-1" fechaHora="2026-10-21T01:15:00Z" />)
    fireEvent.click(screen.getByRole('button', { name: /^reprogramar$/i }))
    fireEvent.click(screen.getByRole('button', { name: /guardar fecha/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('La fecha del 1 a 1 debe ser futura.')
  })
})

describe('CancelarUnoAUnoDialog', () => {
  it('submits the optional motivo', async () => {
    cancelarMock.mockResolvedValue({ ok: true })
    render(<CancelarUnoAUnoDialog unoAUnoId="u-1" conQuien="Luis Gómez" />)
    fireEvent.click(screen.getByRole('button', { name: /^cancelar 1 a 1$/i }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Luis Gómez')
    fireEvent.change(screen.getByLabelText('Motivo (opcional)'), { target: { value: 'Viaje' } })
    fireEvent.click(screen.getByRole('button', { name: /sí, cancelar/i }))
    await waitFor(() => expect(cancelarMock).toHaveBeenCalledWith({ id: 'u-1', motivo: 'Viaje' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('shows the action error inline', async () => {
    cancelarMock.mockResolvedValue({ ok: false, error: 'forbidden', message: 'Solo quien lidera este 1 a 1 puede cambiarlo.' })
    render(<CancelarUnoAUnoDialog unoAUnoId="u-1" conQuien="Luis Gómez" />)
    fireEvent.click(screen.getByRole('button', { name: /^cancelar 1 a 1$/i }))
    fireEvent.click(screen.getByRole('button', { name: /sí, cancelar/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Solo quien lidera este 1 a 1 puede cambiarlo.')
  })
})
