/**
 * @jest-environment node
 *
 * R3b (odd/tasks/talleres-rediseno.md, S5) — the temporada detail is the
 * list's drawer now; /talleres/temporadas/[id] only sends old links there.
 */

import TemporadaDetallePage from '@/app/(auth)/talleres/temporadas/[id]/page'

const redirectMock = jest.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT ${url}`)
})

jest.mock('next/navigation', () => ({ redirect: (url: string) => redirectMock(url) }))

describe('/talleres/temporadas/[id]', () => {
  it('redirects to the list with that temporada open', async () => {
    await expect(TemporadaDetallePage({ params: Promise.resolve({ id: 'temp-1' }) })).rejects.toThrow(
      'NEXT_REDIRECT /talleres/temporadas?temporada=temp-1',
    )
    expect(redirectMock).toHaveBeenCalledWith('/talleres/temporadas?temporada=temp-1')
  })
})
