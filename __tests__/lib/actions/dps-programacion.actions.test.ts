/**
 * @jest-environment node
 */
/**
 * Server actions of /dps/programacion, the annual programming sheet
 * (odd/tasks/dps-asistencia-pco.md, T11; S6.4, S7.3): reload a year
 * (dps_planes_rango), save one cell (dps_plan_campo; a Sunday without a plan
 * gets it first with dps_plan_crear) and "Nueva serie" (dps_serie_crear,
 * which creates or attaches its Sundays); T11b (S9): "Nuevo evento"
 * (dps_evento_crear), moving a plan (dps_plan_mover) and deleting one
 * (dps_plan_eliminar). Every RPC goes through the session
 * client, so the database decides who edits; the Spanish messages come from
 * lib/platform/dps/programacion.ts.
 */
const rpc = jest.fn()
const getUser = jest.fn()

jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser }, rpc }),
}))

import {
  cargarProgramacionDps,
  crearEventoDps,
  crearSerieDps,
  eliminarPlanDps,
  guardarCeldaDps,
  moverPlanDps,
} from '@/lib/actions/dps-programacion.actions'

const PLAN = '66666666-6666-4666-8666-666666666666'
const SERIE = '99999999-9999-4999-8999-999999999999'
const PERSONA = '11111111-1111-4111-8111-111111111111'
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

describe('crearEventoDps (S9)', () => {
  const entrada = { tipo: 'especial', titulo: ' Conferencia Familias ', desde: '2026-11-20', hasta: '2026-11-22' }

  it('creates one plan per day and returns them', async () => {
    respuestas({
      dps_evento_crear: {
        data: { evento_id: SERIE, planes: [planJson({ fecha: '2026-11-20', tipo: 'especial', titulo: 'Conferencia Familias', evento: { id: SERIE, dia: 1, dias: 3 } })] },
        error: null,
      },
    })
    const r = await crearEventoDps(entrada)
    expect(rpc).toHaveBeenCalledWith('dps_evento_crear', { p_tipo: 'especial', p_titulo: 'Conferencia Familias', p_desde: '2026-11-20', p_hasta: '2026-11-22' })
    expect(r.ok && r.data.eventoId).toBe(SERIE)
    expect(r.ok && r.data.planes.map((p) => p.evento)).toEqual([{ id: SERIE, dia: 1, dias: 3 }])
  })

  it('sends a one-day event with p_hasta null', async () => {
    respuestas({ dps_evento_crear: { data: { evento_id: SERIE, planes: [] }, error: null } })
    await crearEventoDps({ ...entrada, tipo: 'cena_del_senor', hasta: null })
    expect(rpc).toHaveBeenCalledWith('dps_evento_crear', { p_tipo: 'cena_del_senor', p_titulo: 'Conferencia Familias', p_desde: '2026-11-20', p_hasta: null })
  })

  it('refuses a bad tipo, an empty or long título, bad dates and more than 14 days without calling', async () => {
    for (const malo of [
      { ...entrada, tipo: 'domingo' },
      { ...entrada, tipo: 'libre' },
      { ...entrada, titulo: '   ' },
      { ...entrada, titulo: 'x'.repeat(121) },
      { ...entrada, desde: '2026-02-30' },
      { ...entrada, hasta: '2026-11-19' },
      { ...entrada, hasta: '2026-12-04' },
    ]) {
      expect(await crearEventoDps(malo)).toEqual(DATOS_INVALIDOS)
    }
    expect(rpc).not.toHaveBeenCalled()
  })

  it('names the day that clashes and maps no session', async () => {
    respuestas({ dps_evento_crear: { data: null, error: { code: '22023', message: 'plan_duplicado', details: '2026-11-21' } } })
    expect(await crearEventoDps(entrada)).toEqual({
      ok: false,
      message: 'Ya hay un evento de ese tipo con ese título el 21 de noviembre.',
      codigo: 'plan_duplicado',
    })
    getUser.mockResolvedValue({ data: { user: null } })
    expect(await crearEventoDps(entrada)).toEqual(SIN_SESION)
  })
})

