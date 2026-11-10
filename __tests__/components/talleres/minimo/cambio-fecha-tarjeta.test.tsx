/**
 * @jest-environment jsdom
 *
 * T8a (odd/tasks/talleres-reserva-publica.md, S9 S15) — the member's «Tu
 * taller cambió de fecha» card: «Mantener mi lugar» answers at once, «Ya no
 * puedo» asks once more (it leaves the edición) and can carry a reason.
 */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

const responderMock = jest.fn()

jest.mock('@/lib/platform/talleres/minimo-suspension-actions', () => ({
  responderCambioFecha: (...a: unknown[]) => responderMock(...a),
}))

import { CambioFechaTarjeta } from '@/components/talleres/minimo/cambio-fecha-tarjeta'
import type { CambioDeFecha } from '@/lib/platform/talleres/minimo-suspension'

const CAMBIO: CambioDeFecha = {
  inscripcionId: 'i-1',
  tallerNombre: 'Parejas',
  edicionNombre: 'Edición ene 2027',
  fechaInicio: '2027-02-06',
  fechaAnterior: '2027-01-16',
  lugar: 'Salón 1 · Global Barquisimeto',
  mensaje: 'Queremos el grupo completo.',
  limite: '2027-02-02',
}

beforeEach(() => responderMock.mockReset())

describe('CambioFechaTarjeta', () => {
  it('shows the previous and new start, where, the message and the deadline', () => {
    render(<CambioFechaTarjeta cambio={CAMBIO} />)
    expect(screen.getByRole('heading', { name: 'Tu taller cambió de fecha' })).toBeInTheDocument()
    expect(screen.getByText('sábado 16 de enero')).toBeInTheDocument()
    expect(screen.getByText('sábado 6 de febrero')).toBeInTheDocument()
    expect(screen.getByText('Salón 1 · Global Barquisimeto')).toBeInTheDocument()
    expect(screen.getByText('Queremos el grupo completo.')).toBeInTheDocument()
    expect(screen.getByText('Confirma antes del martes 2 de febrero para mantener tu lugar.')).toBeInTheDocument()
  })

  it('«Mantener mi lugar» answers mantener and shows the result', async () => {
    responderMock.mockResolvedValue({ ok: true, confirmacion: 'confirmada' })
    render(<CambioFechaTarjeta cambio={CAMBIO} />)
    fireEvent.click(screen.getByRole('button', { name: 'Mantener mi lugar' }))
    await waitFor(() => expect(responderMock).toHaveBeenCalledWith({ inscripcionId: 'i-1', respuesta: 'mantener', motivo: null }))
    expect(await screen.findByRole('heading', { name: 'Listo, mantienes tu lugar' })).toBeInTheDocument()
  })

  it('«Ya no puedo» asks first; «Volver» answers nothing', () => {
    render(<CambioFechaTarjeta cambio={CAMBIO} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ya no puedo' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: '¿Seguro que ya no puedes?' })).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Volver' }))
    expect(responderMock).not.toHaveBeenCalled()
  })

  it('confirming «Ya no puedo» sends no_puedo with the reason', async () => {
    responderMock.mockResolvedValue({ ok: true, confirmacion: 'no_puede' })
    render(<CambioFechaTarjeta cambio={CAMBIO} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ya no puedo' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText(/por qué/i), { target: { value: ' Viajo ese mes ' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sí, ya no puedo' }))
    await waitFor(() => expect(responderMock).toHaveBeenCalledWith({ inscripcionId: 'i-1', respuesta: 'no_puedo', motivo: 'Viajo ese mes' }))
    expect(await screen.findByRole('heading', { name: 'Listo, saliste de esta edición' })).toBeInTheDocument()
  })

  it('shows why an answer was refused', async () => {
    responderMock.mockResolvedValue({ ok: false, error: 'conflict', message: 'El plazo para confirmar ya venció.' })
    render(<CambioFechaTarjeta cambio={CAMBIO} />)
    fireEvent.click(screen.getByRole('button', { name: 'Mantener mi lugar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('El plazo para confirmar ya venció.')
  })
})
