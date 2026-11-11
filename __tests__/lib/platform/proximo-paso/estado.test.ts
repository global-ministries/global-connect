/**
 * T8 (odd/tasks/proximo-paso.md, L22/L24) — what a signed-in person sees of
 * Próximo Paso on the home card and on /proximo-paso: the open ediciones
 * (proximo_paso_ediciones_abiertas, the person's own client) and their own
 * inscripción in one of them (taller_inscripciones under RLS, principal or
 * companero). The card variant follows from both.
 */
import { cargarEstadoProximoPaso, varianteProximoPaso, type EstadoProximoPaso } from '@/lib/platform/proximo-paso/estado'
import type { EdicionProximoPaso } from '@/lib/platform/talleres/proximo-paso-registro'

const rpc = jest.fn()
const leerInscripciones = jest.fn()
const llamadas: { tabla?: string; columnas?: string; or?: string; in?: [string, unknown] } = {}

const cliente = {
  rpc: (...a: unknown[]) => rpc(...a),
  from: (tabla: string) => ({
    select: (columnas: string) => ({
      or: (filtro: string) => ({
        in: (col: string, valores: unknown) => {
          Object.assign(llamadas, { tabla, columnas, or: filtro, in: [col, valores] })
          return leerInscripciones()
        },
      }),
    }),
  }),
}

const filaRpc = (id: string, nombre: string, inicio: string, cupo: number | null) => ({
  edicion_id: id,
  nombre,
  fecha_inicio: inicio,
  fecha_fin: null,
  cupo_restante: cupo,
  clases: [{ numero: 1, tema: 'Sígueme', fecha: inicio }],
  hora: '10:00',
  lugar: 'Auditorio principal',
  indicaciones: null,
})

const inscripcion = (estado: string, edicion: Record<string, unknown> | null) => ({ estado, edicion })
const edicionFila = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  nombre_snapshot: 'Enero 2027',
  fecha_inicio: '2027-01-03',
  fecha_fin: '2027-01-24',
  estado: 'abierto',
  taller: { slug: 'proximo-paso' },
  ...extra,
})

beforeEach(() => {
  jest.clearAllMocks()
  rpc.mockResolvedValue({ data: [filaRpc('ed-ene', 'Enero 2027', '2027-01-03', 30), filaRpc('ed-feb', 'Febrero 2027', '2027-02-07', 0)], error: null })
  leerInscripciones.mockResolvedValue({ data: [], error: null })
})

