/**
 * useGuardarCambio — optimistic overlay of the directors page.
 *
 * New server data drops the optimistic values, except the ones whose save is
 * still running: those keep showing what the person chose until their own
 * result arrives.
 */
import { act, renderHook } from '@testing-library/react'

import { useGuardarCambio, type ResultadoAccion } from '@/components/grupos-vida/directores/use-guardar-cambio'

const refresh = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

const toast = { success: jest.fn(), error: jest.fn(), info: jest.fn() }
jest.mock('@/hooks/use-notificaciones', () => ({ useNotificaciones: () => toast }))

beforeEach(() => jest.clearAllMocks())

function diferida() {
  let terminar: (r: ResultadoAccion) => void = () => {}
  const promesa = new Promise<ResultadoAccion>((resolve) => (terminar = resolve))
  return { promesa, terminar }
}

describe('useGuardarCambio', () => {
  it('shows the new value at once and clears it when the server data arrives', async () => {
    const { result, rerender } = renderHook(({ datos }) => useGuardarCambio(datos), { initialProps: { datos: 1 } })

    await act(async () => {
      await result.current.guardar('a', 'nuevo', async () => ({ success: true }), 'ok')
    })
    expect(result.current.valor('a', 'viejo')).toBe('nuevo')

    rerender({ datos: 2 })
    expect(result.current.valor('a', 'viejo')).toBe('viejo')
  })

  it('keeps the value of a save still pending when server data arrives, and clears the settled one', async () => {
    const lenta = diferida()
    const { result, rerender } = renderHook(({ datos }) => useGuardarCambio(datos), { initialProps: { datos: 1 } })

    let guardadoLento: Promise<boolean> = Promise.resolve(false)
    act(() => {
      guardadoLento = result.current.guardar('lenta', 'B', () => lenta.promesa, 'ok')
    })
    await act(async () => {
      await result.current.guardar('rapida', 'A', async () => ({ success: true }), 'ok')
    })
    expect(result.current.valor('lenta', 'x')).toBe('B')
    expect(result.current.valor('rapida', 'x')).toBe('A')

    // the refresh triggered by the fast save brings new server data
    rerender({ datos: 2 })
    expect(result.current.valor('rapida', 'x')).toBe('x')
    expect(result.current.valor('lenta', 'x')).toBe('B')
    expect(result.current.pendiente('lenta')).toBe(true)

    await act(async () => {
      lenta.terminar({ success: true })
      await guardadoLento
    })
    expect(result.current.pendiente('lenta')).toBe(false)
    rerender({ datos: 3 })
    expect(result.current.valor('lenta', 'x')).toBe('x')
  })
})
