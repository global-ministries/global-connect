/**
 * R3j (odd/tasks/talleres-rediseno.md, S9) — how many people asked
 * «Avísame si se libera un lugar» for the edición: one count-only RPC,
 * best effort (0 on any failure, so the page shows nothing).
 */

import { cargarEsperanLugar } from '@/components/talleres/edicion/cargar-esperan'

function cliente(respuesta: { data: unknown; error: unknown } | Error) {
  const rpc = jest.fn(() => (respuesta instanceof Error ? Promise.reject(respuesta) : Promise.resolve(respuesta)))
  return { client: { rpc }, rpc }
}

describe('cargarEsperanLugar', () => {
  it('calls talleres_avisame_lugar_contar once with the edición id and returns its pendientes', async () => {
    const c = cliente({ data: [{ edicion_id: 'e-1', pendientes: 4 }], error: null })
    expect(await cargarEsperanLugar(c.client, 'e-1')).toBe(4)
    expect(c.rpc).toHaveBeenCalledTimes(1)
    expect(c.rpc).toHaveBeenCalledWith('talleres_avisame_lugar_contar', { p_edicion_ids: ['e-1'] })
  })

  it('returns 0 when the edición has no row (the caller does not manage it)', async () => {
    expect(await cargarEsperanLugar(cliente({ data: [], error: null }).client, 'e-1')).toBe(0)
    expect(await cargarEsperanLugar(cliente({ data: [{ edicion_id: 'e-2', pendientes: 9 }], error: null }).client, 'e-1')).toBe(0)
  })

  it('returns 0 on an error, a thrown call or a malformed value, never throws', async () => {
    expect(await cargarEsperanLugar(cliente({ data: null, error: { code: '42501' } }).client, 'e-1')).toBe(0)
    expect(await cargarEsperanLugar(cliente(new Error('red')).client, 'e-1')).toBe(0)
    expect(await cargarEsperanLugar(cliente({ data: [{ edicion_id: 'e-1', pendientes: 'x' }], error: null }).client, 'e-1')).toBe(0)
    expect(await cargarEsperanLugar(cliente({ data: [{ edicion_id: 'e-1', pendientes: -2 }], error: null }).client, 'e-1')).toBe(0)
  })
})
