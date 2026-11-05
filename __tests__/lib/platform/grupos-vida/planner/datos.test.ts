/**
 * Server loader of /grupos-vida/planificar (T5a of odd/tasks/planner-gdv.md).
 *
 * It reads with the user's session client only: planner_temporadas first (who
 * the actor is and which seasons exist), then the board, the bank, the
 * blockers and the publish state of the chosen season, plus the active
 * localidades. The client is a stub that records every call and answers from
 * the fixture of each RPC or table.
 */
import { cargarPlanner, elegirTemporada, mensajeErrorPlanner, type ClientePlanner } from '@/lib/platform/grupos-vida/planner/datos'

type Respuesta = { data: unknown; error: { code?: string; message?: string } | null }

const T_PLAN = 't-2026-ii'
const T_ACTIVA = 't-2026-i'
const T_VIEJA_PLAN = 't-2025-ii'

const temporada = (id: string, nombre: string, estado: string, fecha_inicio: string) => ({
  id,
  nombre,
  fecha_inicio,
  fecha_fin: null,
  estado,
  activa: estado === 'activa',
  cohorte: nombre.endsWith('II') ? 'II' : 'I',
  origen_id: null,
  origen_nombre: null,
})

const TEMPORADAS = {
  usuario_id: 'u-dg',
  ve_todos_los_segmentos: true,
  puede_publicar: true,
  puede_crear_temporada: true,
  segmentos_editables: ['seg-mat'],
  segmentos: [{ id: 'seg-mat', nombre: 'Matrimonios' }],
  // planner_temporadas orders by fecha_inicio DESC.
  temporadas: [
    temporada(T_PLAN, '2026-II', 'planificacion', '2026-10-12'),
    temporada(T_ACTIVA, '2026-I', 'activa', '2026-02-16'),
    temporada(T_VIEJA_PLAN, '2025 - II', 'planificacion', '2025-10-13'),
  ],
}

const GRUPO = {
  grupo_id: 'g1',
  nombre: 'Grupo #14 Los Escalona',
  segmento_id: 'seg-mat',
  segmento_nombre: 'Matrimonios',
  localidad_id: null,
  activo: true,
  lideres: [{ usuario_id: 'l1', nombre: 'Rafael', apellido: 'Escalona', lideres_origen: [] }],
  aprendices: [],
  miembros: [],
  directores: [],
}

const PERSONA = { usuario_id: 'p1', nombre: 'Ana', apellido: 'Pérez', edad: 41, tiene_direccion: false, otras_temporadas: [], origen_lideres: [] }

const BLOQUEO = { tipo: 'sin_localidad', segmento_id: 'seg-mat', grupo_id: 'g1', grupo_nombre: 'Grupo #14 Los Escalona', usuario_id: null, detalle: '' }

const ESTADO = {
  temporada: { id: T_PLAN, nombre: '2026-II', estado: 'planificacion', activa: false, cohorte: 'II' },
  bloqueos: { total: 1, sin_lider: 0, sin_director: 0, sin_localidad: 1, persona_en_dos_grupos: 0 },
  grupos: 1,
  segmentos: [],
  segmentos_con_grupos: 1,
  segmentos_terminados: 0,
  faltan_segmentos: 1,
  rol_puede_publicar: true,
  puede_publicar: false,
  origen: null,
  otras_activas: [],
}

const LOCALIDADES = [
  { id: 'loc-bqto', nombre: 'Barquisimeto', municipio_id: 'mun-iri' },
  { id: 'loc-cab', nombre: 'Cabudare', municipio_id: 'mun-pal' },
]

let respuestas: Record<string, Respuesta>
let llamadas: { nombre: string; args?: Record<string, unknown> }[]
let consultas: { tabla: string; ops: [string, unknown[]][] }[]

const ok = (data: unknown): Respuesta => ({ data, error: null })
const falla = (code: string, message: string): Respuesta => ({ data: null, error: { code, message } })

