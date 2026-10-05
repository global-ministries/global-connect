/**
 * @jest-environment jsdom
 *
 * The /activar form: cédula first, then a password, with the spouse
 * confirmation only for a matrimonio invitation.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const verificarMock = jest.fn()
const activarMock = jest.fn()
const replaceMock = jest.fn()

jest.mock('@/app/activar/actions', () => ({
  verificarCedulaActivacion: (...a: unknown[]) => verificarMock(...a),
  activarCuentaAction: (...a: unknown[]) => activarMock(...a),
}))
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace: replaceMock }) }))

import { ActivarCuentaForm } from '@/app/activar/activar-form'

beforeEach(() => {
  verificarMock.mockReset().mockResolvedValue({ ok: true })
  activarMock.mockReset().mockResolvedValue({ ok: true, destino: '/talleres/mi-recorrido' })
  replaceMock.mockReset()
})

async function pasarCedula() {
  fireEvent.change(screen.getByLabelText(/tu cédula/i), { target: { value: '12345678' } })
  fireEvent.click(screen.getByRole('button', { name: /continuar/i }))
  await screen.findByLabelText(/^contraseña$/i)
}

describe('ActivarCuentaForm', () => {
  it('shows the taller and the invitee name', () => {
    render(<ActivarCuentaForm tallerNombre="Novios" nombreInvitado="Ana" nombreInvitante={null} vinculo={null} />)
    expect(screen.getByText(/Ana/)).toBeInTheDocument()
    expect(screen.getByText(/Novios/)).toBeInTheDocument()
  })

  it('shows the neutral cédula error and stays on the first step', async () => {
    verificarMock.mockResolvedValue({ ok: false, mensaje: 'La cédula no coincide con la de la invitación.' })
    render(<ActivarCuentaForm tallerNombre="Novios" nombreInvitado="Ana" nombreInvitante={null} vinculo={null} />)
    fireEvent.change(screen.getByLabelText(/tu cédula/i), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('La cédula no coincide')
    expect(screen.queryByLabelText(/^contraseña$/i)).not.toBeInTheDocument()
  })

  it('requires 8+ characters and activates with the spouse confirmation for matrimonio', async () => {
    render(<ActivarCuentaForm tallerNombre="Matrimonios" nombreInvitado="Ana" nombreInvitante="Luis" vinculo="matrimonio" />)
    await pasarCedula()

    fireEvent.change(screen.getByLabelText(/^contraseña$/i), { target: { value: 'corta' } })
    expect(screen.getByRole('button', { name: /activar mi cuenta/i })).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/^contraseña$/i), { target: { value: 'secreta123' } })
    fireEvent.click(screen.getByLabelText('Confirmo que Luis es mi cónyuge'))
    fireEvent.click(screen.getByRole('button', { name: /activar mi cuenta/i }))

    await waitFor(() =>
      expect(activarMock).toHaveBeenCalledWith({ cedula: '12345678', password: 'secreta123', confirmaConyuge: true }),
    )
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/talleres/mi-recorrido'))
  })

  it('asks for the spouse confirmation for matrimonio even without the inviter name', async () => {
    render(<ActivarCuentaForm tallerNombre="M" nombreInvitado="Ana" nombreInvitante={null} vinculo="matrimonio" />)
    await pasarCedula()
    expect(screen.getByLabelText(/es mi cónyuge/i)).toBeInTheDocument()
  })

  it('has no spouse confirmation for novios', async () => {
    render(<ActivarCuentaForm tallerNombre="Novios" nombreInvitado="Ana" nombreInvitante="Luis" vinculo="novios" />)
    await pasarCedula()
    expect(screen.queryByLabelText(/es mi cónyuge/i)).not.toBeInTheDocument()
  })
})
