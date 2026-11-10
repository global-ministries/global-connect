/**
 * cargarACargo (lib/inicio/cargar-a-cargo.ts; odd/tasks/home-por-rol.md T4,
 * S5–S7) with a mocked session client: each cargo reads only its own scope,
 * and a cargo whose read fails comes back null without taking the others.
 */
import { cargarACargo, semanaAnterior } from '@/lib/inicio/cargar-a-cargo'
import type { ClienteInicio } from '@/lib/inicio/cargar-hechos'

const cargarGruposMiembro = jest.fn()
jest.mock('@/lib/inicio/cargar-grupos-miembro', () => ({ cargarGruposMiembro: (...a: unknown[]) => cargarGruposMiembro(...a) }))

type Resultado = { data?: unknown; error?: unknown; count?: number | null }
type Llamada = [metodo: string, ...args: unknown[]]
type Responder = (tabla: string, llamadas: Llamada[]) => Resultado

const METODOS = ['select', 'eq', 'is', 'in', 'gte', 'lte', 'lt', 'neq', 'order', 'limit', 'range']

function cliente(responder: Responder, rpcs: Record<string, Resultado> = {}) {
  const consultas: { tabla: string; llamadas: Llamada[] }[] = []
  const from = jest.fn((tabla: string) => {
    const llamadas: Llamada[] = []
    consultas.push({ tabla, llamadas })
    const q: Record<string, unknown> = {}
    for (const m of METODOS) {
      q[m] = jest.fn((...args: unknown[]) => {
        llamadas.push([m, ...args])
        return q
      })
    }
    const resolver = () => ({ data: null, error: null, ...responder(tabla, llamadas) })
    q.maybeSingle = jest.fn(() => Promise.resolve().then(resolver))
    q.then = (ok: (r: unknown) => unknown, mal: (e: unknown) => unknown) => Promise.resolve().then(resolver).then(ok, mal)
    return q
  })
  const rpc = jest.fn((nombre: string) => Promise.resolve({ data: null, error: null, ...rpcs[nombre] }))
  return { from, rpc, consultas }
}

const tiene = (llamadas: Llamada[], metodo: string, ...args: unknown[]) => llamadas.some(([m, ...a]) => m === metodo && args.every((v, i) => JSON.stringify(a[i]) === JSON.stringify(v)))
const esConteo = (llamadas: Llamada[]) => llamadas.some(([m, , opciones]) => m === 'select' && (opciones as { head?: boolean } | undefined)?.head === true)

const HOY = '2026-11-09'
const BASE = { authId: 'auth-1', usuarioId: 'u-1', hoy: HOY }
const cargar = (c: ReturnType<typeof cliente>, cargos: Parameters<typeof cargarACargo>[1]['cargos'], tablero?: Parameters<typeof cargarACargo>[1]['tablero']) =>
  cargarACargo(c as unknown as ClienteInicio, { ...BASE, cargos, tablero })

describe('semanaAnterior', () => {
  it('es el lunes a domingo antes de la semana de hoy', () => {
    expect(semanaAnterior('2026-11-09')).toEqual({ desde: '2026-11-02', hasta: '2026-11-08' })
    expect(semanaAnterior('2026-11-15')).toEqual({ desde: '2026-11-02', hasta: '2026-11-08' })
  })
})