describe('cargarEstadoProximoPaso', () => {
  it('reads the open ediciones with hora and lugar, and no inscripción', async () => {
    const estado = await cargarEstadoProximoPaso(cliente, { usuarioId: 'u-1', hoy: '2026-11-11' })

    expect(rpc).toHaveBeenCalledWith('proximo_paso_ediciones_abiertas')
    expect(estado?.ediciones.map((e) => [e.id, e.hora, e.lugar])).toEqual([
      ['ed-ene', '10:00', 'Auditorio principal'],
      ['ed-feb', '10:00', 'Auditorio principal'],
    ])
    expect(estado?.inscripcion).toBeNull()
    expect(llamadas).toEqual({
      tabla: 'taller_inscripciones',
      columnas: expect.stringContaining('taller_ediciones!taller_id'),
      or: 'persona_principal_id.eq.u-1,companero_id.eq.u-1',
      in: ['estado', ['pendiente', 'aprobado']],
    })
  })

  it('finds the own aprobada inscripción in an open edición, with the full edición', async () => {
    leerInscripciones.mockResolvedValue({ data: [inscripcion('aprobado', edicionFila('ed-ene'))], error: null })

    const estado = await cargarEstadoProximoPaso(cliente, { usuarioId: 'u-1', hoy: '2026-11-11' })

    expect(estado?.inscripcion?.estado).toBe('inscrito')
    expect(estado?.inscripcion?.edicion).toMatchObject({ id: 'ed-ene', hora: '10:00', lugar: 'Auditorio principal' })
  })

  it('reads a pendiente inscripción as pendiente, never as inscrito', async () => {
    leerInscripciones.mockResolvedValue({ data: [inscripcion('pendiente', edicionFila('ed-ene'))], error: null })

    expect((await cargarEstadoProximoPaso(cliente, { usuarioId: 'u-1', hoy: '2026-11-11' }))?.inscripcion?.estado).toBe('pendiente')
  })

  it('keeps an edición already en curso with what the inscripción knows of it', async () => {
    leerInscripciones.mockResolvedValue({
      data: [inscripcion('aprobado', edicionFila('ed-nov', { nombre_snapshot: 'Noviembre 2026', fecha_inicio: '2026-11-01', fecha_fin: '2026-11-22', estado: 'en_curso' }))],
      error: null,
    })

    const estado = await cargarEstadoProximoPaso(cliente, { usuarioId: 'u-1', hoy: '2026-11-11' })

    expect(estado?.inscripcion).toEqual({
      estado: 'inscrito',
      edicion: {
        id: 'ed-nov',
        nombre: 'Noviembre 2026',
        fechaInicio: '2026-11-01',
        fechaFin: '2026-11-22',
        cupoRestante: null,
        clases: [],
        hora: null,
        lugar: null,
        indicaciones: null,
      },
    })
  })

  it.each([
    ['another taller', edicionFila('ed-x', { taller: { slug: 'matrimonios' } })],
    ['a cerrada edición', edicionFila('ed-x', { estado: 'cerrado' })],
    ['an edición that already ended', edicionFila('ed-x', { estado: 'en_curso', fecha_fin: '2026-11-10' })],
    ['no edición', null],
  ])('ignores an inscripción of %s', async (_caso, edicion) => {
    leerInscripciones.mockResolvedValue({ data: [inscripcion('aprobado', edicion)], error: null })

    expect((await cargarEstadoProximoPaso(cliente, { usuarioId: 'u-1', hoy: '2026-11-11' }))?.inscripcion).toBeNull()
  })

  it('reads no inscripción without a ficha', async () => {
    const estado = await cargarEstadoProximoPaso(cliente, { usuarioId: null, hoy: '2026-11-11' })

    expect(estado?.inscripcion).toBeNull()
    expect(leerInscripciones).not.toHaveBeenCalled()
  })

  it('answers null when the ediciones cannot be read, and no inscripción when its read fails', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'down' } })
    expect(await cargarEstadoProximoPaso(cliente, { usuarioId: 'u-1', hoy: '2026-11-11' })).toBeNull()

    leerInscripciones.mockResolvedValue({ data: null, error: { message: 'down' } })
    expect((await cargarEstadoProximoPaso(cliente, { usuarioId: 'u-1', hoy: '2026-11-11' }))?.inscripcion).toBeNull()
  })
})

describe('varianteProximoPaso', () => {
  const ed = (id: string, cupoRestante: number | null): EdicionProximoPaso => ({
    id,
    nombre: id,
    fechaInicio: '2027-01-03',
    fechaFin: null,
    cupoRestante,
    clases: [],
    hora: null,
    lugar: null,
    indicaciones: null,
  })
  const estado = (ediciones: EdicionProximoPaso[], inscripcion: EstadoProximoPaso['inscripcion'] = null): EstadoProximoPaso => ({ ediciones, inscripcion })

  it('asks for action with the nearest edición that has cupo', () => {
    expect(varianteProximoPaso(estado([ed('lleno', 0), ed('feb', 3), ed('mar', null)]))).toEqual({
      variante: 'abiertas',
      edicion: ed('feb', 3),
      disponibles: [ed('feb', 3), ed('mar', null)],
    })
  })

  it('reminds the inscripción before anything else', () => {
    const inscripcion = { estado: 'inscrito' as const, edicion: ed('feb', 3) }
    expect(varianteProximoPaso(estado([ed('feb', 3)], inscripcion))).toEqual({ variante: 'inscrito', inscripcion })
  })

  it('is soft without an open edición with cupo', () => {
    expect(varianteProximoPaso(estado([]))).toEqual({ variante: 'sin-fecha' })
    expect(varianteProximoPaso(estado([ed('lleno', 0)]))).toEqual({ variante: 'sin-fecha' })
  })
})
