/**
 * "Cambiar de área" (odd/tasks/dream-team-cambiar-area.md, T2, T3): the pure
 * helpers of lib/platform/dream-team/cambiar-area.ts.
 */
import {
  fetchEquiposCambioArea,
  fetchSolicitudesCambioArea,
  mapDestinos,
  mapSolicitudes,
  rolInicial,
  type DestinoCambioArea,
} from '@/lib/platform/dream-team/cambiar-area'
import { puedeCambiarArea } from '@/lib/platform/dream-team/acciones-servicio'

const AUDIO: DestinoCambioArea = {
  equipoId: 'eq-aud',
  ruta: ['DPS', 'Audio'],
  experiencia: 'dps',
  dirige: true,
  roles: [
    { id: 'r-vol', label: 'Voluntario', nivel: 'voluntario' },
    { id: 'r-lid', label: 'Líder', nivel: 'lider' },
  ],
}

describe('rolInicial', () => {
  it('proposes the destination rol with the current nivel', () => {
    expect(rolInicial(AUDIO, 'lider')).toBe('r-lid')
    expect(rolInicial(AUDIO, 'voluntario')).toBe('r-vol')
  })
  it('proposes none when the destination lacks that nivel or the nivel is unknown', () => {
    expect(rolInicial(AUDIO, 'director')).toBe('')
    expect(rolInicial(AUDIO, null)).toBe('')
    expect(rolInicial(undefined, 'lider')).toBe('')
  })
})

describe('mapDestinos', () => {
  it('splits the path and keeps only well-formed roles', () => {
    expect(
      mapDestinos([
        { equipo_id: 'eq-est', ruta: 'DPS › Operaciones › Estacionamiento', experiencia: 'dps', dirige: false, roles: [{ id: 'r', label: 'Voluntario', nivel: 'voluntario' }, { label: 'sin id' }] },
        { ruta: 'sin id' },
      ]),
    ).toEqual([
      {
        equipoId: 'eq-est',
        ruta: ['DPS', 'Operaciones', 'Estacionamiento'],
        experiencia: 'dps',
        dirige: false,
        roles: [{ id: 'r', label: 'Voluntario', nivel: 'voluntario' }],
      },
    ])
    expect(mapDestinos(null)).toEqual([])
  })
})

describe('mapSolicitudes', () => {
  it('drops rows with an unknown estado or motivo', () => {
    const fila = { id: 's1', estado: 'pendiente', motivo: 'traslado', puede_resolver: true, es_mia: false, nota: '' }
    expect(mapSolicitudes([fila, { ...fila, id: 's2', estado: 'otro' }, { ...fila, id: 's3', motivo: 'x' }])).toEqual([
      expect.objectContaining({ id: 's1', estado: 'pendiente', motivo: 'traslado', puedeResolver: true, esMia: false, nota: null }),
    ])
  })
})

describe('puedeCambiarArea', () => {
  const base = { origen: 'dream_team' as const, estado: 'activo' as const, servicioId: 's1', areaCambiable: true }
  it('needs director authority over a non-retired Dream Team servicio', () => {
    expect(puedeCambiarArea(base)).toBe(true)
    expect(puedeCambiarArea({ ...base, areaCambiable: false })).toBe(false)
    expect(puedeCambiarArea({ ...base, areaCambiable: undefined })).toBe(false)
    expect(puedeCambiarArea({ ...base, estado: 'retirado' })).toBe(false)
    expect(puedeCambiarArea({ ...base, origen: 'grupos_vida' })).toBe(false)
    expect(puedeCambiarArea({ ...base, servicioId: undefined })).toBe(false)
  })
})

describe('fetchEquiposCambioArea', () => {
  it('asks once per distinct equipo and keeps the true answers', async () => {
    const rpc = jest.fn(async (_fn: string, args: { p_equipo_id: string }) => ({ data: args.p_equipo_id === 'a', error: null }))
    expect([...(await fetchEquiposCambioArea({ rpc }, ['a', 'b', 'a']))]).toEqual(['a'])
    expect(rpc).toHaveBeenCalledTimes(2)
    expect(rpc).toHaveBeenCalledWith('dream_team_puede_solicitar_cambio_area', { p_equipo_id: 'a' })
  })
  it('fails closed', async () => {
    expect((await fetchEquiposCambioArea({}, ['a'])).size).toBe(0)
    const conError = jest.fn(async () => ({ data: true, error: { message: 'x' } }))
    expect((await fetchEquiposCambioArea({ rpc: conError }, ['a'])).size).toBe(0)
    const lanza = jest.fn(async () => {
      throw new Error('red')
    })
    expect((await fetchEquiposCambioArea({ rpc: lanza }, ['a'])).size).toBe(0)
    const noBooleano = jest.fn(async () => ({ data: [{ equipo_id: 'a' }], error: null }))
    expect((await fetchEquiposCambioArea({ rpc: noBooleano }, ['a'])).size).toBe(0)
  })
})

describe('fetchSolicitudesCambioArea', () => {
  it('reads dream_team_solicitudes_cambio_area()', async () => {
    const rpc = jest.fn(async () => ({ data: [{ id: 's1', estado: 'aprobada', motivo: 'correccion' }], error: null }))
    expect(await fetchSolicitudesCambioArea({ rpc })).toEqual([expect.objectContaining({ id: 's1', estado: 'aprobada' })])
    expect(rpc).toHaveBeenCalledWith('dream_team_solicitudes_cambio_area')
  })
  it('fails closed to none', async () => {
    expect(await fetchSolicitudesCambioArea({})).toEqual([])
    expect(await fetchSolicitudesCambioArea({ rpc: async () => ({ data: null, error: { message: 'x' } }) })).toEqual([])
  })
})
