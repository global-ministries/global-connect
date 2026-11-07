/**
 * The planner RPC outputs read defensively (T4 of odd/tasks/planner-gdv.md):
 * planner_tablero, planner_banco, planner_temporadas, planner_bloqueos,
 * planner_estado_publicacion and planner_historial. A malformed row is
 * dropped and counted, never a crash.
 */
import {
  leerBanco,
  leerBloqueos,
  leerEstadoPublicacion,
  leerHistorial,
  leerLocalidades,
  leerTablero,
  leerTemporadas,
} from '@/lib/platform/grupos-vida/planner'

const filaTablero = {
  grupo_id: 'g1',
  nombre: 'Grupo #14 Los Escalona',
  segmento_id: 'seg-mat',
  segmento_nombre: 'Matrimonios',
  localidad_id: null,
  localidad_nombre: null,
  localidad_municipio_id: null,
  localidad_municipio_nombre: null,
  dia_reunion: 'Jueves',
  hora_reunion: '19:30:00',
  capacidad_maxima: 15,
  estado_ciclo: 'proximo',
  estado_aprobacion: 'pendiente',
  activo: true,
  directores: [{ segmento_lider_id: 'sl1', usuario_id: 'd1', nombre: 'Rosa', apellido: 'Gil' }],
  lideres: [{ usuario_id: 'l1', nombre: 'Carlos', apellido: 'Escalona', lideres_origen: [] }],
  aprendices: [],
  miembros: [{ usuario_id: 'm1', nombre: 'Ana', apellido: 'Pérez', lideres_origen: ['l1', 'l9'] }],
}

const filaBanco = {
  usuario_id: 'u1',
  nombre: 'Ana',
  apellido: 'Pérez',
  edad: 41,
  genero: 'Femenino',
  estado_civil: 'Casado',
  fecha_registro: '2025-03-01T10:00:00+00:00',
  conyuge_id: 'u2',
  segmento_sugerido_id: 'seg-mat',
  segmento_sugerido_nombre: 'Matrimonios',
  tiene_direccion: true,
  municipio_id: 'mun-pal',
  municipio_nombre: 'Palavecino',
  grupo_actual_id: null,
  grupo_actual_nombre: null,
  grupo_actual_rol: null,
  grupo_actual_segmento_id: null,
  grupos_en_temporada: 0,
  origen_grupo_id: 'g-old',
  origen_grupo_nombre: 'Grupo Renacer',
  origen_rol: 'Miembro',
  origen_lideres: [{ usuario_id: 'l1', nombre: 'Carlos', apellido: 'Escalona' }],
  otras_temporadas: [{ temporada_id: 't1', temporada_nombre: '2026-I', grupo_id: 'g7', grupo_nombre: 'Grupo Luz' }],
}

describe('leerTablero', () => {
  it('keeps a well-formed row exactly as the RPC returns it', () => {
    expect(leerTablero([filaTablero])).toEqual({ filas: [filaTablero], descartadas: 0 })
  })

  it('drops rows without ids, segment or activo and counts them', () => {
    const lectura = leerTablero([filaTablero, { ...filaTablero, grupo_id: '' }, { ...filaTablero, segmento_nombre: null }, { ...filaTablero, activo: 'si' }, 7, null])
    expect(lectura.filas).toHaveLength(1)
    expect(lectura.descartadas).toBe(5)
  })

  it('drops a malformed person but keeps the group', () => {
    const lectura = leerTablero([{ ...filaTablero, miembros: [...filaTablero.miembros, { nombre: 'Sin id' }] }])
    expect(lectura.filas[0].miembros.map((m) => m.usuario_id)).toEqual(['m1'])
    expect(lectura.descartadas).toBe(1)
  })

  it('reads missing lists, names and leaders of origin as empty', () => {
    const lectura = leerTablero([
      { ...filaTablero, directores: null, aprendices: undefined, miembros: [{ usuario_id: 'm1', nombre: null, apellido: null, lideres_origen: ['l1', 3] }] },
    ])
    expect(lectura.filas[0]).toMatchObject({
      directores: [],
      aprendices: [],
      miembros: [{ usuario_id: 'm1', nombre: '', apellido: '', lideres_origen: ['l1'] }],
    })
  })

  it('reads a non-numeric capacity as null', () => {
    expect(leerTablero([{ ...filaTablero, capacidad_maxima: 'quince' }]).filas[0].capacidad_maxima).toBeNull()
  })

  it('returns nothing for a non-list input; only a real value counts as discarded', () => {
    expect(leerTablero(null)).toEqual({ filas: [], descartadas: 0 })
    expect(leerTablero({ grupo_id: 'g1' })).toEqual({ filas: [], descartadas: 1 })
  })
})

