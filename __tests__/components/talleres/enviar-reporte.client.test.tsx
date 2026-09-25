/**
 * @jest-environment jsdom
 *
 * T4 (odd/tasks/talleres-asistencia-lider.md) — the "Enviar reporte" button
 * the líder presses at the end of the taller.
 *
 * POSTs to /api/talleres/grupos/[id]/reporte/enviar → talleres_enviar_
 * reporte, which decides whether this caller may send and whether every
 * clase is closed. The route translates whatever the function refuses, so
 * this island only has to surface that Spanish message — the two cases the
 * contract calls out (CLASES_ABIERTAS and solo_el_lider_puede_enviar_el_
 * reporte) arrive here already translated, and an already-sent reporte
 * (409) must toast and leave the screen fully usable.
 *
 * The VISIBILITY rules ("hidden while a clase is abierta, with copy that
 * says how many are missing"; "hidden from anyone who is not the líder")
 * are page decisions, so they live in
 * __tests__/app/(auth)/talleres/[taller]/[edicion]/[grupo]/page.test.tsx —
 * this file is jsdom (it renders), that one is node (it walks the tree).
 *
 * The only prop is a plain string: the island is reached from the server
 * page, so every value crossing the RSC boundary must serialize (lección
 * del paso 5).
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import { EnviarReporte } from '@/components/talleres/enviar-reporte.client'

const refreshMock = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}))

const successMock = jest.fn()
const errorMock = jest.fn()
jest.mock('@/hooks/use-notificaciones', () => ({
  useNotificaciones: () => ({ success: successMock, error: errorMock, info: jest.fn() }),
}))

const fetchMock = jest.fn()
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test global fetch stub
;(global as any).fetch = fetchMock

beforeEach(() => {
  jest.clearAllMocks()
  fetchMock.mockReset().mockResolvedValue({
    ok: true,
    json: async () => ({ reporte_id: 'r-1', estado: 'enviado' }),
  })
})

describe('EnviarReporte — envío', () => {
  it('POSTs to the grupo reporte/enviar endpoint', async () => {
    render(<EnviarReporte grupoId="g-1" />)
    fireEvent.click(screen.getByRole('button', { name: /Enviar reporte/ }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/talleres/grupos/g-1/reporte/enviar',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('refreshes the route and toasts on success', async () => {
    render(<EnviarReporte grupoId="g-1" />)
    fireEvent.click(screen.getByRole('button', { name: /Enviar reporte/ }))

    await waitFor(() => expect(successMock).toHaveBeenCalledTimes(1))
    expect(successMock).toHaveBeenCalledWith('Reporte enviado.')
    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1))
    expect(errorMock).not.toHaveBeenCalled()
  })

  it('toasts the translated CLASES_ABIERTAS message and does NOT refresh', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        error: 'conflict',
        message: 'Hay clases todavía abiertas; cerralas antes de enviar el reporte.',
      }),
    })
    render(<EnviarReporte grupoId="g-1" />)
    fireEvent.click(screen.getByRole('button', { name: /Enviar reporte/ }))

    await waitFor(() => expect(errorMock).toHaveBeenCalledTimes(1))
    expect(errorMock).toHaveBeenCalledWith(
      'Hay clases todavía abiertas; cerralas antes de enviar el reporte.',
    )
    expect(refreshMock).not.toHaveBeenCalled()
    expect(successMock).not.toHaveBeenCalled()
  })

  it('toasts the translated "sólo el líder" refusal without breaking the screen', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({
        error: 'forbidden',
        message: 'Sólo el líder de este grupo puede enviar el reporte.',
      }),
    })
    render(<EnviarReporte grupoId="g-1" />)
    fireEvent.click(screen.getByRole('button', { name: /Enviar reporte/ }))

    await waitFor(() => expect(errorMock).toHaveBeenCalledTimes(1))
    expect(errorMock).toHaveBeenCalledWith(
      'Sólo el líder de este grupo puede enviar el reporte.',
    )
    // The button stays usable: an error is not a dead end.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Enviar reporte/ })).toBeEnabled(),
    )
  })

  it('survives an already-sent reporte (409) and keeps the screen usable', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: 'conflict', message: 'Este reporte ya fue enviado.' }),
    })
    render(<EnviarReporte grupoId="g-1" />)
    const boton = screen.getByRole('button', { name: /Enviar reporte/ })
    fireEvent.click(boton)

    await waitFor(() => expect(errorMock).toHaveBeenCalledTimes(1))
    expect(errorMock).toHaveBeenCalledWith('Este reporte ya fue enviado.')
    expect(refreshMock).not.toHaveBeenCalled()
    await waitFor(() => expect(boton).toBeEnabled())

    // …and a retry still goes through (the component never wedges).
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ reporte_id: 'r-1', estado: 'enviado' }),
    })
    fireEvent.click(boton)
    await waitFor(() => expect(successMock).toHaveBeenCalledTimes(1))
  })

  it('falls back to a generic Spanish message when the response has none', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('not json')
      },
    })
    render(<EnviarReporte grupoId="g-1" />)
    fireEvent.click(screen.getByRole('button', { name: /Enviar reporte/ }))

    await waitFor(() => expect(errorMock).toHaveBeenCalledTimes(1))
    expect(errorMock).toHaveBeenCalledWith('No se pudo enviar el reporte.')
  })

  it('ignores a second click while the first one is in flight', async () => {
    let resolve: ((value: unknown) => void) | undefined
    fetchMock.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r
        }),
    )
    render(<EnviarReporte grupoId="g-1" />)
    const boton = screen.getByRole('button', { name: /Enviar reporte/ })
    fireEvent.click(boton)
    fireEvent.click(boton)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    resolve?.({ ok: true, json: async () => ({ reporte_id: 'r-1', estado: 'enviado' }) })
    await waitFor(() => expect(successMock).toHaveBeenCalledTimes(1))
  })
})
