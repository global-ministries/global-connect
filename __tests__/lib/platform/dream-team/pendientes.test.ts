/**
 * "Pendientes" of a director (odd/tasks/dream-team-pendientes-director.md, T3):
 * the mappers and reads of lib/platform/dream-team/pendientes.ts over the rows
 * of dream_team_pendientes_resumen() and dream_team_pendientes().
 */
import {
  TIPOS_PENDIENTE,
  esTipoPendiente,
  fetchPendientes,
  fetchResumenPendientes,
  mapFilasPendientes,
  mapResumenPendientes,
} from '@/lib/platform/dream-team/pendientes'

const RESUMEN = {
  areas_sin_servidores: 2,
  areas_total: 7,
  sin_cedula: 2,
  fecha_nacimiento: 4,
  sin_telefono: 1,
  genero_estado_civil: 1,
  fichas_incompletas: 6,
  sin_cuenta: 3,
  invitaciones_vencidas: 1,
  por_activar: 2,
  sin_turno: 3,
  solicitudes: 2,
  urgentes: 5,
  personas_total: 14,
  personas_en_orden: 3,
  porcentaje: 21,
}

const BASE = {
  persona_id: 'p-1',
  persona_nombre: 'Mariangel Pérez',
  equipo_id: 'eq-anf',
  equipo_ruta: 'DPS › Atención al Invitado › Anfitriones',
  servicio_id: null,
  servicio_estado: null,
  servicio_version: null,
  tiene_cuenta: false,
  tiene_correo: true,
  ficha_editable: true,
  invitable: true,
  desde: null,
  detalle: {},
}

describe('mapResumenPendientes', () => {
  it('maps the single row to camelCase counts', () => {
    expect(mapResumenPendientes([RESUMEN])).toEqual({
      areasSinServidores: 2,
      areasTotal: 7,
      sinCedula: 2,
      fechaNacimiento: 4,
      sinTelefono: 1,
      generoEstadoCivil: 1,
      fichasIncompletas: 6,
      sinCuenta: 3,
      invitacionesVencidas: 1,
      porActivar: 2,
      sinTurno: 3,
      solicitudes: 2,
      urgentes: 5,
      personasTotal: 14,
      personasEnOrden: 3,
      porcentaje: 21,
    })
  })

  it('keeps porcentaje null without people and turns bad counts into 0', () => {
    const resumen = mapResumenPendientes([{ ...RESUMEN, porcentaje: null, sin_cedula: 'x', urgentes: -1 }])
    expect(resumen?.porcentaje).toBeNull()
    expect(resumen?.sinCedula).toBe(0)
    expect(resumen?.urgentes).toBe(0)
    expect(mapResumenPendientes([{ ...RESUMEN, porcentaje: 140 }])?.porcentaje).toBeNull()
  })

  it('is null without a row', () => {
    expect(mapResumenPendientes([])).toBeNull()
    expect(mapResumenPendientes(null)).toBeNull()
    expect(mapResumenPendientes({})).toBeNull()
  })
})

