/**
 * Server actions of the service notices (odd/tasks/dps-asistencia-pco.md,
 * T15a; S13.2-S13.4, S13.6): the planner reviews and sends the notices, the
 * person answers and keeps their blocked dates, through the dps_* RPCs of
 * supabase/migrations/20261109210000_dps_avisos.sql with the session client.
 * The database decides who may do what; its codes come back with a Spanish
 * sentence.
 */
const rpc = jest.fn()
const getUser = jest.fn()

jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser }, rpc }),
}))

// T16b: the e-mails queued by a send or a «No puedo» are dispatched after the response.
const despachar = jest.fn(async () => undefined)
jest.mock('@/lib/platform/dps/avisos-correo', () => ({ despacharCorreosDps: () => despachar() }))
jest.mock('next/server', () => ({ after: (f: () => unknown) => f() }))

import {
  agregarFechaBloqueadaDps,
  cargarAvisosPendientesDps,
  cargarEstadoAvisosDps,
  cargarMiServicioDps,
  cargarMisFechasBloqueadasDps,
  cargarMisServiciosDps,
  cargarPersonasBloqueadasDps,
  enviarAvisosDps,
  marcarAvisoVistoDps,
  quitarFechaBloqueadaDps,
  responderServicioDps,
} from '@/lib/actions/dps-avisos.actions'

const PLAN = '11111111-1111-4111-8111-111111111111'
const PLAN2 = '66666666-6666-4666-8666-666666666666'
const P1 = '22222222-2222-4222-8222-222222222222'
const BLOQUEO = '55555555-5555-4555-8555-555555555555'
const SIN_SESION = { ok: false, message: 'Tu sesión terminó. Vuelve a iniciar sesión.', codigo: null }
const DATOS = { ok: false, message: 'Revisa los datos e inténtalo de nuevo.', codigo: null }
const SERVICIO = { plan_id: PLAN, fecha: '2026-11-15', tipo: 'domingo', roles: [], horarios: ['09:00'], llegada: '07:30', estado: 'confirmo' }

beforeEach(() => {
  rpc.mockReset()
  getUser.mockReset()
  despachar.mockClear()
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
})

describe('planner: pending, send and state', () => {
  it('reads the pending notices of the visible plans (repeats sent once)', async () => {
    rpc.mockResolvedValueOnce({ data: { total: 0, nuevas: [], cambios: [], quitados: [], no_reciben: { sin_cambios: 4 } }, error: null })
    const r = await cargarAvisosPendientesDps({ planIds: [PLAN, PLAN2, PLAN] })
    expect(rpc).toHaveBeenCalledWith('dps_avisos_pendientes', { p_plan_ids: [PLAN, PLAN2] })
    expect(r).toEqual({
      ok: true,
      data: { total: 0, porCorreo: 0, soloPanel: 0, remitente: null, nuevas: [], cambios: [], quitados: [], noReciben: { yaRespondieron: [], sinCuenta: [], sinCambios: 4 } },
    })
  })

  it('sends them, returns the counts per channel and dispatches the queued e-mails (S14.1)', async () => {
    rpc.mockResolvedValueOnce({ data: { enviados: 5, nuevas: 3, cambios: 1, quitados: 1, cerrados: 1, por_correo: 4, solo_panel: 1 }, error: null })
    expect(await enviarAvisosDps({ planIds: [PLAN] })).toEqual({
      ok: true,
      data: { enviados: 5, nuevas: 3, cambios: 1, quitados: 1, cerrados: 1, porCorreo: 4, soloPanel: 1 },
    })
    expect(rpc).toHaveBeenCalledWith('dps_avisos_enviar', { p_plan_ids: [PLAN] })
    expect(despachar).toHaveBeenCalledTimes(1)
  })

  it('dispatches nothing when no notice went by e-mail, nor when the send fails', async () => {
    rpc.mockResolvedValueOnce({ data: { enviados: 2, nuevas: 2, cambios: 0, quitados: 0, cerrados: 0, por_correo: 0, solo_panel: 2 }, error: null })
    await enviarAvisosDps({ planIds: [PLAN] })
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'sin_autoridad', code: '42501' } })
    await enviarAvisosDps({ planIds: [PLAN] })
    expect(despachar).not.toHaveBeenCalled()
  })

  it('reads the state of the plans', async () => {
    rpc.mockResolvedValueOnce({ data: { por_enviar: 1, planes: [{ plan_id: PLAN, personas: [] }] }, error: null })
    const r = await cargarEstadoAvisosDps({ planIds: [PLAN] })
    expect(rpc).toHaveBeenCalledWith('dps_avisos_estado', { p_plan_ids: [PLAN] })
    expect(r).toMatchObject({ ok: true, data: { porEnviar: 1, planes: [{ planId: PLAN, personas: [] }] } })
  })

  it('answers no plans without asking, and refuses bad ids or more than 400', async () => {
    expect(await cargarEstadoAvisosDps({ planIds: [] })).toEqual({ ok: true, data: { porEnviar: 0, planes: [] } })
    expect(await enviarAvisosDps({ planIds: [] })).toEqual({ ok: true, data: { enviados: 0, nuevas: 0, cambios: 0, quitados: 0, cerrados: 0, porCorreo: 0, soloPanel: 0 } })
    expect(await cargarAvisosPendientesDps({ planIds: ['x'] })).toEqual(DATOS)
    const muchos = Array.from({ length: 401 }, (_, i) => `11111111-1111-4111-8111-${String(i).padStart(12, '0')}`)
    expect(await enviarAvisosDps({ planIds: muchos })).toEqual({ ok: false, message: 'Son demasiadas fechas a la vez. Elige un rango más corto.', codigo: 'demasiados' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('maps sin_autoridad and a missing session', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'sin_autoridad' } })
    expect(await enviarAvisosDps({ planIds: [PLAN] })).toEqual({
      ok: false,
      message: 'Solo quienes arman el plan pueden ver y enviar los avisos.',
      codigo: 'sin_autoridad',
    })
    getUser.mockResolvedValueOnce({ data: { user: null } })
    expect(await cargarAvisosPendientesDps({ planIds: [PLAN] })).toEqual(SIN_SESION)
  })

  it('reads who blocked a plan’s date', async () => {
    rpc.mockResolvedValueOnce({ data: [{ persona_id: P1, nota: 'Graduación' }], error: null })
    expect(await cargarPersonasBloqueadasDps({ planId: PLAN })).toEqual({ ok: true, data: [{ personaId: P1, nota: 'Graduación' }] })
    expect(rpc).toHaveBeenCalledWith('dps_personas_bloqueadas', { p_plan_id: PLAN })
    expect(await cargarPersonasBloqueadasDps({ planId: 'x' })).toEqual(DATOS)
  })
})