describe('leerBanco', () => {
  it('keeps a well-formed row exactly as the RPC returns it', () => {
    expect(leerBanco([filaBanco])).toEqual({ filas: [filaBanco], descartadas: 0 })
  })

  it('drops a row without usuario_id', () => {
    expect(leerBanco([{ ...filaBanco, usuario_id: null }])).toEqual({ filas: [], descartadas: 1 })
  })

  it('defaults missing counters and lists, drops malformed nested entries', () => {
    const lectura = leerBanco([
      { ...filaBanco, tiene_direccion: null, grupos_en_temporada: null, origen_lideres: [{ nombre: 'x' }], otras_temporadas: 'no' },
    ])
    expect(lectura.filas[0]).toMatchObject({ tiene_direccion: false, grupos_en_temporada: 0, origen_lideres: [], otras_temporadas: [] })
    expect(lectura.descartadas).toBe(1)
  })
})

describe('leerTemporadas', () => {
  const temporadas = {
    usuario_id: 'u1',
    ve_todos_los_segmentos: true,
    puede_publicar: true,
    puede_crear_temporada: true,
    segmentos_editables: ['seg-mat'],
    segmentos: [
      {
        id: 'seg-mat',
        nombre: 'Matrimonios',
        directores: [
          { segmento_lider_id: 'sl-1', usuario_id: 'u-hector', nombre: 'Héctor', apellido: 'Linárez' },
          { segmento_lider_id: 'sl-2', usuario_id: 'u-ramon', nombre: 'Ramón', apellido: 'Silva' },
        ],
      },
      { id: 'seg-jov', nombre: 'Jóvenes', directores: [] },
    ],
    temporadas: [
      {
        id: 't2',
        nombre: '2026-II',
        fecha_inicio: '2026-10-12',
        fecha_fin: '2027-10-10',
        estado: 'planificacion',
        activa: true,
        cohorte: 'II',
        origen_id: 't0',
        origen_nombre: '2025 - II',
      },
      { id: 't9', nombre: 'Prueba', fecha_inicio: '2020-01-01', fecha_fin: null, estado: 'finalizada', activa: false, cohorte: null, origen_id: null, origen_nombre: null },
    ],
  }

  it('keeps a well-formed object exactly', () => {
    expect(leerTemporadas(temporadas)).toEqual(temporadas)
  })

  it('reads an unknown cohort as null and drops a season without id', () => {
    const leido = leerTemporadas({ ...temporadas, temporadas: [{ ...temporadas.temporadas[0], cohorte: 'III' }, { nombre: 'x' }] })
    expect(leido?.temporadas).toEqual([{ ...temporadas.temporadas[0], cohorte: null }])
  })

  it('reads each segment directores, a missing list as empty, and drops a malformed director', () => {
    const [matrimonios, jovenes] = temporadas.segmentos
    const leido = leerTemporadas({
      ...temporadas,
      segmentos: [
        { ...matrimonios, directores: [...matrimonios.directores, { usuario_id: 'u-x', nombre: 'Sin', apellido: 'Fila' }, 'no'] },
        { id: jovenes.id, nombre: jovenes.nombre },
      ],
    })
    expect(leido?.segmentos).toEqual([matrimonios, { ...jovenes, directores: [] }])
  })

  it('rejects an object without the actor or its capabilities', () => {
    expect(leerTemporadas(null)).toBeNull()
    expect(leerTemporadas([])).toBeNull()
    expect(leerTemporadas({ ...temporadas, usuario_id: null })).toBeNull()
    expect(leerTemporadas({ ...temporadas, puede_publicar: 'true' })).toBeNull()
  })
})

