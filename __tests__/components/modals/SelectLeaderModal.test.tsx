/**
 * @jest-environment jsdom
 *
 * SelectLeaderModal always queries /api/lideres/buscar (Grupos de Vida's
 * lider search) — the configurable `searchEndpoint` prop this file used
 * to test was removed in T5 (odd/tasks/talleres-configuracion-del-
 * taller.md, Limpieza): it existed only so talleres' grupos-section.tsx
 * could point this modal at a plain-array people search instead
 * (/api/talleres/admin/usuarios/buscar, since deleted), and that caller
 * was replaced by the bounded FacilitadorPicker in T4, leaving the prop
 * callerless (verified via rg: no caller passed it). The modal still
 * accepts either response shape defensively — GdV's `{ lideres: [...] }`
 * (full LiderConEstado rows, what it actually receives now) or a plain
 * array of `{ id, nombre, apellido, email }` — so this file keeps that
 * coverage without the prop, defaulting the GdV-only fields (estado,
 * grupos_*, foto_perfil_url, en_segmento_actual) so either shape renders
 * without crashing.
 */
import { act, render, screen } from '@testing-library/react'
import React from 'react'

import SelectLeaderModal from '@/components/modals/SelectLeaderModal'

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response
}

describe('SelectLeaderModal', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('always queries /api/lideres/buscar (GdV untouched, no configurable endpoint anymore)', async () => {
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

  it('normalizes a plain-array response (no lideres wrapper), defaulting missing fields', async () => {
    ;(global as unknown as { fetch: jest.Mock }).fetch = jest.fn(() =>
      Promise.resolve(
        jsonResponse([
          { id: 'u-1', nombre: 'Ana', apellido: 'Pérez', email: 'ana@test.com', auth_id: null },
        ]),
      ),
    )

    render(<SelectLeaderModal open onClose={() => {}} onSelect={() => {}} />)

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

    render(<SelectLeaderModal open onClose={() => {}} onSelect={onSelect} />)

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