function cliente(): ClientePlanner {
  return {
    rpc: (nombre, args) => {
      llamadas.push({ nombre, args })
      return Promise.resolve(respuestas[nombre] ?? ok(null))
    },
    from: (tabla) => {
      const consulta = { tabla, ops: [] as [string, unknown[]][] }
      consultas.push(consulta)
      const cadena = {
        select: (...a: unknown[]) => (consulta.ops.push(['select', a]), cadena),
        eq: (...a: unknown[]) => (consulta.ops.push(['eq', a]), cadena),
        order: (...a: unknown[]) => {
          consulta.ops.push(['order', a])
          return Promise.resolve(respuestas[`tabla:${tabla}`] ?? ok([]))
        },
      }
      return cadena
    },
  }
}

let consola: jest.SpyInstance

afterEach(() => consola.mockRestore())

beforeEach(() => {
  // The loader logs the extras it could not read.
  consola = jest.spyOn(console, 'error').mockImplementation(() => undefined)
  llamadas = []
  consultas = []
  respuestas = {
    planner_temporadas: ok(TEMPORADAS),
    planner_tablero: ok([GRUPO]),
    planner_banco: ok([PERSONA]),
    planner_bloqueos: ok([BLOQUEO]),
    planner_estado_publicacion: ok(ESTADO),
    'tabla:campus_localidades': ok(LOCALIDADES),
  }
})

describe('cargarPlanner', () => {
  it('opens the most recent season in planning and reads its board, bank, blockers and publish state', async () => {
    const resultado = await cargarPlanner(cliente())

    expect(llamadas.map((l) => l.nombre).sort()).toEqual(
      ['planner_banco', 'planner_bloqueos', 'planner_estado_publicacion', 'planner_tablero', 'planner_temporadas'].sort(),
    )
    for (const llamada of llamadas.filter((l) => l.nombre !== 'planner_temporadas')) {
      expect(llamada.args).toEqual({ p_temporada_id: T_PLAN })
    }
    expect(resultado.tipo).toBe('listo')
    if (resultado.tipo !== 'listo') return
    expect(resultado.datos.temporada.id).toBe(T_PLAN)
    expect(resultado.datos.capacidades.puede_publicar).toBe(true)
    expect(resultado.datos.grupos.map((g) => g.grupo_id)).toEqual(['g1'])
    expect(resultado.datos.banco.map((p) => p.usuario_id)).toEqual(['p1'])
    expect(resultado.datos.bloqueos.map((b) => b.tipo)).toEqual(['sin_localidad'])
    expect(resultado.datos.estado?.faltan_segmentos).toBe(1)
    expect(resultado.datos.localidades).toEqual(LOCALIDADES)
    expect(resultado.datos.faltantes).toEqual([])
  })

  it('reads only the active localidades (id, nombre, municipio_id) with the session client', async () => {
    await cargarPlanner(cliente())

    expect(consultas).toEqual([
      {
        tabla: 'campus_localidades',
        ops: [
          ['select', ['id, nombre, municipio_id']],
          ['eq', ['activo', true]],
          ['order', ['nombre']],
        ],
      },
    ])
  })

  it('opens the season of ?temporada= when it exists, whatever its state', async () => {
    const resultado = await cargarPlanner(cliente(), T_ACTIVA)

    expect(resultado.tipo === 'listo' && resultado.datos.temporada.id).toBe(T_ACTIVA)
    expect(llamadas.find((l) => l.nombre === 'planner_tablero')?.args).toEqual({ p_temporada_id: T_ACTIVA })
  })

  it('falls back to the season in planning for an unknown ?temporada=', async () => {
    const resultado = await cargarPlanner(cliente(), 'no-existe')

    expect(resultado.tipo === 'listo' && resultado.datos.temporada.id).toBe(T_PLAN)
  })

  it('returns sin_temporada with the capabilities when no season is in planning, without reading a board', async () => {
    respuestas.planner_temporadas = ok({ ...TEMPORADAS, temporadas: [temporada(T_ACTIVA, '2026-I', 'activa', '2026-02-16')] })

    const resultado = await cargarPlanner(cliente())

    expect(resultado.tipo).toBe('sin_temporada')
    expect(resultado.tipo === 'sin_temporada' && resultado.capacidades.puede_crear_temporada).toBe(true)
    expect(llamadas.map((l) => l.nombre)).toEqual(['planner_temporadas'])
  })

  it('returns sin_acceso when planner_temporadas refuses the role (42501)', async () => {
    respuestas.planner_temporadas = falla('42501', 'No tienes permiso para usar el planificador')

    expect(await cargarPlanner(cliente())).toEqual({ tipo: 'sin_acceso' })
    expect(llamadas.map((l) => l.nombre)).toEqual(['planner_temporadas'])
  })

  it('returns an error when planner_temporadas has no actor or capabilities', async () => {
    respuestas.planner_temporadas = ok({ temporadas: [] })

    expect(await cargarPlanner(cliente())).toEqual({ tipo: 'error', mensaje: 'No se pudo cargar el planificador. Recarga la página.' })
  })

  it('maps a 22023 of the board to its message', async () => {
    respuestas.planner_tablero = falla('22023', 'La temporada no existe')

    expect(await cargarPlanner(cliente())).toEqual({ tipo: 'error', mensaje: 'La temporada no existe.' })
  })

  it('fails when the bank or the blockers cannot be read', async () => {
    respuestas.planner_banco = falla('XX000', 'boom')
    expect(await cargarPlanner(cliente())).toEqual({ tipo: 'error', mensaje: 'No se pudo cargar el planificador. Recarga la página.' })

    respuestas.planner_banco = ok([PERSONA])
    respuestas.planner_bloqueos = falla('42501', 'No tienes permiso para usar el planificador')
    expect(await cargarPlanner(cliente())).toEqual({ tipo: 'sin_acceso' })
  })

  it('opens the board without localidades when campus_localidades cannot be read', async () => {
    respuestas['tabla:campus_localidades'] = falla('42501', 'permission denied for table campus_localidades')

    const resultado = await cargarPlanner(cliente())

    expect(resultado.tipo).toBe('listo')
    if (resultado.tipo !== 'listo') return
    expect(resultado.datos.localidades).toEqual([])
    expect(resultado.datos.faltantes).toEqual(['localidades'])
    expect(consola).toHaveBeenCalledWith('[grupos-vida/planificar] campus_localidades failed', expect.objectContaining({ code: '42501' }))
  })

  it('opens the board without the publish state when planner_estado_publicacion fails or is malformed', async () => {
    respuestas.planner_estado_publicacion = ok({ temporada: null })

    const resultado = await cargarPlanner(cliente())

    expect(resultado.tipo === 'listo' && resultado.datos.estado).toBeNull()
    expect(resultado.tipo === 'listo' && resultado.datos.faltantes).toEqual(['estado_publicacion'])
  })

  it('drops board rows the T4 reader cannot use', async () => {
    respuestas.planner_tablero = ok([GRUPO, { grupo_id: 'g-roto' }])

    const resultado = await cargarPlanner(cliente())

    expect(resultado.tipo === 'listo' && resultado.datos.grupos.map((g) => g.grupo_id)).toEqual(['g1'])
  })
})

