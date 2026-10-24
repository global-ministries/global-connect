/**
 * @jest-environment jsdom
 *
 * Regression: on a slow machine React yields between commits, so the confirm
 * step could render while the search transition was still pending and its
 * buttons were disabled. A click there was dropped ("Buscar otra cédula" did
 * nothing). Each TarjetaSistema render busy-waits past React's 5 ms time slice
 * to force that yield deterministically.
 */

import { fireEvent, render, screen } from '@testing-library/react'

const buscarMock = jest.fn()

jest.mock('@/app/(auth)/talleres/explorar/actions', () => ({
  inscribirseATaller: jest.fn(),
  miConyugeRegistrado: jest.fn(),
  buscarParejaPorCedula: (...args: unknown[]) => buscarMock(...args),
}))

jest.mock('@/components/ui/sistema-diseno', () => {
  const real = jest.requireActual('@/components/ui/sistema-diseno')
  const { createElement } = jest.requireActual('react')
  return {
    ...real,
    TarjetaSistema: (props: Record<string, unknown>) => {
      const inicio = Date.now()
      while (Date.now() - inicio < 20) {
        // Busy-wait: simulates a slow render.
      }
      return createElement(real.TarjetaSistema, props)
    },
  }
})

import { SelectorPareja } from '@/components/talleres/selector-pareja'

it('shows the match with enabled actions, so "Buscar otra cédula" works on a slow render', async () => {
  buscarMock.mockResolvedValue({ ok: true, encontrada: true, nombreMostrado: 'María G.' })
  render(<SelectorPareja edicionId="ed-1" vinculoEdicion="novios" onCerrar={jest.fn()} onInscrito={jest.fn()} />)

  fireEvent.change(await screen.findByLabelText(/cédula de tu pareja/i), { target: { value: '12345678' } })
  fireEvent.click(screen.getByRole('button', { name: /^buscar$/i }))

  const otra = await screen.findByRole('button', { name: /buscar otra cédula/i })
  expect(otra).toBeEnabled()
  fireEvent.click(otra)

  expect(await screen.findByLabelText(/cédula de tu pareja/i)).toBeInTheDocument()
})
