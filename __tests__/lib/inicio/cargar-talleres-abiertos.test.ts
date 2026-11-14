/**
 * The Talleres tile of «Explorar» (odd/tasks/home-por-rol.md S15): how many
 * talleres the person can enroll in, counted as /talleres/explorar does.
 */
import { cargarTalleresAbiertos } from '@/lib/inicio/cargar-talleres-abiertos'

const ENTORNO = { ...process.env }

type Resultado = { data: unknown; error: { message: string } | null }

function cliente(resultado: Resultado | Error) {
  const q: Record<string, jest.Mock> = {}
  q.select = jest.fn(() => q)
  q.in = jest.fn(() => (resultado instanceof Error ? Promise.reject(resultado) : Promise.resolve(resultado)))
  return { from: jest.fn(() => q), q }
}

const edicion = (id: string, slug: string | null) => ({ id, taller: slug === null ? null : { slug } })

describe('cargarTalleresAbiertos', () => {
  let consola: jest.SpyInstance

  beforeEach(() => {
    process.env.NEXT_PUBLIC_TALLERES_ENABLED = 'on'
    process.env.NEXT_PUBLIC_TALLERES_STAGE = 'public'
    delete process.env.NEXT_PUBLIC_TALLERES_KILL_SWITCH
    consola = jest.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    process.env = { ...ENTORNO }
    consola.mockRestore()
  })

  it('cuenta talleres distintos con una edición abierta o en curso, como /talleres/explorar', async () => {
    const c = cliente({ data: [edicion('e-1', 'matrimonios'), edicion('e-2', 'matrimonios'), edicion('e-3', 'finanzas'), edicion('e-4', null)], error: null })

    await expect(cargarTalleresAbiertos(c as never, { hizoProximoPaso: null })).resolves.toBe(3)
    expect(c.from).toHaveBeenCalledWith('taller_ediciones')
    expect(c.q.in).toHaveBeenCalledWith('estado', ['abierto', 'en_curso'])
  })

  it('sin contar Próximo Paso para quien ya lo hizo', async () => {
    const filas = [edicion('e-1', 'proximo-paso'), edicion('e-2', 'finanzas')]

    await expect(cargarTalleresAbiertos(cliente({ data: filas, error: null }) as never, { hizoProximoPaso: true })).resolves.toBe(1)
    await expect(cargarTalleresAbiertos(cliente({ data: filas, error: null }) as never, { hizoProximoPaso: false })).resolves.toBe(2)
  })

  it('0 cuando no hay ninguno abierto', async () => {
    await expect(cargarTalleresAbiertos(cliente({ data: [], error: null }) as never, { hizoProximoPaso: true })).resolves.toBe(0)
  })

  it('si la lectura falla, desconocido (null) y lo registra', async () => {
    await expect(cargarTalleresAbiertos(cliente({ data: null, error: { message: 'permission denied' } }) as never, { hizoProximoPaso: true })).resolves.toBeNull()
    await expect(cargarTalleresAbiertos(cliente(new Error('caído')) as never, { hizoProximoPaso: true })).resolves.toBeNull()
    expect(consola).toHaveBeenCalledTimes(2)
  })

  it('con Talleres apagado no consulta: desconocido', async () => {
    process.env.NEXT_PUBLIC_TALLERES_ENABLED = 'off'
    const c = cliente({ data: [edicion('e-1', 'finanzas')], error: null })

    await expect(cargarTalleresAbiertos(c as never, { hizoProximoPaso: true })).resolves.toBeNull()
    expect(c.from).not.toHaveBeenCalled()
  })
})
