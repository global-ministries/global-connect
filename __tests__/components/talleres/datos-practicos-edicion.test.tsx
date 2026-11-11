/**
 * @jest-environment jsdom
 *
 * T10 (odd/tasks/talleres-reserva-publica.md, S6; L30) — «Lugar e
 * indicaciones» on the edición page: the dialog opens with the current
 * values, saves through guardarDatosPracticosEdicion and shows its message
 * when it fails.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const guardarMock = jest.fn()

jest.mock('@/app/(auth)/talleres/[taller]/[edicion]/actions', () => ({
  guardarDatosPracticosEdicion: (...args: unknown[]) => guardarMock(...args),
}))

import { EditarDatosPracticosEdicion } from '@/components/talleres/datos-practicos-edicion'

function abrir() {
  fireEvent.click(screen.getByRole('button', { name: 'Lugar e indicaciones' }))
}

beforeEach(() => {
  guardarMock.mockReset()
})

describe('EditarDatosPracticosEdicion', () => {
  it('shows only the button until it is clicked', () => {
    render(<EditarDatosPracticosEdicion tallerSlug="mujer-de-hoy" edicionId="e-1" lugar={null} indicaciones={null} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Lugar')).not.toBeInTheDocument()
  })

  it('opens with the current values, the hint and the counter', () => {
    render(
      <EditarDatosPracticosEdicion
        tallerSlug="mujer-de-hoy"
        edicionId="e-1"
        lugar="Salón 2"
        indicaciones="Trae tu Biblia"
      />,
    )
    abrir()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByLabelText('Lugar')).toHaveValue('Salón 2')
    expect(screen.getByLabelText('Lugar')).toHaveAttribute('maxLength', '200')
    const indicaciones = screen.getByLabelText('Indicaciones para los participantes')
    expect(indicaciones).toHaveValue('Trae tu Biblia')
    expect(indicaciones).toHaveAttribute('maxLength', '500')
    expect(screen.getByText(/Qué traer, por dónde entrar, estacionamiento…/)).toBeInTheDocument()
    expect(screen.getByText('14/500')).toBeInTheDocument()
  })

  it('saves what was typed and closes', async () => {
    guardarMock.mockResolvedValue({ ok: true, lugar: 'Templo principal', indicaciones: 'Entra por la puerta lateral' })
    render(<EditarDatosPracticosEdicion tallerSlug="mujer-de-hoy" edicionId="e-1" lugar={null} indicaciones={null} />)
    abrir()
    fireEvent.change(screen.getByLabelText('Lugar'), { target: { value: 'Templo principal' } })
    fireEvent.change(screen.getByLabelText('Indicaciones para los participantes'), {
      target: { value: 'Entra por la puerta lateral' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() =>
      expect(guardarMock).toHaveBeenCalledWith({
        tallerSlug: 'mujer-de-hoy',
        edicionId: 'e-1',
        lugar: 'Templo principal',
        indicaciones: 'Entra por la puerta lateral',
      }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('keeps the dialog open with the message when saving fails', async () => {
    guardarMock.mockResolvedValue({ ok: false, error: 'forbidden', message: 'No tienes permisos para esta acción.' })
    render(<EditarDatosPracticosEdicion tallerSlug="mujer-de-hoy" edicionId="e-1" lugar="Salón 2" indicaciones={null} />)
    abrir()
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No tienes permisos para esta acción.')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('reopens with the saved values, not the abandoned edit', () => {
    render(<EditarDatosPracticosEdicion tallerSlug="mujer-de-hoy" edicionId="e-1" lugar="Salón 2" indicaciones={null} />)
    abrir()
    fireEvent.change(screen.getByLabelText('Lugar'), { target: { value: 'Otro' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    abrir()
    expect(screen.getByLabelText('Lugar')).toHaveValue('Salón 2')
  })
})