describe('elegirTemporada', () => {
  const temporadas = TEMPORADAS.temporadas.map((t) => ({ ...t, cohorte: t.cohorte as 'I' | 'II' }))

  it('prefers the requested season, then the most recent in planning, else null', () => {
    expect(elegirTemporada(temporadas, T_ACTIVA)?.id).toBe(T_ACTIVA)
    expect(elegirTemporada(temporadas, null)?.id).toBe(T_PLAN)
    expect(elegirTemporada(temporadas.filter((t) => t.estado !== 'planificacion'), null)).toBeNull()
  })
})

describe('mensajeErrorPlanner', () => {
  it('says why in Spanish by SQLSTATE', () => {
    expect(mensajeErrorPlanner({ code: '42501', message: 'x' })).toBe('No tienes permiso para usar el planificador.')
    expect(mensajeErrorPlanner({ code: '28000', message: 'No autenticado' })).toBe('Tu sesión terminó. Vuelve a entrar.')
    expect(mensajeErrorPlanner({ code: '22023', message: 'La temporada no existe' })).toBe('La temporada no existe.')
    expect(mensajeErrorPlanner({ code: '22023', message: 'Elige un grupo.' })).toBe('Elige un grupo.')
    expect(mensajeErrorPlanner({ code: 'XX000', message: 'boom' })).toBe('No se pudo cargar el planificador. Recarga la página.')
    expect(mensajeErrorPlanner(null)).toBe('No se pudo cargar el planificador. Recarga la página.')
  })
})
