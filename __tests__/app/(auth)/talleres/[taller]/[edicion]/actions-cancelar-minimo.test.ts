/**
 * @jest-environment node
 *
 * T8a (odd/tasks/talleres-reserva-publica.md, S9) — «Cancelar edición» from
 * the below-minimum banner. The plain borrador/abierto update stays first
 * and unchanged (see actions.test.ts); only when it matches nothing and the
 * edición is below its minimum is the update retried for the date-derived
 * en_curso/cerrado states, never for a really closed edición.
 */

import { cancelarEdicion } from '@/app/(auth)/talleres/[taller]/[edicion]/actions'

jest.mock('@/lib/platform/talleres/flags', () => ({ isTalleresEnabled: jest.fn(() => true) }))
jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: jest.fn() }))
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))

const clientMock = jest.requireMock('@/lib/supabase/server').createSupabaseServerClient as jest.Mock
const revalidateMock = jest.requireMock('next/cache').revalidatePath as jest.Mock

interface Llamada {
  in: unknown[]
  is: unknown[] | null
}

function setup(opts: { primera: unknown[]; reintento?: unknown[]; bajoMinimo: boolean | null }) {
  const llamadas: Llamada[] = []
  const update = jest.fn(() => {
    const llamada: Llamada = { in: [], is: null }
    llamadas.push(llamada)
    const resultado = () => Promise.resolve({ data: llamadas.length === 1 ? opts.primera : opts.reintento ?? [], error: null })
    const cadena = {
      eq: () => cadena,
      in: (...a: unknown[]) => {
        llamada.in = a
        return cadena
      },
      is: (...a: unknown[]) => {
        llamada.is = a
        return cadena
      },
      select: resultado,
    }
    return cadena
  })
  const rpc = jest.fn().mockResolvedValue(
    opts.bajoMinimo === null ? { data: null, error: { code: '42501' } } : { data: { minimo: 4, bajo_minimo: opts.bajoMinimo }, error: null },
  )
  clientMock.mockReset().mockResolvedValue({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'auth-1' } } }) },
    from: jest.fn(() => ({ update })),
    rpc,
  })
  return { llamadas, rpc, update }
}

beforeEach(() => revalidateMock.mockReset())

describe('cancelarEdicion — below the minimum', () => {
  it('a borrador/abierto edición is cancelled by the first update; the panel is never read', async () => {
    const { llamadas, rpc } = setup({ primera: [{ id: 'e-1' }], bajoMinimo: true })
    const r = await cancelarEdicion({ tallerSlug: 's', edicionId: 'e-1' })
    expect(r).toEqual({ ok: true })
    expect(llamadas).toHaveLength(1)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('below the minimum, a date-derived en_curso/cerrado edición is cancelled when not really closed', async () => {
    const { llamadas, rpc, update } = setup({ primera: [], reintento: [{ id: 'e-1' }], bajoMinimo: true })
    const r = await cancelarEdicion({ tallerSlug: 's', edicionId: 'e-1' })
    expect(r).toEqual({ ok: true })
    expect(rpc).toHaveBeenCalledWith('talleres_minimo_panel', { p_edicion_id: 'e-1' })
    expect(update).toHaveBeenLastCalledWith({ estado: 'cancelado' })
    expect(llamadas[1]).toEqual({ in: ['estado', ['en_curso', 'cerrado']], is: ['cerrada_en', null] })
    expect(revalidateMock).toHaveBeenCalledWith('/talleres/s/e-1')
  })

  it('not below the minimum: still forbidden, no retry', async () => {
    const { llamadas } = setup({ primera: [], bajoMinimo: false })
    const r = await cancelarEdicion({ tallerSlug: 's', edicionId: 'e-1' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('forbidden')
    expect(llamadas).toHaveLength(1)
    expect(revalidateMock).not.toHaveBeenCalled()
  })

  it('an unreadable panel counts as not below the minimum', async () => {
    const { llamadas } = setup({ primera: [], bajoMinimo: null })
    const r = await cancelarEdicion({ tallerSlug: 's', edicionId: 'e-1' })
    expect(r.ok).toBe(false)
    expect(llamadas).toHaveLength(1)
  })

  it('a retry that matches nothing (closed, or no permission) is forbidden', async () => {
    setup({ primera: [], reintento: [], bajoMinimo: true })
    const r = await cancelarEdicion({ tallerSlug: 's', edicionId: 'e-1' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('forbidden')
    expect(revalidateMock).not.toHaveBeenCalled()
  })
})
