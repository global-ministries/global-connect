/**
 * @jest-environment node
 *
 * R3b (odd/tasks/talleres-rediseno.md, S5) — «Crear temporada» opens in a
 * drawer over the list; /talleres/temporadas/crear only sends old links there.
 */

import CrearTemporadaPage from '@/app/(auth)/talleres/temporadas/crear/page'

const redirectMock = jest.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT ${url}`)
})

jest.mock('next/navigation', () => ({ redirect: (url: string) => redirectMock(url) }))

describe('/talleres/temporadas/crear', () => {
  it('redirects to the list with the create form open', () => {
    expect(() => CrearTemporadaPage()).toThrow('NEXT_REDIRECT /talleres/temporadas?crear=1')
    expect(redirectMock).toHaveBeenCalledWith('/talleres/temporadas?crear=1')
  })
})
