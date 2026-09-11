/**
 * `<AvanceEtapaControl>` — shared stage-advance control used by both
 * /admin/dream-team/servidores and /dream-team/mi-equipo.
 *
 * Covers:
 *   - offers only the valid transitions from TRANSICIONES_VALIDAS for the
 *     current estado (never hardcoded in the UI)
 *   - renders nothing from a terminal estado (retirado has no transitions)
 *   - renders nothing without write capability
 *   - PATCHes { estado, motivo, expectedVersion } and reports success
 *   - shows a clear, reload-inviting message on a 409 version conflict
 *     (not a generic error)
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import { AvanceEtapaControl } from '@/components/dream-team/avance-etapa-control'
import { TRANSICIONES_VALIDAS } from '@/lib/platform/dream-team/state-machine'

afterEach(() => {
  jest.restoreAllMocks()
})

describe('AvanceEtapaControl', () => {
  it('offers only the valid transitions for the current estado (activo)', () => {
    render(
      <AvanceEtapaControl servicioId="s-1" estadoActual="activo" version={1} puedeEditar onSuccess={jest.fn()} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar etapa' }))

    const select = screen.getByLabelText('Nueva etapa') as HTMLSelectElement
    const valores = Array.from(select.options).map((o) => o.value).filter(Boolean)

    expect(valores.sort()).toEqual([...TRANSICIONES_VALIDAS.activo].sort())
  })

  it('renders nothing from a terminal estado (retirado has no valid transitions)', () => {
    const { container } = render(
      <AvanceEtapaControl servicioId="s-1" estadoActual="retirado" version={3} puedeEditar onSuccess={jest.fn()} />,
    )
    expect(TRANSICIONES_VALIDAS.retirado.size).toBe(0)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing without write capability, even with valid transitions available', () => {
    const { container } = render(
      <AvanceEtapaControl servicioId="s-1" estadoActual="activo" version={1} puedeEditar={false} onSuccess={jest.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('PATCHes estado + motivo + expectedVersion and reports success', async () => {
    const servicioActualizado = { id: 's-1', estado: 'en_pausa', version: 2 }
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ servicio: servicioActualizado, historial: [] }),
    })
    global.fetch = fetchMock as unknown as typeof fetch
    const onSuccess = jest.fn()

    render(<AvanceEtapaControl servicioId="s-1" estadoActual="activo" version={1} puedeEditar onSuccess={onSuccess} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar etapa' }))
    fireEvent.change(screen.getByLabelText('Nueva etapa'), { target: { value: 'en_pausa' } })
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'admin_pausa' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(servicioActualizado))

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/dream-team/servicios/s-1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ estado: 'en_pausa', motivo: 'admin_pausa', expectedVersion: 1 }),
      }),
    )
  })

  it('shows a clear reload-inviting message on a 409 version conflict, not a generic error', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: 'Conflicto de versión' }),
    }) as unknown as typeof fetch

    render(<AvanceEtapaControl servicioId="s-1" estadoActual="activo" version={1} puedeEditar onSuccess={jest.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar etapa' }))
    fireEvent.change(screen.getByLabelText('Nueva etapa'), { target: { value: 'en_pausa' } })
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'admin_pausa' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))

    const mensaje = await screen.findByRole('alert')
    expect(mensaje.textContent).toMatch(/recargá la página/i)
    expect(mensaje.textContent).not.toBe('Conflicto de versión')
  })

  it('shows the server error message on another non-ok response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'motivo inválido' }),
    }) as unknown as typeof fetch

    render(<AvanceEtapaControl servicioId="s-1" estadoActual="activo" version={1} puedeEditar onSuccess={jest.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar etapa' }))
    fireEvent.change(screen.getByLabelText('Nueva etapa'), { target: { value: 'en_pausa' } })
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'admin_pausa' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))

    await screen.findByText('motivo inválido')
  })
})
