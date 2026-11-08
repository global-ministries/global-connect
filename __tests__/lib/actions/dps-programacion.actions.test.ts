/**
 * @jest-environment node
 */
/**
 * Server actions of /dps/programacion, the annual programming sheet
 * (odd/tasks/dps-asistencia-pco.md, T11; S6.4, S7.3): reload a year
 * (dps_planes_rango), save one cell (dps_plan_campo; a Sunday without a plan
 * gets it first with dps_plan_crear) and "Nueva serie" (dps_serie_crear,
 * which creates or attaches its Sundays). Every RPC goes through the session
 * client, so the database decides who edits; the Spanish messages come from
 * lib/platform/dps/programacion.ts.
 */
const rpc = jest.fn()
const getUser = jest.fn()

jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser }, rpc }),
}))

import { cargarProgramacionDps, crearSerieDps, guardarCeldaDps } from '@/lib/actions/dps-programacion.actions'

const PLAN = '66666666-6666-4666-8666-666666666666'
const SERIE = '99999999-9999-4999-8999-999999999999'
const DATOS_INVALIDOS = { ok: false, message: 'Revisa los datos e inténtalo de nuevo.', codigo: null }
const SIN_SESION = { ok: false, message: 'Tu sesión terminó. Vuelve a iniciar sesión.', codigo: null }

type Respuesta = { data: unknown; error: unknown }
const respuestas = (mapa: Record<string, Respuesta | Respuesta[]>) =>
  rpc.mockImplementation(async (nombre: string) => {
    const r = mapa[nombre]
    if (Array.isArray(r)) return r.shift() ?? { data: null, error: null }
    return r ?? { data: null, error: null }
  })

const planJson = (parche: Record<string, unknown> = {}) => ({
  id: PLAN,
  fecha: '2026-11-15',
  tipo: 'domingo',
  titulo: null,
  semana: null,
  serie: null,
  horarios: ['09:15', '11:15'],
  llegada: '07:00',
  productor: null,
  host: null,
  comunicador: null,
  campos: {},
  ...parche,
})

beforeEach(() => {
  rpc.mockReset()
  getUser.mockReset()
  getUser.mockResolvedValue({ data: { user: { id: 'auth-1' } } })
})

describe('cargarProgramacionDps', () => {
  it('reads the whole year', async () => {
    respuestas({ dps_planes_rango: { data: [planJson()], error: null } })
    const r = await cargarProgramacionDps({ anio: 2026 })
    expect(rpc).toHaveBeenCalledWith('dps_planes_rango', { p_desde: '2026-01-01', p_hasta: '2026-12-31' })
    expect(r.ok && r.data.map((p) => p.id)).toEqual([PLAN])
  })

  it('refuses a year out of range, no session, and maps the RPC error', async () => {
    expect(await cargarProgramacionDps({ anio: 1999 })).toEqual(DATOS_INVALIDOS)
    expect(await cargarProgramacionDps({ anio: 2026.5 })).toEqual(DATOS_INVALIDOS)
    expect(rpc).not.toHaveBeenCalled()
    getUser.mockResolvedValue({ data: { user: null } })
    expect(await cargarProgramacionDps({ anio: 2026 })).toEqual(SIN_SESION)
    getUser.mockResolvedValue({ data: { user: { id: 'auth-1' } } })
    respuestas({ dps_planes_rango: { data: null, error: { code: '42501', message: 'sin_autoridad' } } })
    expect(await cargarProgramacionDps({ anio: 2026 })).toEqual({
      ok: false,
      message: 'Solo quienes arman el plan pueden cambiar la programación.',
      codigo: 'sin_autoridad',
    })
  })
})

