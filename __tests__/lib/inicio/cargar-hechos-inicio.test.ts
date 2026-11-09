import { cargarHechosInicio, type ClienteInicio } from '@/lib/inicio/cargar-hechos'
import { HECHOS_VACIOS } from '@/lib/inicio/hechos'

const adminFrom = jest.fn()
const obtenerCasasRevisionPendiente = jest.fn()
const obtenerGruposSinCasaAnfitriona = jest.fn()
const cargarPendientesCargo = jest.fn()

jest.mock('@/lib/inicio/cargar-pendientes', () => ({ cargarPendientesCargo: (...a: unknown[]) => cargarPendientesCargo(...a) }))
jest.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: () => ({ from: adminFrom }) }))
jest.mock('@/lib/actions/casas-anfitrionas.actions', () => ({
  obtenerCasasRevisionPendiente: () => obtenerCasasRevisionPendiente(),
  obtenerGruposSinCasaAnfitriona: (input: unknown) => obtenerGruposSinCasaAnfitriona(input),
}))

type Resultado = { data: unknown; error: unknown }

// Chainable PostgREST query that resolves to one result.
function consulta(resultado: Resultado | (() => never)) {
  const q: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'is', 'in']) q[m] = jest.fn(() => q)
  const resolver = () => (typeof resultado === 'function' ? resultado() : resultado)
  q.maybeSingle = jest.fn(() => Promise.resolve().then(resolver))
  q.then = (ok: (r: Resultado) => unknown, mal: (e: unknown) => unknown) => Promise.resolve().then(resolver).then(ok, mal)
  return q
}

const ok = (data: unknown): Resultado => ({ data, error: null })
const fallo = (mensaje: string): Resultado => ({ data: null, error: { message: mensaje } })

function clienteSesion(tablas: Record<string, Resultado | (() => never)>, rpcs: Record<string, Resultado | (() => never)>) {
  return {
    from: jest.fn((tabla: string) => consulta(tablas[tabla] ?? ok([]))),
    rpc: jest.fn((nombre: string) => {
      const r = rpcs[nombre] ?? ok(null)
      return Promise.resolve().then(() => (typeof r === 'function' ? r() : r))
    }),
  }
}

const TABLAS = {
  grupo_miembros: ok([
    { grupo_id: 'g-1', rol: 'Líder', estado: 'activo', grupo: { nombre: 'Hombres +36', activo: true, eliminado: false } },
    { grupo_id: 'g-2', rol: 'Colíder', estado: null, grupo: { nombre: 'Matrimonios', activo: true, eliminado: false } },
    { grupo_id: 'g-3', rol: 'Miembro', estado: 'inactivo', grupo: { nombre: 'Viejo', activo: true, eliminado: false } },
    { grupo_id: 'g-4', rol: 'Miembro', estado: 'activo', grupo: { nombre: 'Borrado', activo: true, eliminado: true } },
  ]),
  segmento_lideres: ok([{ id: 'sl-1' }]),
  director_general_segmentos: ok([{ segmento_id: 'seg-1' }]),
  dream_team_servicios: ok([
    { id: 's-1', equipo_id: 'eq-ninos', rol: { nivel: 'director' } },
    { id: 's-2', equipo_id: 'eq-host', rol: null },
  ]),
}

const RPCS = {
  es_admin_o_pastor: ok(false),
  contar_solicitudes_pendientes: ok(2),
  ninos_mis_hijos: ok([{ id: 'n-1', nombre: 'Sofía' }, { id: 'n-2', nombre: 'Mateo' }]),
  hizo_proximo_paso: ok(true),
}

function preparar({ usuario = ok({ id: 'u-1', telefono: '0414', fecha_nacimiento: '1990-05-01' }) as Resultado, tablas = {}, rpcs = {} } = {}) {
  adminFrom.mockImplementation(() => consulta(usuario))
  return clienteSesion({ ...TABLAS, ...tablas }, { ...RPCS, ...rpcs })
}

const cargar = (cliente: ReturnType<typeof clienteSesion>) => cargarHechosInicio(cliente as unknown as ClienteInicio, { id: 'auth-1' })

