/**
 * @jest-environment jsdom
 *
 * BUGFIX — SelectLeaderModal used to hardcode /api/lideres/buscar, which
 * filters by the Grupos-de-Vida 'lider' system role. Reused as-is by
 * talleres' grupos-section.tsx to assign líder/voluntario to a grupo, this
 * made most talleres people unfindable (a facilitator need not be a GdV
 * leader). The modal now accepts an optional `searchEndpoint` prop —
 * defaulting to /api/lideres/buscar so Grupos de Vida callers are
 * untouched — and normalizes either response shape: GdV's
 * `{ lideres: [...] }` (full LiderConEstado rows) or a plain array of
 * `{ id, nombre, apellido, email }` (e.g. /api/talleres/admin/usuarios/
 * buscar), defaulting the GdV-only fields (estado, grupos_*,
 * foto_perfil_url, en_segmento_actual) so the same picker UI renders
 * either shape without crashing.
 */
import { act, render, screen } from '@testing-library/react'
import React from 'react'

import SelectLeaderModal from '@/components/modals/SelectLeaderModal'

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response
}

describe('SelectLeaderModal — searchEndpoint', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('defaults to /api/lideres/buscar when no searchEndpoint prop is given (GdV untouched)', async () => {
    const calls: string[] = []
    ;(global as unknown as { fetch: jest.Mock }).fetch = jest.fn((url: string) => {
      calls.push(url)
      return Promise.resolve(jsonResponse({ lideres: [], total: 0 }))
    })

    render(<SelectLeaderModal open onClose={() => {}} onSelect={() => {}} />)

    await act(async () => {
      await jest.advanceTimersByTimeAsync(320)
    })

    expect(calls[0]).toContain('/api/lideres/buscar')
  })

  it('calls the searchEndpoint prop instead when given', async () => {
    const calls: string[] = []
    ;(global as unknown as { fetch: jest.Mock }).fetch = jest.fn((url: string) => {
      calls.push(url)
      return Promise.resolve(jsonResponse([]))
    })

    render(
      <SelectLeaderModal
        open
        onClose={() => {}}
        onSelect={() => {}}
        searchEndpoint="/api/talleres/admin/usuarios/buscar"
      />,
    )

    await act(async () => {
      await jest.advanceTimersByTimeAsync(320)
    })

    expect(calls[0]).toContain('/api/talleres/admin/usuarios/buscar')
    expect(calls[0]).not.toContain('/api/lideres/buscar')
  })

  it('normalizes a plain-array response (no lideres wrapper), defaulting missing fields', async () => {
    ;(global as unknown as { fetch: jest.Mock }).fetch = jest.fn(() =>
      Promise.resolve(
        jsonResponse([
          { id: 'u-1', nombre: 'Ana', apellido: 'Pérez', email: 'ana@test.com', auth_id: null },
        ]),
      ),
    )

    render(
      <SelectLeaderModal
        open
        onClose={() => {}}
        onSelect={() => {}}
        searchEndpoint="/api/talleres/admin/usuarios/buscar"
      />,
    )

    await act(async () => {
      await jest.advanceTimersByTimeAsync(320)
    })

    expect(screen.getByText('Ana Pérez')).toBeInTheDocument()
    // Defaulted estado ('disponible') resolves through ESTADO_CONFIG to the
    // "Disponible" badge, proving the missing field was defaulted rather
    // than crashing on an undefined lookup. The legend also renders the
    // word "Disponible" unconditionally, so at least 2 matches is expected
    // here (legend + this result's badge) — the point is no crash occurred.
    expect(screen.getAllByText('Disponible').length).toBeGreaterThanOrEqual(2)
  })

  it('picking a normalized result calls onSelect with its id', async () => {
    ;(global as unknown as { fetch: jest.Mock }).fetch = jest.fn(() =>
      Promise.resolve(
        jsonResponse([{ id: 'u-1', nombre: 'Ana', apellido: 'Pérez', email: 'ana@test.com' }]),
      ),
    )
    const onSelect = jest.fn()

    render(
      <SelectLeaderModal
        open
        onClose={() => {}}
        onSelect={onSelect}
        searchEndpoint="/api/talleres/admin/usuarios/buscar"
      />,
    )

    await act(async () => {
      await jest.advanceTimersByTimeAsync(320)
    })

    act(() => {
      screen.getByText('Ana Pérez').closest('li')!.click()
    })

    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'u-1', nombre: 'Ana', apellido: 'Pérez' }),
    )
  })
})