describe('the person: services and answers', () => {
  it('reads Mis servicios', async () => {
    rpc.mockResolvedValueOnce({ data: { servicios: [SERVICIO], avisos: [], por_responder: 0, fechas_bloqueadas: 2 }, error: null })
    const r = await cargarMisServiciosDps()
    expect(rpc).toHaveBeenCalledWith('dps_mis_servicios', undefined)
    expect(r).toMatchObject({ ok: true, data: { servicios: [{ planId: PLAN, estado: 'confirmo' }], avisos: [], porResponder: 0, fechasBloqueadas: 2 } })
  })

  it('reads one service; a plan where the person is not notified says so', async () => {
    rpc.mockResolvedValueOnce({ data: { servicio: SERVICIO, pasado: false, personas: 1, confirmaron: 1, companeros: [], orden: [] }, error: null })
    expect(await cargarMiServicioDps({ planId: PLAN })).toMatchObject({ ok: true, data: { servicio: { planId: PLAN }, personas: 1 } })
    expect(rpc).toHaveBeenCalledWith('dps_mi_servicio', { p_plan_id: PLAN })
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'sin_autoridad' } })
    expect(await cargarMiServicioDps({ planId: PLAN })).toEqual({
      ok: false,
      message: 'Ya no estás programado en este servicio. Actualiza la página.',
      codigo: 'sin_autoridad',
    })
  })

  it('confirms (no motivo sent) and says no with a trimmed motivo', async () => {
    rpc.mockResolvedValue({ data: SERVICIO, error: null })
    expect(await responderServicioDps({ planId: PLAN, respuesta: 'confirmo', motivo: 'ignorado' })).toMatchObject({ ok: true, data: { planId: PLAN } })
    await responderServicioDps({ planId: PLAN, respuesta: 'no_puede', motivo: '  Viaje a Carora ' })
    await responderServicioDps({ planId: PLAN, respuesta: 'no_puede', motivo: '   ' })
    expect(rpc.mock.calls).toEqual([
      ['dps_responder', { p_plan_id: PLAN, p_respuesta: 'confirmo', p_motivo: null }],
      ['dps_responder', { p_plan_id: PLAN, p_respuesta: 'no_puede', p_motivo: 'Viaje a Carora' }],
      ['dps_responder', { p_plan_id: PLAN, p_respuesta: 'no_puede', p_motivo: null }],
    ])
    // S14.4: each «No puedo» sends the planner's e-mail right away; Confirmar sends nothing.
    expect(despachar).toHaveBeenCalledTimes(2)
  })

  it('dispatches nothing when «No puedo» fails', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'plan_pasado', code: '22023' } })
    await responderServicioDps({ planId: PLAN, respuesta: 'no_puede', motivo: null })
    expect(despachar).not.toHaveBeenCalled()
  })

  it('refuses a bad answer or a long motivo before asking, and maps plan_pasado', async () => {
    expect(await responderServicioDps({ planId: PLAN, respuesta: 'tal_vez' as never })).toEqual({ ok: false, message: 'Elige Confirmar o No puedo.', codigo: 'respuesta_invalida' })
    expect(await responderServicioDps({ planId: PLAN, respuesta: 'no_puede', motivo: 'x'.repeat(301) })).toEqual({
      ok: false,
      message: 'El motivo va hasta 300 caracteres.',
      codigo: 'motivo_invalido',
    })
    expect(await responderServicioDps({ planId: 'x', respuesta: 'confirmo' })).toEqual(DATOS)
    expect(rpc).not.toHaveBeenCalled()
    rpc.mockResolvedValueOnce({ data: null, error: { code: '22023', message: 'plan_pasado' } })
    expect(await responderServicioDps({ planId: PLAN, respuesta: 'confirmo' })).toEqual({
      ok: false,
      message: 'Este servicio ya pasó: ya no puedes responder.',
      codigo: 'plan_pasado',
    })
  })

  it('dismisses a notice', async () => {
    rpc.mockResolvedValueOnce({ data: true, error: null })
    expect(await marcarAvisoVistoDps({ planId: PLAN })).toEqual({ ok: true, data: null })
    expect(rpc).toHaveBeenCalledWith('dps_aviso_visto', { p_plan_id: PLAN })
  })
})

