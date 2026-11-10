/**
 * «Próximos cumpleaños» of the groups where the person is Miembro or Colíder
 * (odd/tasks/home-por-rol.md T8, S14a, L19): one call to
 * proximos_cumpleanos_mis_grupos, which answers from auth.uid() with the day
 * and month of the current groupmates (never the year). The loader keeps the
 * groups it was asked for and lists each person once.
 */
import { cargarCumpleanosGrupos, unirCumpleanos, type Cumpleanos } from '@/lib/inicio/cargar-cumpleanos'
import type { PedidoGruposMiembro } from '@/lib/inicio/cargar-grupos-miembro'
import type { ClienteInicio } from '@/lib/inicio/cargar-hechos'

type Resultado = { data: unknown; error: unknown }

const ok = (data: unknown): Resultado => ({ data, error: null })
const fallo = (mensaje: string): Resultado => ({ data: null, error: { message: mensaje } })

const fila = (usuario_id: string, nombre: string, apellido: string, grupo_id: string, grupo_nombre: string, proxima: string) => ({
  usuario_id,
  nombre,
  apellido,
  grupo_id,
  grupo_nombre,
  mes: Number(proxima.slice(5, 7)),
  dia: Number(proxima.slice(8, 10)),
  proxima,
})

const FILAS = [
  fila('u-2', 'Ana', 'Pérez', 'g-1', 'Matrimonios · Zona Este', '2026-11-10'),
  fila('u-7', 'Pedro', 'Rojas', 'g-2', 'Hombres +36', '2026-11-25'),
  fila('u-3', 'Luis', 'Torres', 'g-2', 'Hombres +36', '2026-12-10'),
  fila('u-3', 'Luis', 'Torres', 'g-1', 'Matrimonios · Zona Este', '2026-12-10'),
  // A group where the person is Líder: the leader's list already has it.
  fila('u-9', 'Zoe', 'Mora', 'g-9', 'Jóvenes', '2026-11-12'),
]

function cliente(respuesta: Resultado = ok(FILAS)) {
  return {
    rpc: jest.fn(() => Promise.resolve(respuesta)),
    from: jest.fn(),
  }
}

const PEDIDO: PedidoGruposMiembro = {
  authId: 'auth-1',
  usuarioId: 'u-1',
  hoy: '2026-11-10',
  grupos: [{ grupoId: 'g-1', nombre: 'Matrimonios' }],
}

const cargar = (c: ReturnType<typeof cliente>, pedido: Partial<PedidoGruposMiembro> = {}) =>
  cargarCumpleanosGrupos(c as unknown as ClienteInicio, { ...PEDIDO, ...pedido })

describe('cargarCumpleanosGrupos', () => {
  let consola: jest.SpyInstance

  beforeEach(() => {
    consola = jest.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => consola.mockRestore())

  it('una sola llamada a la RPC; solo los grupos pedidos, con el grupo como contexto y sin el año', async () => {
    const c = cliente()

    await expect(cargar(c)).resolves.toEqual([
      { id: 'u-2', nombre: 'Ana Pérez', fecha: '2026-11-10', contexto: 'Matrimonios · Zona Este' },
      { id: 'u-3', nombre: 'Luis Torres', fecha: '2026-12-10', contexto: 'Matrimonios · Zona Este' },
    ])
    expect(c.rpc).toHaveBeenCalledTimes(1)
    expect(c.rpc).toHaveBeenCalledWith('proximos_cumpleanos_mis_grupos', { p_dias: 30 })
    expect(c.from).not.toHaveBeenCalled()
  })

  it('una persona en dos de sus grupos sale una vez, bajo el primero de los pedidos', async () => {
    const lista = await cargar(cliente(), { grupos: [{ grupoId: 'g-1', nombre: null }, { grupoId: 'g-2', nombre: null }] })

    expect(lista).toEqual([
      { id: 'u-2', nombre: 'Ana Pérez', fecha: '2026-11-10', contexto: 'Matrimonios · Zona Este' },
      { id: 'u-7', nombre: 'Pedro Rojas', fecha: '2026-11-25', contexto: 'Hombres +36' },
      { id: 'u-3', nombre: 'Luis Torres', fecha: '2026-12-10', contexto: 'Matrimonios · Zona Este' },
    ])
  })

  it('sin nombre de grupo usa el nombre conocido; nunca lista a la persona ni filas incompletas', async () => {
    const c = cliente(
      ok([
        fila('u-1', 'Carlos', 'Mendoza', 'g-1', 'X', '2026-11-12'),
        { ...fila('u-4', 'Rosa', 'Díaz', 'g-1', '', '2026-11-20'), grupo_nombre: null },
        { ...fila('u-5', 'José', 'Rivas', 'g-1', 'X', '2026-11-21'), proxima: null },
        { ...fila('u-6', 'Marta', 'Gil', 'g-1', 'X', '2026-11-22'), usuario_id: null },
        null,
      ]),
    )

    await expect(cargar(c)).resolves.toEqual([{ id: 'u-4', nombre: 'Rosa Díaz', fecha: '2026-11-20', contexto: 'Matrimonios' }])
  })

  it('si la RPC falla o lanza queda vacía y lo registra', async () => {
    await expect(cargar(cliente(fallo('permission denied')))).resolves.toEqual([])
    expect(consola).toHaveBeenCalled()

    const lanza = cliente()
    lanza.rpc.mockRejectedValue(new Error('red caída'))
    await expect(cargar(lanza)).resolves.toEqual([])
  })

  it('sin grupos no consulta nada', async () => {
    const c = cliente()

    await expect(cargar(c, { grupos: [] })).resolves.toEqual([])
    expect(c.rpc).not.toHaveBeenCalled()
  })
})

describe('unirCumpleanos', () => {
  it('junta las listas sin repetir personas, ordenadas por fecha y nombre', () => {
    const delTablero: Cumpleanos[] = [
      { id: 'u-3', nombre: 'Luis Torres', fecha: '2026-11-12', contexto: 'Hombres +36' },
      { id: 'u-8', nombre: 'Zoe Mora', fecha: '2026-11-11', contexto: 'Hombres +36' },
    ]
    const deGrupos: Cumpleanos[] = [
      { id: 'u-3', nombre: 'Luis Torres', fecha: '2026-11-12', contexto: 'Matrimonios' },
      { id: 'u-2', nombre: 'Ana Pérez', fecha: '2026-11-11', contexto: 'Matrimonios' },
    ]

    expect(unirCumpleanos(delTablero, deGrupos)).toEqual([
      { id: 'u-2', nombre: 'Ana Pérez', fecha: '2026-11-11', contexto: 'Matrimonios' },
      { id: 'u-8', nombre: 'Zoe Mora', fecha: '2026-11-11', contexto: 'Hombres +36' },
      { id: 'u-3', nombre: 'Luis Torres', fecha: '2026-11-12', contexto: 'Hombres +36' },
    ])
  })
})
