/**
 * @jest-environment jsdom
 *
 * T8b (odd/tasks/talleres-reserva-publica.md, S17) — «Recuperar clases
 * aparte» in Configuración (artboard 14): a switch that reads and saves
 * talleres.permite_recuperar_clases; a read-only viewer only sees Sí / No.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const leerMock = jest.fn()
const guardarMock = jest.fn()
const successMock = jest.fn()

jest.mock('@/lib/platform/talleres/recuperar-clase-actions', () => ({
  leerPermiteRecuperar: (...a: unknown[]) => leerMock(...a),
  guardarPermiteRecuperar: (...a: unknown[]) => guardarMock(...a),
}))
jest.mock('@/hooks/use-notificaciones', () => ({
  useNotificaciones: () => ({ success: successMock, error: jest.fn(), info: jest.fn() }),
}))

import { RecuperarClasesCampo } from '@/components/talleres/recuperar/recuperar-clases-campo'

beforeEach(() => {
  leerMock.mockReset()
  guardarMock.mockReset()
  successMock.mockReset()
})

describe('RecuperarClasesCampo', () => {
  it('shows the saved value as a switch with the explanation', async () => {
    leerMock.mockResolvedValue({ ok: true, permite: true })
    render(<RecuperarClasesCampo tallerId="t-1" tallerSlug="mdh" puedeEditar />)
    const sw = await screen.findByRole('switch', { name: 'Recuperar clases aparte' })
    await waitFor(() => expect(sw).toHaveAttribute('aria-checked', 'true'))
    expect(sw).toBeEnabled()
    expect(leerMock).toHaveBeenCalledWith('t-1')
    expect(screen.getByText(/cuenta como asistida para el certificado/)).toBeInTheDocument()
  })

  it('turning it off saves false and says so; turning it on again saves true', async () => {
    leerMock.mockResolvedValue({ ok: true, permite: true })
    guardarMock.mockResolvedValue({ ok: true })
    render(<RecuperarClasesCampo tallerId="t-1" tallerSlug="mdh" puedeEditar />)
    const sw = await screen.findByRole('switch', { name: 'Recuperar clases aparte' })
    await waitFor(() => expect(sw).toHaveAttribute('aria-checked', 'true'))

    fireEvent.click(sw)
    await waitFor(() => expect(guardarMock).toHaveBeenCalledWith({ tallerId: 't-1', tallerSlug: 'mdh', permite: false }))
    await waitFor(() => expect(sw).toHaveAttribute('aria-checked', 'false'))
    expect(successMock).toHaveBeenCalledWith('Ya no se pueden recuperar clases aparte en este taller.')

    fireEvent.click(sw)
    await waitFor(() => expect(guardarMock).toHaveBeenLastCalledWith({ tallerId: 't-1', tallerSlug: 'mdh', permite: true }))
    await waitFor(() => expect(successMock).toHaveBeenLastCalledWith('Quien falte puede recuperar la clase aparte.'))
  })

  it('a refused save keeps the old value and shows the message', async () => {
    leerMock.mockResolvedValue({ ok: true, permite: true })
    guardarMock.mockResolvedValue({ ok: false, error: 'forbidden', message: 'No tienes permisos para hacer este cambio.' })
    render(<RecuperarClasesCampo tallerId="t-1" tallerSlug="mdh" puedeEditar />)
    const sw = await screen.findByRole('switch', { name: 'Recuperar clases aparte' })
    await waitFor(() => expect(sw).toHaveAttribute('aria-checked', 'true'))
    fireEvent.click(sw)
    expect(await screen.findByRole('alert')).toHaveTextContent('No tienes permisos para hacer este cambio.')
    expect(sw).toHaveAttribute('aria-checked', 'true')
  })

  it('read-only viewer sees Sí / No and no switch', async () => {
    leerMock.mockResolvedValue({ ok: true, permite: false })
    render(<RecuperarClasesCampo tallerId="t-1" tallerSlug="mdh" puedeEditar={false} />)
    expect(await screen.findByText('No')).toBeInTheDocument()
    expect(screen.getByText('Recuperar clases aparte')).toBeInTheDocument()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  })

  it('a failed read disables the switch and says so', async () => {
    leerMock.mockResolvedValue({ ok: false, error: 'internal', message: 'x' })
    render(<RecuperarClasesCampo tallerId="t-1" tallerSlug="mdh" puedeEditar />)
    expect(await screen.findByText(/No se pudo leer si el taller permite recuperar clases/)).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Recuperar clases aparte' })).toBeDisabled()
  })
})
