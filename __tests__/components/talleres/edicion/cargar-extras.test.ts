/**
 * R3f (odd/tasks/talleres-rediseno.md) — origen and por_verificar for the
 * edición's inscripciones: one batched read, best effort.
 */

import { cargarExtrasInscripciones } from '@/components/talleres/edicion/cargar-extras'

function cliente(respuesta: { data: unknown; error: unknown } | Error) {
  const inMock = jest.fn(() => (respuesta instanceof Error ? Promise.reject(respuesta) : Promise.resolve(respuesta)))
  const select = jest.fn(() => ({ in: inMock }))
  const from = jest.fn(() => ({ select }))
  return { client: { from }, from, select, inMock }
}

describe('cargarExtrasInscripciones', () => {
  it('reads id, origen and por_verificar of the given ids in one query', async () => {
    const c = cliente({
      data: [
        { id: 'i-1', origen: 'publico', por_verificar: true },
        { id: 'i-2', origen: 'admin', por_verificar: false },
        { id: 'i-3', origen: 'otro', por_verificar: null },
      ],
      error: null,
    })
    const extras = await cargarExtrasInscripciones(c.client, ['i-1', 'i-2', 'i-3'])
    expect(c.from).toHaveBeenCalledWith('taller_inscripciones')
    expect(c.select).toHaveBeenCalledWith('id, origen, por_verificar')
    expect(c.inMock).toHaveBeenCalledWith('id', ['i-1', 'i-2', 'i-3'])
    expect(Object.fromEntries(extras)).toEqual({
      'i-1': { origen: 'publico', porVerificar: true },
      'i-2': { origen: 'admin', porVerificar: false },
      'i-3': { origen: null, porVerificar: false },
    })
  })

  it('does not query without ids', async () => {
    const c = cliente({ data: [], error: null })
    expect((await cargarExtrasInscripciones(c.client, [])).size).toBe(0)
    expect(c.from).not.toHaveBeenCalled()
  })

  it('returns an empty map on an error or a thrown read, never throws', async () => {
    expect((await cargarExtrasInscripciones(cliente({ data: null, error: { message: 'x' } }).client, ['i-1'])).size).toBe(0)
    expect((await cargarExtrasInscripciones(cliente(new Error('red')).client, ['i-1'])).size).toBe(0)
  })
})
