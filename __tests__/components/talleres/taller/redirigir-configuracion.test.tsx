/**
 * @jest-environment jsdom
 *
 * R3k (odd/tasks/talleres-rediseno.md, S1, S4, L10) — the configuration left
 * the taller page for /talleres/[taller]/configuracion. Links that still
 * point at the old anchor (the catálogo's `#configuracion-heading`, #735)
 * land on the new view: the taller page replaces the URL on load.
 */

import { render } from '@testing-library/react'

const replaceMock = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
}))

import { RedirigirAnclaConfiguracion } from '@/components/talleres/taller/redirigir-configuracion'

const DESTINO = '/talleres/proximo-paso/configuracion'

beforeEach(() => {
  replaceMock.mockReset()
  window.history.replaceState(null, '', '/talleres/proximo-paso')
})

it.each(['#configuracion-heading', '#configuracion'])('replaces %s with the configuration view', (hash) => {
  window.history.replaceState(null, '', `/talleres/proximo-paso${hash}`)
  render(<RedirigirAnclaConfiguracion href={DESTINO} />)
  expect(replaceMock).toHaveBeenCalledWith(DESTINO)
})

it('does nothing without the anchor or with another one (#ediciones, #abrir)', () => {
  render(<RedirigirAnclaConfiguracion href={DESTINO} />)
  window.history.replaceState(null, '', '/talleres/proximo-paso#ediciones')
  render(<RedirigirAnclaConfiguracion href={DESTINO} />)
  window.history.replaceState(null, '', '/talleres/proximo-paso#abrir')
  render(<RedirigirAnclaConfiguracion href={DESTINO} />)
  expect(replaceMock).not.toHaveBeenCalled()
})

it('follows the anchor when it changes after load', () => {
  render(<RedirigirAnclaConfiguracion href={DESTINO} />)
  window.history.replaceState(null, '', '/talleres/proximo-paso#configuracion-heading')
  window.dispatchEvent(new HashChangeEvent('hashchange'))
  expect(replaceMock).toHaveBeenCalledWith(DESTINO)
})

it('renders nothing', () => {
  const { container } = render(<RedirigirAnclaConfiguracion href={DESTINO} />)
  expect(container).toBeEmptyDOMElement()
})