describe('the person: blocked dates', () => {
  const FILA = { id: BLOQUEO, desde: '2026-12-20', hasta: '2027-01-03', nota: 'Vacaciones', conflictos: [SERVICIO] }

  it('lists them', async () => {
    rpc.mockResolvedValueOnce({ data: [FILA], error: null })
    expect(await cargarMisFechasBloqueadasDps()).toMatchObject({ ok: true, data: [{ id: BLOQUEO, conflictos: [{ planId: PLAN }] }] })
    expect(rpc).toHaveBeenCalledWith('dps_mis_fechas_bloqueadas', undefined)
  })

  it('adds a range (nota trimmed) and returns its conflicts', async () => {
    rpc.mockResolvedValueOnce({ data: FILA, error: null })
    expect(await agregarFechaBloqueadaDps({ desde: '2026-12-20', hasta: '2027-01-03', nota: ' Vacaciones ' })).toMatchObject({
      ok: true,
      data: { id: BLOQUEO, conflictos: [{ planId: PLAN, estado: 'confirmo' }] },
    })
    expect(rpc).toHaveBeenCalledWith('dps_fecha_bloqueada_agregar', { p_desde: '2026-12-20', p_hasta: '2027-01-03', p_nota: 'Vacaciones' })
  })

  it('checks the range before asking and maps the database codes', async () => {
    expect(await agregarFechaBloqueadaDps({ desde: '2027-01-03', hasta: '2026-12-20' })).toMatchObject({ ok: false, codigo: 'rango_invalido' })
    expect(await agregarFechaBloqueadaDps({ desde: 'mañana', hasta: '2026-12-20' })).toMatchObject({ ok: false, codigo: 'fecha_invalida' })
    expect(rpc).not.toHaveBeenCalled()
    rpc.mockResolvedValueOnce({ data: null, error: { code: '22023', message: 'fecha_pasada' } })
    expect(await agregarFechaBloqueadaDps({ desde: '2020-01-01', hasta: '2020-01-02' })).toEqual({
      ok: false,
      message: 'Esas fechas ya pasaron. Elige fechas de hoy en adelante.',
      codigo: 'fecha_pasada',
    })
  })

  it('removes one of their own; another person’s reads as gone', async () => {
    rpc.mockResolvedValueOnce({ data: true, error: null })
    expect(await quitarFechaBloqueadaDps({ id: BLOQUEO })).toEqual({ ok: true, data: null })
    expect(rpc).toHaveBeenCalledWith('dps_fecha_bloqueada_quitar', { p_id: BLOQUEO })
    rpc.mockResolvedValueOnce({ data: null, error: { code: '22023', message: 'bloqueo_invalido' } })
    expect(await quitarFechaBloqueadaDps({ id: BLOQUEO })).toEqual({
      ok: false,
      message: 'Esa fecha ya no está en tu lista. Actualiza la página.',
      codigo: 'bloqueo_invalido',
    })
    expect(await quitarFechaBloqueadaDps({ id: 'x' })).toEqual(DATOS)
  })

  it('needs a session', async () => {
    getUser.mockResolvedValueOnce({ data: { user: null } })
    expect(await cargarMisServiciosDps()).toEqual(SIN_SESION)
    expect(rpc).not.toHaveBeenCalled()
  })
})
