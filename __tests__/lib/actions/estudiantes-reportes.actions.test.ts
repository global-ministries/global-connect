/**
 * Server actions of /estudiantes/reportes (C6d3): the group and person detail
 * drawers read estudiantes_reporte_detalle with the session client and named
 * parameters (exactly one of grupo / persona), check ids and dates before
 * calling, never revalidate and return the RPC error in Spanish with its code.
 * Every name is fictitious.
 */
const rpc = jest.fn()
const getUser = jest.fn()
const revalidatePath = jest.fn()

jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser }, rpc }),
}))
jest.mock('next/cache', () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }))

import { detalleGrupoReporte, detallePersonaReporte } from '@/lib/actions/estudiantes-reportes.actions'

const GRUPO = '11111111-1111-4111-8111-111111111111'
const PERSONA = '22222222-2222-4222-8222-222222222222'
const AMBITO = '33333333-3333-4333-8333-333333333333'
const RANGO = { desde: '2026-09-08', hasta: '2026-11-02' }

const detalleGrupo = {
  grupo: { grupo_id: GRUPO, nombre: '2do año · Chicas', ambito_id: AMBITO, ambito: 'Transit', subarea_id: 's1', subarea: 'Grupos de Chicas', anio: 2, anio_etiqueta: '2do año', dia_semana: null, hora: null, activo: true, lideres: ['Andrea Molina'] },
  desde: RANGO.desde,
  hasta: RANGO.hasta,
  resumen: { reuniones: 7, reuniones_esperadas: 8, sin_marcar: 1, sin_marcar_fechas: ['2026-10-18'], presentes: 40, ausentes: 30, visitantes: 1, promedio_presentes: 5.7, porcentaje: 57.1, reuniones_previas: 8, porcentaje_previo: 60, delta: -2.9 },
  reuniones: [],
  integrantes: [],
}

const detallePersona = {
  persona: { persona_id: PERSONA, nombre: 'Camila', apellido: 'Herrera', anio_etiqueta: '2do año', egresado: false },
  desde: RANGO.desde,
  hasta: RANGO.hasta,
  resumen: { reuniones: 8, presentes: 3, ausentes: 5, sin_marcar: 0, porcentaje: 37.5, ausencias_seguidas: 3, ultima_presente: '2026-10-11', grupos_en_rango: ['2do año · Chicas'] },
  membresias: [],
  reuniones: [],
}

beforeEach(() => {
  rpc.mockReset()
  getUser.mockReset()
  revalidatePath.mockReset()
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
})

describe('detalleGrupoReporte', () => {
  it('reads the group detail with only p_grupo_id', async () => {
    rpc.mockResolvedValueOnce({ data: detalleGrupo, error: null })
    const r = await detalleGrupoReporte({ grupoId: GRUPO, ...RANGO })
    expect(rpc).toHaveBeenCalledWith('estudiantes_reporte_detalle', { p_desde: RANGO.desde, p_hasta: RANGO.hasta, p_grupo_id: GRUPO })
    expect(r).toMatchObject({ ok: true, data: { grupo: { grupoId: GRUPO, nombre: '2do año · Chicas' }, resumen: { porcentaje: 57.1, delta: -2.9 } } })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('rejects bad ids or dates before calling', async () => {
    expect(await detalleGrupoReporte({ grupoId: 'x', ...RANGO })).toEqual({ ok: false, message: 'Revisa los datos e inténtalo de nuevo.', codigo: 'parametros_invalidos' })
    expect(await detalleGrupoReporte({ grupoId: GRUPO, desde: '08/09/2026', hasta: RANGO.hasta })).toMatchObject({ ok: false, codigo: 'parametros_invalidos' })
    expect(await detalleGrupoReporte({ grupoId: GRUPO, desde: RANGO.hasta, hasta: RANGO.desde })).toMatchObject({ ok: false, codigo: 'rango_invalido' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('maps the RPC errors', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'sin_autoridad' } })
    expect(await detalleGrupoReporte({ grupoId: GRUPO, ...RANGO })).toEqual({ ok: false, message: 'No tienes acceso a los reportes de este ámbito.', codigo: 'sin_autoridad' })
    rpc.mockResolvedValueOnce({ data: null, error: { code: '22023', message: 'grupo_invalido' } })
    expect(await detalleGrupoReporte({ grupoId: GRUPO, ...RANGO })).toMatchObject({ ok: false, codigo: 'grupo_invalido', message: 'Ese grupo ya no existe. Recarga la página.' })
  })

  it('treats a payload that is not a group detail as a failure', async () => {
    rpc.mockResolvedValueOnce({ data: detallePersona, error: null })
    expect(await detalleGrupoReporte({ grupoId: GRUPO, ...RANGO })).toEqual({ ok: false, message: 'No se pudo cargar el reporte. Recarga la página.', codigo: null })
  })

  it('asks to sign in again without a session', async () => {
    getUser.mockResolvedValueOnce({ data: { user: null } })
    expect(await detalleGrupoReporte({ grupoId: GRUPO, ...RANGO })).toEqual({ ok: false, message: 'Tu sesión terminó. Vuelve a iniciar sesión.', codigo: null })
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('detallePersonaReporte', () => {
  it('reads the person detail of one ámbito with only p_persona_id and p_ambito_id', async () => {
    rpc.mockResolvedValueOnce({ data: detallePersona, error: null })
    const r = await detallePersonaReporte({ personaId: PERSONA, ambitoId: AMBITO, ...RANGO })
    expect(rpc).toHaveBeenCalledWith('estudiantes_reporte_detalle', { p_desde: RANGO.desde, p_hasta: RANGO.hasta, p_persona_id: PERSONA, p_ambito_id: AMBITO })
    expect(r).toMatchObject({ ok: true, data: { persona: { personaId: PERSONA, nombre: 'Camila Herrera' }, resumen: { ausenciasSeguidas: 3 } } })
  })

  it('rejects a bad person or ámbito id before calling', async () => {
    expect(await detallePersonaReporte({ personaId: 'x', ambitoId: AMBITO, ...RANGO })).toMatchObject({ ok: false, codigo: 'parametros_invalidos' })
    expect(await detallePersonaReporte({ personaId: PERSONA, ambitoId: '', ...RANGO })).toMatchObject({ ok: false, codigo: 'parametros_invalidos' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('maps persona_invalida', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '22023', message: 'persona_invalida' } })
    expect(await detallePersonaReporte({ personaId: PERSONA, ambitoId: AMBITO, ...RANGO })).toEqual({
      ok: false,
      message: 'Esa persona ya no existe. Recarga la página.',
      codigo: 'persona_invalida',
    })
  })
})
