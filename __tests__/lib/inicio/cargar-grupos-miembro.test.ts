import { cargarGruposMiembro } from '@/lib/inicio/cargar-grupos-miembro'
import type { ClienteInicio } from '@/lib/inicio/cargar-hechos'

type Resultado = { data: unknown; error: unknown }
type Llamada = [metodo: string, ...args: unknown[]]

// Chainable PostgREST query; the result may depend on the filters it received.
function consulta(resultado: Resultado | ((llamadas: Llamada[]) => Resultado)) {
  const llamadas: Llamada[] = []
  const q: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'is', 'in', 'gte', 'lt', 'order', 'limit']) {
    q[m] = jest.fn((...args: unknown[]) => {
      llamadas.push([m, ...args])
      return q
    })
  }
  const resolver = () => (typeof resultado === 'function' ? resultado(llamadas) : resultado)
  q.then = (ok: (r: Resultado) => unknown, mal: (e: unknown) => unknown) => Promise.resolve().then(resolver).then(ok, mal)
  return q
}

const ok = (data: unknown): Resultado => ({ data, error: null })
const fallo = (mensaje: string): Resultado => ({ data: null, error: { message: mensaje } })

const DETALLE = {
  nombre: 'Matrimonios · Zona Este',
  dia_reunion: 'Jueves',
  hora_reunion: '19:30:00',
  direccion: { calle: 'Calle 5', barrio: 'El Pedregal', latitud: 10.07, longitud: -69.28 },
  miembros: [
    { nombre: 'Luis', apellido: 'Torres', telefono: '0212 555 1234', rol: 'Líder' },
    { nombre: 'Andreína', apellido: 'Torres', telefono: '0414-555-7346', rol: 'Líder' },
    { nombre: 'Carlos', apellido: 'Mendoza', telefono: '0412 000 0000', rol: 'Miembro' },
  ],
}

const PASADOS = [
  { id: 'e-4', no_hubo_reunion: false },
  { id: 'e-3', no_hubo_reunion: true },
  { id: 'e-2', no_hubo_reunion: null },
  { id: 'e-1', no_hubo_reunion: false },
]

type Fuentes = { detalle?: Resultado; proximos?: Resultado; pasados?: Resultado; asistencia?: Resultado }

function cliente({ detalle = ok(DETALLE), proximos = ok([{ fecha: '2026-11-12', hora: '19:30:00' }]), pasados = ok(PASADOS), asistencia = ok([{ evento_grupo_id: 'e-4' }, { evento_grupo_id: 'e-1' }]) }: Fuentes = {}) {
  return {
    from: jest.fn((tabla: string) => {
      if (tabla === 'eventos_grupo') return consulta((llamadas) => (llamadas.some(([m]) => m === 'gte') ? proximos : pasados))
      if (tabla === 'asistencia') return consulta(asistencia)
      return consulta(ok([]))
    }),
    rpc: jest.fn(() => Promise.resolve(detalle)),
  }
}

const PEDIDO = { authId: 'auth-1', usuarioId: 'u-1', hoy: '2026-11-09', grupos: [{ grupoId: 'g-1', nombre: 'Matrimonios' }] }

const cargar = (c: ReturnType<typeof cliente>, pedido = PEDIDO) => cargarGruposMiembro(c as unknown as ClienteInicio, pedido)

describe('cargarGruposMiembro', () => {
  let consoleError: jest.SpyInstance

  beforeEach(() => {
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => consoleError.mockRestore())

  it('junta nombre, líderes, próxima reunión, lugar, enlaces y asistencia de cada grupo', async () => {
    const c = cliente()

    await expect(cargar(c)).resolves.toEqual({
      'g-1': {
        grupoId: 'g-1',
        nombre: 'Matrimonios · Zona Este',
        lideres: ['Luis Torres', 'Andreína Torres'],
        proximaReunion: { fecha: '2026-11-12', hora: '19:30' },
        lugar: 'Calle 5, El Pedregal',
        comoLlegar: 'https://www.google.com/maps/search/?api=1&query=10.07%2C-69.28',
        // The first leader with a mobile number: Luis has a landline.
        escribirLider: 'https://wa.me/584145557346',
        // e-3 had no meeting, so it does not count.
        asistencia: { fui: 2, de: 3 },
      },
    })
    expect(c.rpc).toHaveBeenCalledWith('obtener_detalle_grupo', { p_auth_id: 'auth-1', p_grupo_id: 'g-1' })
  })

  it('sin reunión registrada calcula la próxima desde el día y la hora del grupo', async () => {
    await expect(cargar(cliente({ proximos: ok([]) }))).resolves.toMatchObject({
      'g-1': { proximaReunion: { fecha: '2026-11-12', hora: '19:30' } },
    })
  })

  it('si el grupo se reúne hoy, la próxima reunión es hoy', async () => {
    const detalle = ok({ ...DETALLE, dia_reunion: 'Lunes', hora_reunion: null })

    await expect(cargar(cliente({ detalle, proximos: ok([]) }))).resolves.toMatchObject({
      'g-1': { proximaReunion: { fecha: '2026-11-09', hora: null } },
    })
  })

  it('sin coordenadas busca el lugar por su dirección', async () => {
    const detalle = ok({ ...DETALLE, direccion: { calle: 'Av. Lara', barrio: null, latitud: null, longitud: null } })

    await expect(cargar(cliente({ detalle }))).resolves.toMatchObject({
      'g-1': { lugar: 'Av. Lara', comoLlegar: 'https://www.google.com/maps/search/?api=1&query=Av.%20Lara' },
    })
  })

  it('si falla el detalle conserva el nombre conocido, la reunión y la asistencia', async () => {
    await expect(cargar(cliente({ detalle: fallo('sin permiso') }))).resolves.toEqual({
      'g-1': {
        grupoId: 'g-1',
        nombre: 'Matrimonios',
        lideres: [],
        proximaReunion: { fecha: '2026-11-12', hora: '19:30' },
        lugar: null,
        comoLlegar: null,
        escribirLider: null,
        asistencia: { fui: 2, de: 3 },
      },
    })
    expect(consoleError).toHaveBeenCalled()
  })

  it('si falla la asistencia la deja sin dato y conserva lo demás', async () => {
    const datos = await cargar(cliente({ asistencia: fallo('rls') }))

    expect(datos['g-1'].asistencia).toBeNull()
    expect(datos['g-1'].lideres).toEqual(['Luis Torres', 'Andreína Torres'])
  })

  it('sin reuniones pasadas no consulta la asistencia', async () => {
    const c = cliente({ pasados: ok([]) })

    const datos = await cargar(c)

    expect(datos['g-1'].asistencia).toBeNull()
    expect(c.from).not.toHaveBeenCalledWith('asistencia')
  })

  it('sin grupos no consulta nada', async () => {
    const c = cliente()

    await expect(cargar(c, { ...PEDIDO, grupos: [] })).resolves.toEqual({})
    expect(c.rpc).not.toHaveBeenCalled()
    expect(c.from).not.toHaveBeenCalled()
  })
})