describe('cargarHechosInicio', () => {
  let consoleError: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    obtenerCasasRevisionPendiente.mockResolvedValue({ success: true, data: [{}, {}, {}] })
    obtenerGruposSinCasaAnfitriona.mockResolvedValue({ success: true, data: [{}] })
    cargarPendientesCargo.mockResolvedValue({ reportesSinCargar: 0, lideresSinReporte: 0, marcarProximoPaso: 0 })
  })

  afterEach(() => consoleError.mockRestore())

  it('junta los hechos de cada fuente', async () => {
    const cliente = preparar()

    await expect(cargar(cliente)).resolves.toEqual({
      ...HECHOS_VACIOS,
      usuarioId: 'u-1',
      esAdminOPastor: false,
      grupos: [
        { grupoId: 'g-1', nombre: 'Hombres +36', rol: 'Líder' },
        { grupoId: 'g-2', nombre: 'Matrimonios', rol: 'Colíder' },
      ],
      etapasDirigidas: ['sl-1'],
      segmentosDirigidos: ['seg-1'],
      serviciosActivos: [
        { servicioId: 's-1', equipoId: 'eq-ninos', nivel: 'director' },
        { servicioId: 's-2', equipoId: 'eq-host', nivel: null },
      ],
      hijos: 2,
      perfilCompleto: true,
      hizoProximoPaso: true,
      pendientes: { ...HECHOS_VACIOS.pendientes, solicitudesGrupo: 2, casasPorRevisar: 3, gruposSinCasa: 1 },
    })
    expect(cliente.rpc).toHaveBeenCalledWith('es_admin_o_pastor', { p_auth_id: 'auth-1' })
    expect(cliente.rpc).toHaveBeenCalledWith('hizo_proximo_paso', { p_usuario_id: 'u-1' })
    expect(obtenerGruposSinCasaAnfitriona).toHaveBeenCalledWith({ scope: 'active' })
    expect(consoleError).not.toHaveBeenCalled()
  })

  it('una fuente que falla queda vacía sin romper las demás', async () => {
    const cliente = preparar({
      tablas: { grupo_miembros: fallo('permission denied') },
      rpcs: {
        ninos_mis_hijos: () => {
          throw new Error('timeout')
        },
        hizo_proximo_paso: fallo('function hizo_proximo_paso does not exist'),
      },
    })
    obtenerCasasRevisionPendiente.mockRejectedValue(new Error('caído'))

    const hechos = await cargar(cliente)

    expect(hechos.grupos).toEqual([])
    expect(hechos.hijos).toBe(0)
    expect(hechos.hizoProximoPaso).toBeNull()
    expect(hechos.pendientes.casasPorRevisar).toBe(0)
    expect(hechos.etapasDirigidas).toEqual(['sl-1'])
    expect(hechos.serviciosActivos).toHaveLength(2)
    expect(hechos.pendientes.solicitudesGrupo).toBe(2)
    expect(consoleError).toHaveBeenCalledTimes(4)
  })

  it('cuenta los pendientes de lo que tiene a cargo', async () => {
    cargarPendientesCargo.mockResolvedValue({ reportesSinCargar: 1, lideresSinReporte: 4, marcarProximoPaso: 3 })
    const cliente = preparar()

    const hechos = await cargar(cliente)

    expect(cargarPendientesCargo).toHaveBeenCalledWith(cliente, {
      usuarioId: 'u-1',
      hoy: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      gruposLider: ['g-1'],
      etapas: ['sl-1'],
      segmentos: ['seg-1'],
      areas: ['eq-ninos'],
    })
    expect(hechos.pendientes).toMatchObject({ reportesSinCargar: 1, lideresSinReporte: 4, marcarProximoPaso: 3, solicitudesGrupo: 2 })
  })

  it('sin cargos no busca pendientes de cargo', async () => {
    const cliente = preparar({ tablas: { grupo_miembros: ok([]), segmento_lideres: ok([]), director_general_segmentos: ok([]), dream_team_servicios: ok([]) } })

    await cargar(cliente)

    expect(cargarPendientesCargo).not.toHaveBeenCalled()
  })

  it('marca el perfil incompleto sin teléfono o fecha de nacimiento', async () => {
    const hechos = await cargar(preparar({ usuario: ok({ id: 'u-1', telefono: ' ', fecha_nacimiento: '1990-05-01' }) }))
    expect(hechos.perfilCompleto).toBe(false)
  })

  it('a un menor no le busca hijos', async () => {
    const cliente = preparar({ usuario: ok({ id: 'u-1', telefono: '0414', fecha_nacimiento: '2015-01-01' }) })
    const hechos = await cargar(cliente)
    expect(hechos.hijos).toBe(0)
    expect(cliente.rpc).not.toHaveBeenCalledWith('ninos_mis_hijos')
  })

  it('sin fila en usuarios devuelve los hechos vacíos', async () => {
    const cliente = preparar({ usuario: ok(null) })
    await expect(cargar(cliente)).resolves.toEqual(HECHOS_VACIOS)
    expect(cliente.from).not.toHaveBeenCalled()
  })
})
