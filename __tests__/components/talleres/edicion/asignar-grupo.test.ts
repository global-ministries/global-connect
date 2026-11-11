/**
 * R3f (odd/tasks/talleres-rediseno.md, S2) — the client call to the
 * existing asignar-grupo route, with the route's error codes mapped to
 * neutral «tú» text (its own messages are still in voseo).
 */

import { asignarGrupo } from '@/components/talleres/edicion/asignar-grupo'

function responder(status: number, body: unknown) {
  const fetchMock = jest.fn(async () => ({ ok: status < 300, status, json: async () => body }))
  ;(global as unknown as { fetch: jest.Mock }).fetch = fetchMock
  return fetchMock
}

describe('asignarGrupo', () => {
  it('posts the ids and the grupo to the route', async () => {
    const fetchMock = responder(200, { asignadas: 2, ocupacion: 6, capacidad: 8 })
    expect(await asignarGrupo(['i-1', 'i-2'], 'g-1')).toEqual({ ok: true, mensaje: 'Grupo asignado.' })
    expect(fetchMock).toHaveBeenCalledWith('/api/talleres/inscripciones/asignar-grupo', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ inscripcion_ids: ['i-1', 'i-2'], grupo_id: 'g-1' }),
    })
  })

  it('reports a grupo over its capacidad', async () => {
    responder(200, { asignadas: 1, ocupacion: 9, capacidad: 8 })
    expect((await asignarGrupo(['i-1'], 'g-1')).mensaje).toBe(
      'Grupo asignado. El grupo queda con 9 de 8: 1 por encima de la capacidad.',
    )
  })

  it('says the grupo was taken out for null', async () => {
    responder(200, { asignadas: 1, ocupacion: null, capacidad: null })
    expect(await asignarGrupo(['i-1'], null)).toEqual({ ok: true, mensaje: 'Quitaste el grupo.' })
  })

  it.each([
    ['FORBIDDEN', 403, 'No tienes permiso para asignar grupos en esta edición.'],
    ['NOT_APROBADA', 409, 'Solo se pueden ubicar inscripciones aprobadas.'],
    ['NOT_FOUND', 404, 'Una o más inscripciones ya no existen. Actualiza la página.'],
    ['INVALID_GRUPO', 400, 'Ese grupo es de otra edición.'],
    ['RARO', 500, 'No se pudo asignar el grupo. Inténtalo de nuevo.'],
  ])('maps %s to neutral text, never the route message', async (error, status, mensaje) => {
    responder(status, { error, message: 'Refrescá la página.' })
    expect(await asignarGrupo(['i-1'], 'g-1')).toEqual({ ok: false, mensaje })
  })

  it('fails soft on a network error', async () => {
    ;(global as unknown as { fetch: jest.Mock }).fetch = jest.fn(async () => {
      throw new Error('red')
    })
    expect(await asignarGrupo(['i-1'], 'g-1')).toEqual({ ok: false, mensaje: 'No se pudo asignar el grupo. Inténtalo de nuevo.' })
  })
})