describe('cargarACargo', () => {
  let consola: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    consola = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    cargarGruposMiembro.mockResolvedValue({
      'g-1': { grupoId: 'g-1', nombre: 'Hombres +36 · Cabudare Este', proximaReunion: { fecha: '2026-11-12', hora: '19:30' }, lugar: 'Casa de los Linárez' },
    })
  })

  afterEach(() => consola.mockRestore())

  it('líder: su grupo con miembros, asistencia de la última reunión, ausentes, nuevos y cumpleaños', async () => {
    const c = cliente((tabla, llamadas) => {
      if (tabla === 'v_salud_miembros_grupo')
        return {
          data: [
            { usuario_id: 'a', nombre_completo: 'Pedro Linárez', semanas_ausente: 3 },
            { usuario_id: 'b', nombre_completo: 'Jesús Escalona', semanas_ausente: 5 },
            { usuario_id: 'c', nombre_completo: 'Ramón Pérez', semanas_ausente: 0 },
            { usuario_id: 'd', nombre_completo: 'Luis Torres', semanas_ausente: null },
          ],
        }
      if (tabla === 'eventos_grupo') return { data: [{ id: 'e-3', fecha: '2026-11-05', no_hubo_reunion: true }, { id: 'e-2', fecha: '2026-10-29', no_hubo_reunion: null }] }
      if (tabla === 'asistencia') return tiene(llamadas, 'eq', 'evento_grupo_id', 'e-2') ? { data: [{ presente: true }, { presente: true }, { presente: false }] } : { data: [] }
      if (tabla === 'grupo_miembros' && esConteo(llamadas)) return { count: 1 }
      return { data: [] }
    })
    const tablero = Promise.resolve({ rol: 'lider', widgets: { proximos_cumpleanos_grupo: [{ nombre_completo: 'Ramón Pérez', proximo: '2026-11-12' }] } })

    const [grupo] = await cargar(c, [{ tipo: 'grupo-lider', grupoId: 'g-1', nombre: 'Hombres +36' }], tablero)

    expect(grupo).toEqual({
      tipo: 'grupo-lider',
      grupoId: 'g-1',
      nombre: 'Hombres +36 · Cabudare Este',
      proximaReunion: { fecha: '2026-11-12', hora: '19:30' },
      lugar: 'Casa de los Linárez',
      miembros: 4,
      ultimaReunion: { fecha: '2026-10-29', asistencia: 67 },
      ausentes: ['Pedro Linárez', 'Jesús Escalona'],
      nuevos: 1,
      cumpleanos: [{ nombre: 'Ramón Pérez', fecha: '2026-11-12' }],
    })
    const nuevos = c.consultas.find((q) => q.tabla === 'grupo_miembros')
    expect(tiene(nuevos!.llamadas, 'gte', 'fecha_asignacion', '2026-10-10')).toBe(true)
  })

  it('líder de dos grupos: sin los cumpleaños del tablero, que mezcla los grupos', async () => {
    const c = cliente(() => ({ data: [] }))
    const tablero = Promise.resolve({ rol: 'lider', widgets: { proximos_cumpleanos_grupo: [{ nombre_completo: 'Ramón Pérez', proximo: '2026-11-12' }] } })

    const datos = await cargar(
      c,
      [
        { tipo: 'grupo-lider', grupoId: 'g-1', nombre: 'Hombres +36' },
        { tipo: 'grupo-lider', grupoId: 'g-2', nombre: 'Jóvenes' },
      ],
      tablero,
    )

    expect(datos.map((d) => d?.tipo === 'grupo-lider' && d.cumpleanos)).toEqual([[], []])
  })

  it('etapa: sus grupos de la semana pasada, en riesgo y sin reporte', async () => {
    const c = cliente((tabla, llamadas) => {
      if (tabla === 'segmento_lideres') return { data: { id: 'sl-1', segmento: { nombre: 'Mujeres +36' } } }
      if (tabla === 'director_etapa_grupos')
        return { data: [{ director_etapa_id: 'sl-1', grupo_id: 'g-1' }, { director_etapa_id: 'sl-1', grupo_id: 'g-2' }, { director_etapa_id: 'sl-1', grupo_id: 'g-3' }, { director_etapa_id: 'sl-1', grupo_id: 'g-x' }] }
      if (tabla === 'grupos')
        return {
          data: [
            { id: 'g-1', nombre: 'El Ujano', activo: true, eliminado: false },
            { id: 'g-2', nombre: 'Centro', activo: true, eliminado: null },
            { id: 'g-3', nombre: 'Santa Rosa', activo: true, eliminado: false },
            { id: 'g-x', nombre: 'Borrado', activo: true, eliminado: true },
          ],
        }
      if (tabla === 'eventos_grupo')
        return { data: [{ id: 'e-1', grupo_id: 'g-1', no_hubo_reunion: false }, { id: 'e-2', grupo_id: 'g-2', no_hubo_reunion: true }] }
      if (tabla === 'asistencia') return { data: [{ id: 'a1', evento_grupo_id: 'e-1', presente: true }, { id: 'a2', evento_grupo_id: 'e-1', presente: false }, { id: 'a3', evento_grupo_id: 'e-1', presente: false }] }
      if (tabla === 'grupo_miembros') return esConteo(llamadas) ? { count: 40 } : { data: [{ grupo_id: 'g-1', usuario: { nombre: 'Yelitza', apellido: 'Rodríguez' } }] }
      return { data: [] }
    })

    const [etapa] = await cargar(c, [{ tipo: 'etapa', directorEtapaId: 'sl-1' }])

    expect(etapa).toEqual({
      tipo: 'etapa',
      directorEtapaId: 'sl-1',
      nombre: 'Mujeres +36',
      grupos: [
        { grupoId: 'g-1', nombre: 'El Ujano', lideres: ['Yelitza Rodríguez'], asistencia: 33, reporto: true },
        { grupoId: 'g-2', nombre: 'Centro', lideres: [], asistencia: null, reporto: true },
        { grupoId: 'g-3', nombre: 'Santa Rosa', lideres: [], asistencia: null, reporto: false },
      ],
      personas: 40,
      asistencia: 33,
      enRiesgo: 1,
      sinReporte: 1,
    })
    const eventos = c.consultas.find((q) => q.tabla === 'eventos_grupo')!.llamadas
    expect(tiene(eventos, 'gte', 'fecha', '2026-11-02')).toBe(true)
    expect(tiene(eventos, 'lte', 'fecha', '2026-11-08')).toBe(true)
    // Attendance of an event «no hubo reunión» is not read.
    expect(tiene(c.consultas.find((q) => q.tabla === 'asistencia')!.llamadas, 'in', 'evento_grupo_id', ['e-1'])).toBe(true)
  })

  it('segmento con alcance «directores»: solo las etapas marcadas, nunca todo el segmento ni el campus', async () => {
    const c = cliente((tabla) => {
      if (tabla === 'segmentos') return { data: { nombre: 'Matrimonios' } }
      if (tabla === 'director_general_segmentos') return { data: { alcance: 'directores' } }
      if (tabla === 'segmento_lideres')
        return {
          data: [
            { id: 'sl-a', usuario: { nombre: 'Andrés', apellido: 'Rivas' } },
            { id: 'sl-a', usuario: { nombre: 'Paola', apellido: 'Rivas' } },
            { id: 'sl-b', usuario: { nombre: 'Carlos', apellido: 'Oropeza' } },
          ],
        }
      if (tabla === 'dg_directores_etapa') return { data: [{ segmento_lider_id: 'sl-a' }] }
      if (tabla === 'director_etapa_grupos') return { data: [{ director_etapa_id: 'sl-a', grupo_id: 'g-1' }] }
      if (tabla === 'grupos') return { data: [{ id: 'g-1', nombre: 'La Rosaleda', activo: true, eliminado: false }] }
      return { data: [] }
    })

    const [segmento] = await cargar(c, [{ tipo: 'segmento', segmentoId: 'seg-1' }])

    expect(segmento).toMatchObject({
      tipo: 'segmento',
      segmentoId: 'seg-1',
      nombre: 'Matrimonios',
      grupos: [{ grupoId: 'g-1', reporto: false }],
      sinReporte: 1,
      etapas: [{ directorEtapaId: 'sl-a', directores: ['Andrés Rivas', 'Paola Rivas'], grupos: [{ grupoId: 'g-1' }] }],
    })
    const enlaces = c.consultas.find((q) => q.tabla === 'director_etapa_grupos')!.llamadas
    expect(tiene(enlaces, 'in', 'director_etapa_id', ['sl-a'])).toBe(true)
    // The segment's groups are only read by segmento_id with alcance «segmento».
    expect(c.consultas.some((q) => q.tabla === 'grupos' && tiene(q.llamadas, 'eq', 'segmento_id', 'seg-1'))).toBe(false)
  })

  it('segmento con alcance «segmento»: todos sus grupos', async () => {
    const c = cliente((tabla, llamadas) => {
      if (tabla === 'director_general_segmentos') return { data: { alcance: 'segmento' } }
      if (tabla === 'segmento_lideres') return { data: [] }
      if (tabla === 'grupos')
        return tiene(llamadas, 'eq', 'segmento_id', 'seg-1')
          ? { data: [{ id: 'g-1' }, { id: 'g-2' }] }
          : { data: [{ id: 'g-1', nombre: 'A', activo: true }, { id: 'g-2', nombre: 'B', activo: true }] }
      return { data: [] }
    })

    const [segmento] = await cargar(c, [{ tipo: 'segmento', segmentoId: 'seg-1' }])

    expect(segmento?.tipo === 'segmento' && segmento.grupos.map((g) => g.grupoId)).toEqual(['g-1', 'g-2'])
    expect(c.consultas.some((q) => q.tabla === 'dg_directores_etapa')).toBe(false)
  })

  it('área de Dream Team: su árbol, sus conteos y quienes no tienen Próximo Paso', async () => {
    const c = cliente(
      (tabla) => {
        if (tabla === 'dream_team_equipos')
          return {
            data: [
              { id: 'eq-ninos', label: 'Dirección de Niños', parent_equipo_id: 'eq-dps' },
              { id: 'eq-waumba', label: 'Waumba Land', parent_equipo_id: 'eq-ninos' },
              { id: 'eq-salon', label: 'Salón 6', parent_equipo_id: 'eq-waumba' },
              { id: 'eq-otro', label: 'Bienvenida', parent_equipo_id: 'eq-dps' },
            ],
          }
        if (tabla === 'dream_team_servicios')
          return {
            data: [
              { id: 's1', persona_id: 'p-andrea', estado: 'postulado', equipo_id: 'eq-waumba', persona: { nombre: 'Andrea', apellido: 'Colmenares' } },
              { id: 's2', persona_id: 'p-andrea', estado: 'activo', equipo_id: 'eq-salon', persona: { nombre: 'Andrea', apellido: 'Colmenares' } },
              { id: 's3', persona_id: 'p-yus', estado: 'en_orientacion', equipo_id: 'eq-ninos', persona: { nombre: 'Yusmary', apellido: 'Torres' } },
              { id: 's4', persona_id: 'p-hecho', estado: 'activo', equipo_id: 'eq-salon', persona: { nombre: 'Rosa', apellido: 'Díaz' } },
            ],
          }
        return { data: [] }
      },
      {
        personas_con_proximo_paso: { data: ['p-hecho'] },
        proximo_paso_puede_marcar: { data: true },
        dream_team_pendientes_resumen: { data: [{ sin_turno: 3 }] },
      },
    )

    const [area] = await cargar(c, [{ tipo: 'area-dream-team', equipoId: 'eq-ninos', servicioId: 's-dir' }])

    expect(area).toEqual({
      tipo: 'area-dream-team',
      equipoId: 'eq-ninos',
      nombre: 'Dirección de Niños',
      activos: 2,
      postulados: 1,
      enOrientacion: 1,
      sinTurno: 3,
      sinProximoPaso: [
        { usuarioId: 'p-andrea', nombre: 'Andrea Colmenares', estado: 'postulado', equipo: 'Waumba Land' },
        { usuarioId: 'p-yus', nombre: 'Yusmary Torres', estado: 'en_orientacion', equipo: 'Dirección de Niños' },
      ],
    })
    const servicios = c.consultas.find((q) => q.tabla === 'dream_team_servicios')!.llamadas
    expect(tiene(servicios, 'in', 'equipo_id', ['eq-ninos', 'eq-waumba', 'eq-salon'])).toBe(true)
    expect(tiene(servicios, 'in', 'estado', ['postulado', 'en_orientacion', 'activo'])).toBe(true)
    expect(c.rpc).toHaveBeenCalledWith('personas_con_proximo_paso', { p_ids: ['p-andrea', 'p-yus', 'p-hecho'] })
  })

  it('área: quien no puede marcar no ve la lista', async () => {
    const c = cliente(
      (tabla) =>
        tabla === 'dream_team_servicios'
          ? { data: [{ id: 's1', persona_id: 'p-1', estado: 'postulado', equipo_id: 'eq-1', persona: { nombre: 'Ana' } }] }
          : { data: [{ id: 'eq-1', label: 'Bienvenida', parent_equipo_id: null }] },
      { personas_con_proximo_paso: { data: [] }, proximo_paso_puede_marcar: { data: false } },
    )

    const [area] = await cargar(c, [{ tipo: 'area-dream-team', equipoId: 'eq-1', servicioId: 's-dir' }])

    expect(area).toMatchObject({ postulados: 1, sinProximoPaso: [] })
  })

  it('un cargo que falla queda null y los demás siguen', async () => {
    const c = cliente((tabla) => {
      if (tabla === 'director_etapa_grupos') return { error: { message: 'permission denied' } }
      return { data: [] }
    })

    const datos = await cargar(c, [
      { tipo: 'grupo-lider', grupoId: 'g-1', nombre: 'Hombres +36' },
      { tipo: 'etapa', directorEtapaId: 'sl-1' },
    ])

    expect(datos[0]).toMatchObject({ tipo: 'grupo-lider', grupoId: 'g-1' })
    expect(datos[1]).toBeNull()
    expect(consola).toHaveBeenCalledWith('Inicio: no se pudo leer etapa:sl-1:', 'permission denied')
  })
})
