/**
 * @jest-environment jsdom
 *
 * The manual Activar / Desactivar of the seasons list stays (other workflows
 * may use it), but asks first and says that publishing from the planner is
 * the way to open a season (T9a of odd/tasks/planner-gdv.md; S12, S19).
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

const refresh = jest.fn()
const success = jest.fn()
const error = jest.fn()

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: jest.fn() }) }))
jest.mock('@/hooks/use-notificaciones', () => ({ useNotificaciones: () => ({ success, error, info: jest.fn() }) }))

import TemporadasListClient from '@/components/temporadas/TemporadasList.client'

const TEMPORADAS = [
  { id: '11111111-1111-1111-1111-111111111111', nombre: '2026-II', fecha_inicio: '2026-10-12', fecha_fin: '2027-10-10', activa: false },
]

beforeEach(() => {
  refresh.mockReset()
  success.mockReset()
  error.mockReset()
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ count: 1 }) })) as unknown as typeof fetch
})

function seleccionar() {
  render(<TemporadasListClient temporadas={TEMPORADAS} userRoles={['admin']} />)
  fireEvent.click(screen.getAllByRole('checkbox', { name: 'Seleccionar temporada 2026-II' })[0])
}

describe('TemporadasListClient — manual activation', () => {
  it('asks before activating, explains the planner and does nothing on Cancelar', () => {
    seleccionar()
    fireEvent.click(screen.getByRole('button', { name: 'Activar' }))

    const dialogo = screen.getByRole('alertdialog', { name: '¿Activar 1 temporada a mano?' })
    expect(dialogo).toHaveTextContent('Activar a mano no cierra la temporada anterior de su cohorte ni activa sus grupos.')
    expect(within(dialogo).getByRole('link', { name: 'Ir al planificador' })).toHaveAttribute('href', '/grupos-vida/planificar')
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }))

    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('activates after confirming, as before', async () => {
    seleccionar()
    fireEvent.click(screen.getByRole('button', { name: 'Activar' }))
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Activar de todos modos' }))

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/temporadas/bulk-update-status', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ seasonIds: [TEMPORADAS[0].id], status: true }),
    })))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('asks before deactivating too', async () => {
    seleccionar()
    fireEvent.click(screen.getByRole('button', { name: 'Desactivar' }))

    const dialogo = screen.getByRole('alertdialog', { name: '¿Desactivar 1 temporada a mano?' })
    expect(dialogo).toHaveTextContent('Desactivar a mano no archiva sus grupos.')
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Desactivar de todos modos' }))

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/temporadas/bulk-update-status', expect.objectContaining({
      body: JSON.stringify({ seasonIds: [TEMPORADAS[0].id], status: false }),
    })))
  })
})
