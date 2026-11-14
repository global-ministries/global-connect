/**
 * @jest-environment node
 *
 * R3l (odd/tasks/talleres-rediseno.md, S1, L11) — Temporadas is hidden from
 * Talleres: /talleres/temporadas and its old /[id] and /crear links all go to
 * the catálogo. The data and the server actions stay.
 */

import TemporadasPage from '@/app/(auth)/talleres/temporadas/page'

const redirectMock = jest.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT ${url}`)
})

jest.mock('next/navigation', () => ({ redirect: (url: string) => redirectMock(url) }))

describe('/talleres/temporadas (R3l)', () => {
  it('redirects to the catálogo', () => {
    expect(() => TemporadasPage()).toThrow('NEXT_REDIRECT /talleres')
    expect(redirectMock).toHaveBeenCalledTimes(1)
    expect(redirectMock).toHaveBeenCalledWith('/talleres')
  })
})