describe('moverPlanDps (S9)', () => {
  it('moves the plan and returns it on its new date', async () => {
    respuestas({ dps_plan_mover: { data: planJson({ fecha: '2026-11-25', tipo: 'cena_del_senor' }), error: null } })
    const r = await moverPlanDps({ planId: PLAN, fecha: '2026-11-25' })
    expect(rpc).toHaveBeenCalledWith('dps_plan_mover', { p_plan_id: PLAN, p_fecha: '2026-11-25' })
    expect(r.ok && r.data.fecha).toBe('2026-11-25')
  })

  it('refuses a bad plan or date without calling', async () => {
    expect(await moverPlanDps({ planId: 'nope', fecha: '2026-11-25' })).toEqual(DATOS_INVALIDOS)
    expect(await moverPlanDps({ planId: PLAN, fecha: '25/11/2026' })).toEqual(DATOS_INVALIDOS)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('explains each refusal', async () => {
    for (const [codigo, mensaje] of [
      ['plan_pasado', 'Este día ya pasó: no se puede mover.'],
      ['fecha_pasada', 'Elige una fecha de hoy en adelante.'],
      ['plan_con_asistencia', 'Ya tiene asistencia marcada: no se puede mover ni eliminar.'],
      ['plan_domingo', 'Los domingos de la programación no se mueven ni se eliminan.'],
    ]) {
      respuestas({ dps_plan_mover: { data: null, error: { code: '22023', message: codigo } } })
      expect(await moverPlanDps({ planId: PLAN, fecha: '2026-11-25' })).toEqual({ ok: false, message: mensaje, codigo })
    }
  })
})

describe('eliminarPlanDps (S9)', () => {
  it('deletes one day, or the whole event', async () => {
    respuestas({ dps_plan_eliminar: [{ data: 1, error: null }, { data: 3, error: null }] })
    expect(await eliminarPlanDps({ planId: PLAN, todoElEvento: false })).toEqual({ ok: true, data: { eliminados: 1 } })
    expect(await eliminarPlanDps({ planId: PLAN, todoElEvento: true })).toEqual({ ok: true, data: { eliminados: 3 } })
    expect(rpc.mock.calls).toEqual([
      ['dps_plan_eliminar', { p_plan_id: PLAN, p_todo_el_evento: false }],
      ['dps_plan_eliminar', { p_plan_id: PLAN, p_todo_el_evento: true }],
    ])
  })

  it('refuses a bad plan without calling and explains a plan with attendance', async () => {
    expect(await eliminarPlanDps({ planId: 'nope', todoElEvento: false })).toEqual(DATOS_INVALIDOS)
    expect(rpc).not.toHaveBeenCalled()
    respuestas({ dps_plan_eliminar: { data: null, error: { code: '22023', message: 'plan_con_asistencia' } } })
    expect(await eliminarPlanDps({ planId: PLAN, todoElEvento: false })).toEqual({
      ok: false,
      message: 'Ya tiene asistencia marcada: no se puede mover ni eliminar.',
      codigo: 'plan_con_asistencia',
    })
  })
})

describe('guardarCeldaDps with the people of a cell (S11, S12.3, S12.4)', () => {
  const OTRA = '22222222-2222-4222-8222-222222222222'

  it('sends the people in order, {"persona_id"} or {"texto"}, and returns the plan with them', async () => {
    respuestas({
      dps_plan_campo: {
        data: planJson({
          personas: {
            productor: [],
            host: [
              { persona_id: PERSONA, texto: null, nombre: 'Ana Pérez' },
              { persona_id: null, texto: 'Ps. Olmedo', nombre: 'Ps. Olmedo' },
            ],
            comunicador: [],
            cantantes: [],
          },
        }),
        error: null,
      },
    })
    const r = await guardarCeldaDps({
      planId: PLAN,
      fecha: '2026-11-15',
      columna: 'host',
      valor: 'Ana Pérez, Ps. Olmedo',
      personas: [
        { personaId: PERSONA, nombre: 'Ana Pérez' },
        { personaId: null, nombre: 'Ps. Olmedo' },
      ],
    })
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('dps_plan_campo', { p_plan_id: PLAN, p_campo: 'host', p_valor: [{ persona_id: PERSONA }, { texto: 'Ps. Olmedo' }] })
    expect(r.ok && [r.data.valores.host, r.data.personas.host]).toEqual([
      'Ana Pérez, Ps. Olmedo',
      [
        { personaId: PERSONA, nombre: 'Ana Pérez' },
        { personaId: null, nombre: 'Ps. Olmedo' },
      ],
    ])
  })

  it('clears with no people, and creates the Sunday plan first when the Sunday has none', async () => {
    respuestas({ dps_plan_crear: { data: PLAN, error: null }, dps_plan_campo: { data: planJson(), error: null } })
    await guardarCeldaDps({ planId: null, fecha: '2026-11-15', columna: 'cantantes', valor: '', personas: [] })
    expect(rpc).toHaveBeenLastCalledWith('dps_plan_campo', { p_plan_id: PLAN, p_campo: 'cantantes', p_valor: null })
  })

  it('refuses people on a creative column, a bad id or too many people, without calling', async () => {
    const una = [{ personaId: PERSONA, nombre: 'Ana Pérez' }]
    expect(await guardarCeldaDps({ planId: PLAN, fecha: '2026-11-15', columna: 'opener', valor: 'Ana Pérez', personas: una })).toEqual(DATOS_INVALIDOS)
    expect(await guardarCeldaDps({ planId: PLAN, fecha: '2026-11-15', columna: 'host', valor: 'X', personas: [{ personaId: 'nope', nombre: 'X' }] })).toMatchObject({
      ok: false,
    })
    expect(await guardarCeldaDps({ planId: PLAN, fecha: '2026-11-15', columna: 'host', valor: 'X', personas: 'x' as never })).toEqual(DATOS_INVALIDOS)
    const cuatro = [PERSONA, OTRA, '33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444'].map((personaId) => ({ personaId, nombre: 'X' }))
    expect(await guardarCeldaDps({ planId: PLAN, fecha: '2026-11-15', columna: 'host', valor: 'X', personas: cuatro })).toEqual({
      ok: false,
      message: 'Máximo 3 personas en Host.',
      codigo: 'valor_invalido',
    })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('explains a person off the column\'s list and one who is gone', async () => {
    respuestas({ dps_plan_campo: { data: null, error: { code: '22023', message: 'persona_fuera_de_lista' } } })
    expect(await guardarCeldaDps({ planId: PLAN, fecha: '2026-11-15', columna: 'productor', valor: 'Ana Pérez', personas: [{ personaId: PERSONA, nombre: 'Ana Pérez' }] })).toEqual({
      ok: false,
      message: 'Esa persona no está en la lista de esta columna. Revisa Configuración › Listas o escribe su nombre sin cuenta.',
      codigo: 'persona_fuera_de_lista',
    })
    respuestas({ dps_plan_campo: { data: null, error: { code: '22023', message: 'persona_invalida' } } })
    expect(await guardarCeldaDps({ planId: PLAN, fecha: '2026-11-15', columna: 'host', valor: 'Ana Pérez', personas: [{ personaId: PERSONA, nombre: 'Ana Pérez' }] })).toEqual({
      ok: false,
      message: 'Esa persona ya no está en la plataforma. Búscala de nuevo.',
      codigo: 'persona_invalida',
    })
  })
})