describe('leerBloqueos', () => {
  const bloqueo = { tipo: 'sin_localidad', segmento_id: 's1', grupo_id: 'g1', grupo_nombre: 'Grupo #9', usuario_id: null, detalle: 'No tiene localidad' }

  it('keeps the four known kinds', () => {
    const filas = ['sin_lider', 'sin_director', 'sin_localidad', 'persona_en_dos_grupos'].map((tipo) => ({ ...bloqueo, tipo }))
    expect(leerBloqueos(filas)).toEqual({ filas, descartadas: 0 })
  })

  it('drops an unknown kind or a row without group', () => {
    expect(leerBloqueos([{ ...bloqueo, tipo: 'otro' }, { ...bloqueo, grupo_id: null }])).toEqual({ filas: [], descartadas: 2 })
  })
})

describe('leerEstadoPublicacion', () => {
  const estado = {
    temporada: { id: 't2', nombre: '2026-II', estado: 'planificacion', activa: true, cohorte: 'II' },
    bloqueos: { total: 3, sin_lider: 1, sin_director: 0, sin_localidad: 2, persona_en_dos_grupos: 0 },
    grupos: 4,
    segmentos: [
      { id: 's1', nombre: 'Matrimonios', grupos: 3, bloqueos: 3, terminado: false, marcado_por: null, marcado_en: null },
      { id: 's2', nombre: 'Mujeres', grupos: 1, bloqueos: 0, terminado: true, marcado_por: { id: 'd1', nombre: 'Rosa Gil' }, marcado_en: '2026-11-05T14:00:00+00:00' },
    ],
    segmentos_con_grupos: 2,
    segmentos_terminados: 1,
    faltan_segmentos: 1,
    rol_puede_publicar: true,
    puede_publicar: false,
    origen: { id: 't0', nombre: '2025 - II', estado: 'finalizada', activa: false, grupos_a_archivar: 21 },
    otras_activas: [{ id: 't1', nombre: '2026-I', cohorte: 'I' }],
  }

  it('keeps a well-formed object exactly', () => {
    expect(leerEstadoPublicacion(estado)).toEqual(estado)
  })

  it('accepts a season without origin', () => {
    expect(leerEstadoPublicacion({ ...estado, origen: null })?.origen).toBeNull()
  })

  it('rejects an object without counts, season or flags', () => {
    expect(leerEstadoPublicacion(undefined)).toBeNull()
    expect(leerEstadoPublicacion({ ...estado, bloqueos: { total: 'tres' } })).toBeNull()
    expect(leerEstadoPublicacion({ ...estado, temporada: null })).toBeNull()
    expect(leerEstadoPublicacion({ ...estado, puede_publicar: null })).toBeNull()
    expect(leerEstadoPublicacion({ ...estado, faltan_segmentos: undefined })).toBeNull()
  })
})

describe('leerHistorial', () => {
  const paso = {
    paso_id: 'p1',
    numero: 12,
    accion: 'mover_personas',
    descripcion: 'movió a Ana Pérez a Grupo #14',
    creado_en: '2026-11-05T14:00:00+00:00',
    actor_id: 'u1',
    actor_nombre: 'Rosa Gil',
    segmentos: [{ id: 's1', nombre: 'Matrimonios' }],
    grupo_ids: ['g1'],
    usuario_ids: ['u9'],
    deshace_paso_id: null,
    deshecho_por: null,
    deshecho_por_nombre: null,
    puede_deshacer: true,
    motivo_no_deshacer: null,
  }

  it('keeps a well-formed step exactly', () => {
    expect(leerHistorial([paso])).toEqual({ filas: [paso], descartadas: 0 })
  })

  it('reads a bigint number sent as text', () => {
    expect(leerHistorial([{ ...paso, numero: '12' }]).filas[0].numero).toBe(12)
  })

  it('drops an unknown action, a step without id or without puede_deshacer', () => {
    expect(leerHistorial([{ ...paso, accion: 'borrar' }, { ...paso, paso_id: '' }, { ...paso, puede_deshacer: null }]).descartadas).toBe(3)
  })
})

describe('leerLocalidades', () => {
  it('keeps id, name and municipio; drops rows without id or name', () => {
    expect(
      leerLocalidades([
        { id: 'loc-cab', nombre: 'Cabudare', municipio_id: 'mun-pal', activo: true },
        { id: 'loc-x', nombre: 'Sin municipio', municipio_id: null },
        { id: null, nombre: 'x' },
      ]),
    ).toEqual({
      filas: [
        { id: 'loc-cab', nombre: 'Cabudare', municipio_id: 'mun-pal' },
        { id: 'loc-x', nombre: 'Sin municipio', municipio_id: null },
      ],
      descartadas: 1,
    })
  })
})