describe('mapFilasPendientes', () => {
  it('maps the common columns and splits the path', () => {
    const [fila] = mapFilasPendientes([{ ...BASE, tipo: 'sin_cedula' }])
    expect(fila).toEqual({
      tipo: 'sin_cedula',
      personaId: 'p-1',
      personaNombre: 'Mariangel Pérez',
      equipoId: 'eq-anf',
      equipoRuta: ['DPS', 'Atención al Invitado', 'Anfitriones'],
      servicioId: null,
      servicioEstado: null,
      servicioVersion: null,
      tieneCuenta: false,
      tieneCorreo: true,
      fichaEditable: true,
      invitable: true,
      desde: null,
    })
  })

  it('maps the detalle of each tipo', () => {
    const filas = mapFilasPendientes([
      { ...BASE, tipo: 'area_sin_servidores', persona_id: null, persona_nombre: null, detalle: { por_activar: 1 } },
      { ...BASE, tipo: 'fecha_nacimiento', detalle: { motivo: 'marcador_1900' } },
      { ...BASE, tipo: 'genero_estado_civil', detalle: { campos: ['estado_civil', 'otro'] } },
      { ...BASE, tipo: 'sin_cuenta', detalle: { invitacion: 'vencida' } },
      { ...BASE, tipo: 'sin_cuenta', invitable: false, detalle: { invitacion: null } },
      {
        ...BASE,
        tipo: 'solicitud_cambio_area',
        servicio_id: 'se-1',
        servicio_estado: 'activo',
        servicio_version: 3,
        desde: '2026-11-02T10:00:00+00:00',
        detalle: {
          solicitud_id: 'sc-1',
          destino_ruta: 'DPS › Producción Creativa',
          rol_destino: 'Voluntario',
          motivo: 'traslado',
          nota: null,
          solicitante_nombre: 'Fabiola Giménez',
        },
      },
      { ...BASE, tipo: 'por_activar', servicio_id: 'se-2', servicio_estado: 'en_orientacion', servicio_version: 1 },
    ])
    expect(filas.map((f) => f.tipo)).toEqual([
      'area_sin_servidores',
      'fecha_nacimiento',
      'genero_estado_civil',
      'sin_cuenta',
      'sin_cuenta',
      'solicitud_cambio_area',
      'por_activar',
    ])
    expect(filas[0]).toMatchObject({ personaId: null, porActivar: 1 })
    expect(filas[1]).toMatchObject({ motivo: 'marcador_1900' })
    expect(filas[2]).toMatchObject({ campos: ['estado_civil'] })
    expect(filas[3]).toMatchObject({ invitacion: 'vencida' })
    expect(filas[4]).toMatchObject({ invitacion: null, invitable: false })
    expect(filas[5]).toMatchObject({
      servicioId: 'se-1',
      servicioEstado: 'activo',
      servicioVersion: 3,
      desde: '2026-11-02T10:00:00+00:00',
      solicitud: {
        id: 'sc-1',
        destinoRuta: 'DPS › Producción Creativa',
        rolDestino: 'Voluntario',
        motivo: 'traslado',
        nota: null,
        solicitanteNombre: 'Fabiola Giménez',
      },
    })
    expect(filas[6]).toMatchObject({ servicioId: 'se-2', servicioEstado: 'en_orientacion', servicioVersion: 1 })
  })

  it('drops malformed rows and keeps the order of the rest', () => {
    const filas = mapFilasPendientes([
      null,
      { ...BASE, tipo: 'sin_foto' },
      { ...BASE, tipo: 'persona' },
      { ...BASE, tipo: 'sin_cedula', equipo_id: null },
      { ...BASE, tipo: 'sin_telefono', persona_id: null },
      { ...BASE, tipo: 'fecha_nacimiento', detalle: { motivo: '1905' } },
      { ...BASE, tipo: 'genero_estado_civil', detalle: { campos: [] } },
      { ...BASE, tipo: 'solicitud_cambio_area', detalle: {} },
      { ...BASE, tipo: 'sin_turno', persona_id: 'p-2', servicio_estado: 'raro' },
      { ...BASE, tipo: 'sin_cedula' },
    ])
    expect(filas.map((f) => [f.tipo, f.personaId, f.servicioEstado])).toEqual([
      ['sin_turno', 'p-2', null],
      ['sin_cedula', 'p-1', null],
    ])
    expect(mapFilasPendientes(null)).toEqual([])
  })
})

describe('tipos', () => {
  it('lists the ten tipos of the RPC in screen order; the internal markers are not tipos', () => {
    expect(TIPOS_PENDIENTE).toEqual([
      'area_sin_servidores',
      'solicitud_cambio_area',
      'invitacion_vencida',
      'sin_cedula',
      'fecha_nacimiento',
      'sin_telefono',
      'genero_estado_civil',
      'sin_cuenta',
      'por_activar',
      'sin_turno',
    ])
    expect(esTipoPendiente('sin_turno')).toBe(true)
    expect(esTipoPendiente('persona')).toBe(false)
    expect(esTipoPendiente('area')).toBe(false)
  })
})

describe('reads', () => {
  it('calls the RPCs as the caller, with p_tipo only when given', async () => {
    const rpc = jest.fn(async (fn: string) => ({
      data: fn === 'dream_team_pendientes_resumen' ? [RESUMEN] : [{ ...BASE, tipo: 'sin_cedula' }],
      error: null,
    }))
    const supabase = { rpc }
    expect((await fetchResumenPendientes(supabase))?.urgentes).toBe(5)
    expect(await fetchPendientes(supabase)).toHaveLength(1)
    await fetchPendientes(supabase, 'sin_cedula')
    expect(rpc.mock.calls).toEqual([
      ['dream_team_pendientes_resumen', undefined],
      ['dream_team_pendientes', undefined],
      ['dream_team_pendientes', { p_tipo: 'sin_cedula' }],
    ])
  })

  it('fails closed: an error, a throw or no rpc is no data', async () => {
    const conError = { rpc: async () => ({ data: [RESUMEN], error: { code: '42501' } }) }
    const lanza = {
      rpc: async () => {
        throw new Error('red')
      },
    }
    expect(await fetchResumenPendientes(conError)).toBeNull()
    expect(await fetchPendientes(conError)).toEqual([])
    expect(await fetchResumenPendientes(lanza)).toBeNull()
    expect(await fetchPendientes(lanza)).toEqual([])
    expect(await fetchResumenPendientes({})).toBeNull()
    expect(await fetchPendientes({})).toEqual([])
  })
})
