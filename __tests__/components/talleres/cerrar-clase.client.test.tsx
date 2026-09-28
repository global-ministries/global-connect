/**
 * @jest-environment jsdom
 *
 * T11 (odd/tasks/talleres-configuracion-del-taller.md, flow audit) — moved
 * from a per-row control in the Clases list into the Asistencia register
 * block, for the SELECTED clase only (the page now renders it once, not
 * once per row). Its label names the clase ("Cerrar clase N") the same way
 * EditarClaseInstanciada's icon-only action does (T10) — never a generic
 * "Cerrar clase" once a número is known.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const refreshMock = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}))

import { CerrarClase } from '@/components/talleres/cerrar-clase.client'

beforeEach(() => {
  refreshMock.mockReset()
  ;(global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({}),
  })
})

describe('CerrarClase — label names the clase', () => {
  it('renders "Cerrar clase N" using the numero prop', () => {
    render(<CerrarClase sesionId="s-3" numero={3} />)
    expect(screen.getByRole('button', { name: /^cerrar clase 3$/i })).toBeInTheDocument()
  })
})

describe('CerrarClase — action', () => {
  it('POSTs to the sesion-scoped cerrar endpoint and refreshes on success', async () => {
    render(<CerrarClase sesionId="s-3" numero={3} />)
    fireEvent.click(screen.getByRole('button', { name: /^cerrar clase 3$/i }))
    await waitFor(() =>
      expect((global as unknown as { fetch: jest.Mock }).fetch).toHaveBeenCalledWith(
        '/api/talleres/sesiones/s-3/cerrar',
        { method: 'POST' },
      ),
    )
    await waitFor(() => expect(refreshMock).toHaveBeenCalled())
  })
})
