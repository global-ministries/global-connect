/**
 * «Próximos cumpleaños» of the groups where the person is Miembro or Colíder
 * (odd/tasks/home-por-rol.md T8, S14a): the members come from
 * obtener_detalle_grupo and their birth dates from usuarios, read with the
 * session (RLS decides which rows come back). Only the next birthday's date
 * leaves the loader, never the birth year.
 */
import { cargarCumpleanosGrupos, unirCumpleanos, type Cumpleanos } from '@/lib/inicio/cargar-cumpleanos'
import type { PedidoGruposMiembro } from '@/lib/inicio/cargar-grupos-miembro'
import type { ClienteInicio } from '@/lib/inicio/cargar-hechos'

type Resultado = { data: unknown; error: unknown }

const ok = (data: unknown): Resultado => ({ data, error: null })
const fallo = (mensaje: string): Resultado => ({ data: null, error: { message: mensaje } })

function consulta(resultado: Resultado) {
  const q: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'in']) q[m] = jest.fn(() => q)
  q.then = (bien: (r: Resultado) => unknown, mal: (e: unknown) => unknown) => Promise.resolve(resultado).then(bien, mal)
  return q
}

const miembro = (id: string, nombre: string, apellido: string, rol = 'Miembro') => ({ id, nombre, apellido, rol, telefono: null })

const DETALLES: Record<string, Resultado> = {
  'g-1': ok({
    nombre: 'Matrimonios · Zona Este',
    miembros: [
      miembro('u-1', 'Carlos', 'Mendoza'),
      miembro('u-2', 'Ana', 'Pérez', 'Líder'),
      miembro('u-3', 'Luis', 'Torres'),
      miembro('u-4', 'Rosa', 'Díaz'),
      miembro('u-5', 'José', 'Rivas'),
      miembro('u-6', 'Marta', 'Gil'),
    ],
  }),
  'g-2': ok({ nombre: 'Hombres +36', miembros: [miembro('u-3', 'Luis', 'Torres'), miembro('u-7', 'Pedro', 'Rojas', 'Colíder')] }),
}

const NACIMIENTOS = [
  { id: 'u-1', fecha_nacimiento: '1990-11-12' },
  { id: 'u-2', fecha_nacimiento: '1990-11-10' },
  { id: 'u-3', fecha_nacimiento: '1985-12-10' },
  { id: 'u-4', fecha_nacimiento: '1980-12-11' },
  { id: 'u-5', fecha_nacimiento: null },
  { id: 'u-6', fecha_nacimiento: '1975-11-09' },
  { id: 'u-7', fecha_nacimiento: '1999-11-25' },
]

function cliente({ detalles = DETALLES, usuarios = ok(NACIMIENTOS) }: { detalles?: Record<string, Resultado>; usuarios?: Resultado } = {}) {
  const tabla = consulta(usuarios)
  return {
    tabla,
    rpc: jest.fn((_fn: string, args: { p_grupo_id: string }) => Promise.resolve(detalles[args.p_grupo_id] ?? ok(null))),
    from: jest.fn(() => tabla),
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

  it('los de los próximos 30 días, sin la persona, con el grupo como contexto y sin el año', async () => {
    const c = cliente()

    await expect(cargar(c)).resolves.toEqual([
      { id: 'u-2', nombre: 'Ana Pérez', fecha: '2026-11-10', contexto: 'Matrimonios · Zona Este' },
      { id: 'u-3', nombre: 'Luis Torres', fecha: '2026-12-10', contexto: 'Matrimonios · Zona Este' },
    ])
    expect(c.rpc).toHaveBeenCalledWith('obtener_detalle_grupo', { p_auth_id: 'auth-1', p_grupo_id: 'g-1' })
    expect(c.from).toHaveBeenCalledWith('usuarios')
    expect(c.tabla.select).toHaveBeenCalledWith('id, fecha_nacimiento')
    // The person themself is never asked for.
    expect(c.tabla.in).toHaveBeenCalledWith('id', ['u-2', 'u-3', 'u-4', 'u-5', 'u-6'])
  })

  it('una persona en dos de sus grupos sale una vez', async () => {
    const c = cliente()

    const lista = await cargar(c, { grupos: [{ grupoId: 'g-1', nombre: null }, { grupoId: 'g-2', nombre: null }] })

    expect(lista.map((x) => x.id)).toEqual(['u-2', 'u-7', 'u-3'])
    expect(lista.find((x) => x.id === 'u-7')?.contexto).toBe('Hombres +36')
    expect(c.from).toHaveBeenCalledTimes(1)
  })

  it('cruza el año y el 29 de febrero cae el 28 cuando el año no es bisiesto', async () => {
    const detalles = { 'g-1': ok({ nombre: 'G', miembros: [miembro('u-2', 'Ana', 'Pérez'), miembro('u-3', 'Luis', 'Torres')] }) }
    const enero = cliente({ detalles, usuarios: ok([{ id: 'u-2', fecha_nacimiento: '1990-01-05' }]) })
    const bisiesto = cliente({ detalles, usuarios: ok([{ id: 'u-3', fecha_nacimiento: '2000-02-29' }]) })

    await expect(cargar(enero, { hoy: '2026-12-20' })).resolves.toEqual([{ id: 'u-2', nombre: 'Ana Pérez', fecha: '2027-01-05', contexto: 'G' }])
    await expect(cargar(bisiesto, { hoy: '2027-02-15' })).resolves.toEqual([{ id: 'u-3', nombre: 'Luis Torres', fecha: '2027-02-28', contexto: 'G' }])
  })

  it('sin el detalle del grupo usa el nombre conocido; si el detalle falla, ese grupo no suma', async () => {
    const c = cliente({ detalles: { 'g-1': fallo('permission denied'), 'g-2': ok({ miembros: [miembro('u-7', 'Pedro', 'Rojas')] }) } })

    await expect(cargar(c, { grupos: [{ grupoId: 'g-1', nombre: 'Uno' }, { grupoId: 'g-2', nombre: 'Dos' }] })).resolves.toEqual([
      { id: 'u-7', nombre: 'Pedro Rojas', fecha: '2026-11-25', contexto: 'Dos' },
    ])
    expect(consola).toHaveBeenCalled()
  })

  it('si no se pueden leer las fechas (o la RPC lanza) queda vacía y lo registra', async () => {
    await expect(cargar(cliente({ usuarios: fallo('permission denied') }))).resolves.toEqual([])
    expect(consola).toHaveBeenCalled()

    const lanza = cliente()
    lanza.rpc.mockRejectedValue(new Error('red caída'))
    await expect(cargar(lanza)).resolves.toEqual([])
  })

  it('un miembro al que RLS solo le devuelve su propia fila no ve cumpleaños', async () => {
    await expect(cargar(cliente({ usuarios: ok([{ id: 'u-1', fecha_nacimiento: '1990-11-12' }]) }))).resolves.toEqual([])
  })

  it('sin grupos no consulta nada', async () => {
    const c = cliente()

    await expect(cargar(c, { grupos: [] })).resolves.toEqual([])
    expect(c.rpc).not.toHaveBeenCalled()
    expect(c.from).not.toHaveBeenCalled()
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
