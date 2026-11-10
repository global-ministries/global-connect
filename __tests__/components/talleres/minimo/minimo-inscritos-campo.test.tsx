/**
 * @jest-environment jsdom
 *
 * T8a (odd/tasks/talleres-reserva-publica.md, S9 S16) — «Mínimo de inscritos
 * para abrir» in Configuración: reads its value, saves it (empty = sin
 * mínimo), shows the S16 note, and a read-only viewer only sees the value.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const leerMock = jest.fn()
const guardarMock = jest.fn()
const successMock = jest.fn()

jest.mock('@/lib/platform/talleres/minimo-suspension-actions', () => ({
  leerMinimoInscritos: (...a: unknown[]) => leerMock(...a),
  guardarMinimoInscritos: (...a: unknown[]) => guardarMock(...a),
}))
jest.mock('@/hooks/use-notificaciones', () => ({
  useNotificaciones: () => ({ success: successMock, error: jest.fn(), info: jest.fn() }),
}))

import { MinimoInscritosCampo } from '@/components/talleres/minimo/minimo-inscritos-campo'

beforeEach(() => {
  leerMock.mockReset()
  guardarMock.mockReset()
  successMock.mockReset()
})

describe('MinimoInscritosCampo', () => {
  it('loads the saved minimum and shows the S16 note', async () => {
    leerMock.mockResolvedValue({ ok: true, minimo: 10 })
    render(<MinimoInscritosCampo tallerId="t-1" tallerSlug="dh" tipo="individual" puedeEditar />)
    const campo = await screen.findByLabelText('Mínimo de inscritos para abrir (personas)')
    await waitFor(() => expect(campo).toHaveValue(10))
    expect(leerMock).toHaveBeenCalledWith('t-1')
    expect(screen.getByText(/Cuentan solo las inscripciones aprobadas/)).toHaveTextContent(
      'Abrir por debajo del mínimo: solo la dirección de Conexión y el coordinador del taller.',
    )
    expect(screen.getByRole('button', { name: 'Guardar mínimo' })).toBeDisabled()
  })

  it('saves a new value, and empty clears it', async () => {
    leerMock.mockResolvedValue({ ok: true, minimo: 10 })
    guardarMock.mockResolvedValue({ ok: true })
    render(<MinimoInscritosCampo tallerId="t-1" tallerSlug="dh" tipo="pareja" puedeEditar />)
    const campo = await screen.findByLabelText('Mínimo de inscritos para abrir (parejas)')
    await waitFor(() => expect(campo).toHaveValue(10))

    fireEvent.change(campo, { target: { value: '6' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar mínimo' }))
    await waitFor(() => expect(guardarMock).toHaveBeenCalledWith({ tallerId: 't-1', tallerSlug: 'dh', minimo: 6 }))
    await waitFor(() => expect(successMock).toHaveBeenCalledWith('Mínimo para abrir: 6 parejas.'))

    fireEvent.change(campo, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar mínimo' }))
    await waitFor(() => expect(guardarMock).toHaveBeenLastCalledWith({ tallerId: 't-1', tallerSlug: 'dh', minimo: null }))
  })

  it('shows the server refusal', async () => {
    leerMock.mockResolvedValue({ ok: true, minimo: null })
    guardarMock.mockResolvedValue({ ok: false, error: 'invalid-input', message: 'El mínimo de inscritos debe ser un entero entre 1 y 500, o vacío para no tener mínimo.' })
    render(<MinimoInscritosCampo tallerId="t-1" tallerSlug="dh" tipo="individual" puedeEditar />)
    const campo = await screen.findByLabelText(/mínimo de inscritos/i)
    await waitFor(() => expect(campo).toBeEnabled())
    fireEvent.change(campo, { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar mínimo' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/entre 1 y 500/)
  })

  it('a read-only viewer sees the value, no control', async () => {
    leerMock.mockResolvedValue({ ok: true, minimo: null })
    render(<MinimoInscritosCampo tallerId="t-1" tallerSlug="dh" tipo="individual" puedeEditar={false} />)
    expect(await screen.findByText('Sin mínimo')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
  })
})