describe('guardarCeldaDps', () => {
  it('saves a creative cell of an existing plan and returns the stored plan', async () => {
    respuestas({ dps_plan_campo: { data: planJson({ campos: { opener: 'Drama corto' } }), error: null } })
    const r = await guardarCeldaDps({ planId: PLAN, fecha: '2026-11-15', columna: 'opener', valor: ' Drama corto ' })
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('dps_plan_campo', { p_plan_id: PLAN, p_campo: 'opener', p_valor: 'Drama corto' })
    expect(r.ok && r.data.valores.opener).toBe('Drama corto')
  })

  it('writes productor, host and comunicador as text (S7.3) and songs as a list; empty clears', async () => {
    respuestas({ dps_plan_campo: { data: planJson(), error: null } })
    await guardarCeldaDps({ planId: PLAN, fecha: '2026-11-15', columna: 'host', valor: 'Paola Mejía' })
    await guardarCeldaDps({ planId: PLAN, fecha: '2026-11-15', columna: 'canciones', valor: 'Hogar · Aquí estás' })
    await guardarCeldaDps({ planId: PLAN, fecha: '2026-11-15', columna: 'productor', valor: '' })
    expect(rpc.mock.calls.map((c) => c[1].p_valor)).toEqual([{ texto: 'Paola Mejía' }, ['Hogar', 'Aquí estás'], null])
  })

  it('creates the Sunday plan first when the Sunday has none', async () => {
    respuestas({ dps_plan_crear: { data: PLAN, error: null }, dps_plan_campo: { data: planJson(), error: null } })
    const r = await guardarCeldaDps({ planId: null, fecha: '2026-11-15', columna: 'notas', valor: 'Grabar clip' })
    expect(rpc.mock.calls).toEqual([
      ['dps_plan_crear', { p_fecha: '2026-11-15', p_tipo: 'domingo', p_titulo: null }],
      ['dps_plan_campo', { p_plan_id: PLAN, p_campo: 'notas', p_valor: 'Grabar clip' }],
    ])
    expect(r.ok && r.data.id).toBe(PLAN)
  })

  it('uses the plan someone else created meanwhile', async () => {
    respuestas({
      dps_plan_crear: { data: null, error: { code: '22023', message: 'plan_duplicado' } },
      dps_planes_rango: { data: [planJson({ id: 'otro', tipo: 'cena_del_senor' }), planJson()], error: null },
      dps_plan_campo: { data: planJson(), error: null },
    })
    const r = await guardarCeldaDps({ planId: null, fecha: '2026-11-15', columna: 'notas', valor: 'x' })
    expect(rpc).toHaveBeenCalledWith('dps_planes_rango', { p_desde: '2026-11-15', p_hasta: '2026-11-15' })
    expect(rpc).toHaveBeenLastCalledWith('dps_plan_campo', { p_plan_id: PLAN, p_campo: 'notas', p_valor: 'x' })
    expect(r.ok).toBe(true)
  })

  it('refuses a bad column, a bad plan, a non-Sunday without a plan and a value too long, without calling', async () => {
    expect(await guardarCeldaDps({ planId: PLAN, fecha: '2026-11-15', columna: 'fecha' as never, valor: 'x' })).toEqual(DATOS_INVALIDOS)
    expect(await guardarCeldaDps({ planId: 'nope', fecha: '2026-11-15', columna: 'notas', valor: 'x' })).toEqual(DATOS_INVALIDOS)
    expect(await guardarCeldaDps({ planId: null, fecha: '2026-11-16', columna: 'notas', valor: 'x' })).toEqual(DATOS_INVALIDOS)
    expect(await guardarCeldaDps({ planId: PLAN, fecha: '2026-11-15', columna: 'host', valor: 'x'.repeat(121) })).toEqual({
      ok: false,
      message: 'Máximo 120 caracteres.',
      codigo: 'valor_invalido',
    })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('maps the RPC refusals (a plain servidor cannot edit)', async () => {
    respuestas({ dps_plan_campo: { data: null, error: { code: '42501', message: 'sin_autoridad' } } })
    expect(await guardarCeldaDps({ planId: PLAN, fecha: '2026-11-15', columna: 'notas', valor: 'x' })).toEqual({
      ok: false,
      message: 'Solo quienes arman el plan pueden cambiar la programación.',
      codigo: 'sin_autoridad',
    })
    getUser.mockResolvedValue({ data: { user: null } })
    expect(await guardarCeldaDps({ planId: PLAN, fecha: '2026-11-15', columna: 'notas', valor: 'x' })).toEqual(SIN_SESION)
  })
})

describe('crearSerieDps', () => {
  const entrada = { nombre: ' Lo que el corazón guarda ', primerDomingo: '2027-01-03', semanas: 4, color: 'chart-3' }

  it('creates the series and its Sundays', async () => {
    respuestas({
      dps_serie_crear: {
        data: { serie_id: SERIE, planes: [{ id: PLAN, fecha: '2027-01-03', semana: 1, existente: false }] },
        error: null,
      },
    })
    const r = await crearSerieDps(entrada)
    expect(rpc).toHaveBeenCalledWith('dps_serie_crear', {
      p_nombre: 'Lo que el corazón guarda',
      p_color: 'chart-3',
      p_semanas: 4,
      p_primer_domingo: '2027-01-03',
      p_sinopsis: null,
      p_enlace: null,
    })
    expect(r).toEqual({ ok: true, data: { serieId: SERIE, planIds: [PLAN] } })
  })

  it('refuses an empty name, a weekday, weeks out of 1..52 and an unknown color without calling', async () => {
    for (const malo of [
      { ...entrada, nombre: '  ' },
      { ...entrada, primerDomingo: '2027-01-04' },
      { ...entrada, semanas: 0 },
      { ...entrada, semanas: 53 },
      { ...entrada, color: 'red' },
    ]) {
      expect(await crearSerieDps(malo)).toEqual(DATOS_INVALIDOS)
    }
    expect(rpc).not.toHaveBeenCalled()
  })

  it('names the Sunday another series holds', async () => {
    respuestas({ dps_serie_crear: { data: null, error: { code: '22023', message: 'domingo_ocupado', details: '2027-01-10' } } })
    expect(await crearSerieDps(entrada)).toEqual({
      ok: false,
      message: 'El domingo 10 de enero ya es de otra serie. Elige otro primer domingo o menos semanas.',
      codigo: 'domingo_ocupado',
    })
  })
})
