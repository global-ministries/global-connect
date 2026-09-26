/**
 * @jest-environment jsdom
 *
 * T3 correction (odd/tasks/talleres-configuracion-del-taller.md) — the
 * cabecera's inline "editar descripción" control, same pattern as
 * EditarNombreTaller: pencil/"Editar" toggle, 44px touch targets, only
 * rendered by the page when permisos.editarTaller is granted.
 */

import { act, fireEvent, render, screen } from '@testing-library/react'

const updateTallerDescripcionMock = jest.fn()
const refreshMock = jest.fn()

jest.mock('@/app/(auth)/talleres/[taller]/actions', () => ({
  updateTallerDescripcion: (...args: unknown[]) => updateTallerDescripcionMock(...args),
}))

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}))

import { EditarDescripcionTaller } from '@/components/talleres/editar-descripcion-taller'

beforeEach(() => {
  updateTallerDescripcionMock.mockReset()
  refreshMock.mockReset()
})

describe('EditarDescripcionTaller', () => {
  it('shows the current descripcion and an Editar action', () => {
    render(<EditarDescripcionTaller tallerId="t-1" tallerSlug="proximo-paso" descripcion="Un taller de ejemplo." />)
    expect(screen.getByText('Un taller de ejemplo.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /editar descripción/i })).toBeInTheDocument()
  })

  it('shows a placeholder and an Agregar action when there is no descripcion yet', () => {
    render(<EditarDescripcionTaller tallerId="t-1" tallerSlug="proximo-paso" descripcion={null} />)
    expect(screen.getByText(/sin descripción/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /editar descripción/i })).toBeInTheDocument()
  })

  it('opens a textarea pre-filled with the current descripcion on Editar', () => {
    render(<EditarDescripcionTaller tallerId="t-1" tallerSlug="proximo-paso" descripcion="Un taller de ejemplo." />)
    fireEvent.click(screen.getByRole('button', { name: /editar descripción/i }))
    expect(screen.getByRole('textbox')).toHaveValue('Un taller de ejemplo.')
    expect(screen.getByRole('button', { name: /guardar descripción/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cancelar/i })).toBeInTheDocument()
  })

  it('cancelling discards the edit without calling the action', () => {
    render(<EditarDescripcionTaller tallerId="t-1" tallerSlug="proximo-paso" descripcion="Un taller de ejemplo." />)
    fireEvent.click(screen.getByRole('button', { name: /editar descripción/i }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Otra cosa' } })
    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }))
    expect(screen.getByText('Un taller de ejemplo.')).toBeInTheDocument()
    expect(updateTallerDescripcionMock).not.toHaveBeenCalled()
  })

  it('saves the descripcion and refreshes on success', async () => {
    updateTallerDescripcionMock.mockResolvedValue({ ok: true, descripcion: 'Descripción nueva.' })
    render(<EditarDescripcionTaller tallerId="t-1" tallerSlug="proximo-paso" descripcion="Un taller de ejemplo." />)
    fireEvent.click(screen.getByRole('button', { name: /editar descripción/i }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Descripción nueva.' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /guardar descripción/i }))
    })

    expect(screen.getByText('Descripción nueva.')).toBeInTheDocument()
    expect(updateTallerDescripcionMock).toHaveBeenCalledWith({
      tallerId: 't-1',
      tallerSlug: 'proximo-paso',
      descripcion: 'Descripción nueva.',
    })
    expect(refreshMock).toHaveBeenCalledTimes(1)
  })

  it('shows the error message and stays in edit mode on failure', async () => {
    updateTallerDescripcionMock.mockResolvedValue({
      ok: false,
      error: 'forbidden',
      message: 'No tienes permisos para hacer este cambio.',
    })
    render(<EditarDescripcionTaller tallerId="t-1" tallerSlug="proximo-paso" descripcion="Un taller de ejemplo." />)
    fireEvent.click(screen.getByRole('button', { name: /editar descripción/i }))
    fireEvent.click(screen.getByRole('button', { name: /guardar descripción/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No tienes permisos para hacer este cambio.')
    expect(screen.getByRole('textbox')).toBeInTheDocument()
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('gives the edit action a 44px touch target', () => {
    render(<EditarDescripcionTaller tallerId="t-1" tallerSlug="proximo-paso" descripcion="Un taller de ejemplo." />)
    expect(screen.getByRole('button', { name: /editar descripción/i })).toHaveClass('min-h-[44px]')
  })
})
