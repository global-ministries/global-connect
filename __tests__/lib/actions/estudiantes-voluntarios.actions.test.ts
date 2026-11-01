/**
 * Server actions of /estudiantes/voluntarios (C5): they call the
 * estudiantes_voluntarios_* RPCs with the session client, check the input
 * before calling, never revalidate (the client applies the marks in place)
 * and return the RPC errors in Spanish.
 */
const rpc = jest.fn()
const getUser = jest.fn()
const revalidatePath = jest.fn()

jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser }, rpc }),
}))
jest.mock('next/cache', () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }))

import { cargarPlanillaVoluntarios, marcarVoluntarios } from '@/lib/actions/estudiantes-voluntarios.actions'

const TURNO = '66666666-6666-4666-8666-666666666666'
const S1 = '11111111-1111-4111-8111-111111111111'
const S2 = '22222222-2222-4222-8222-222222222222'

beforeEach(() => {
  rpc.mockReset()
  getUser.mockReset()
  revalidatePath.mockReset()
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
})

describe('cargarPlanillaVoluntarios', () => {
  it('reads the roster of the service', async () => {
    rpc.mockResolvedValueOnce({
      data: {
        turno: 'The Living Room',
        fecha: '2026-10-28',
        editable: true,
        areas: [{ id: 'a1', nombre: 'The Living Room' }],
        voluntarios: [{ servicio_id: S1, nombre: 'Ana', apellido: null, area_id: 'a1', area: 'The Living Room', equipo_id: 'e1', equipo: 'Producción', rol: 'voluntario', esperado: true, sin_turno: false, estado: 'presente' }],
      },
      error: null,
    })
    const r = await cargarPlanillaVoluntarios({ turnoId: TURNO, fecha: '2026-10-28' })
    expect(rpc).toHaveBeenCalledWith('estudiantes_voluntarios_planilla', { p_turno_id: TURNO, p_fecha: '2026-10-28' })
    expect(r).toMatchObject({ ok: true, data: { editable: true, voluntarios: [{ servicio_id: S1, estado: 'presente', esperado: true }] } })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('rejects a bad turno or date before calling', async () => {
    expect(await cargarPlanillaVoluntarios({ turnoId: 'x', fecha: '2026-10-28' })).toEqual({ ok: false, message: 'Revisa los datos e inténtalo de nuevo.' })
    expect(await cargarPlanillaVoluntarios({ turnoId: TURNO, fecha: '28/10/2026' })).toMatchObject({ ok: false })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('asks to sign in again without a session', async () => {
    getUser.mockResolvedValueOnce({ data: { user: null } })
    expect(await cargarPlanillaVoluntarios({ turnoId: TURNO, fecha: '2026-10-28' })).toEqual({ ok: false, message: 'Tu sesión terminó. Vuelve a iniciar sesión.' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('explains a date the service does not happen on', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '22023', message: 'fecha_invalida' } })
    expect(await cargarPlanillaVoluntarios({ turnoId: TURNO, fecha: '2026-10-29' })).toEqual({
      ok: false,
      message: 'Esa fecha no es día de este servicio. Elige otra fecha.',
    })
  })
})

describe('marcarVoluntarios', () => {
  it('marks the servicios and returns how many changed', async () => {
    rpc.mockResolvedValueOnce({ data: { estado: 'ausente', servicios: 2, cambiados: 1 }, error: null })
    const r = await marcarVoluntarios({ turnoId: TURNO, fecha: '2026-10-25', servicioIds: [S1, S2], estado: 'ausente', soloSinMarcar: true })
    expect(rpc).toHaveBeenCalledWith('estudiantes_voluntarios_marcar', {
      p_turno_id: TURNO,
      p_fecha: '2026-10-25',
      p_servicio_ids: [S1, S2],
      p_estado: 'ausente',
      p_solo_sin_marcar: true,
    })
    expect(r).toEqual({ ok: true, data: { cambiados: 1 } })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('clears a mark with estado null', async () => {
    rpc.mockResolvedValueOnce({ data: { estado: null, servicios: 1, cambiados: 1 }, error: null })
    expect(await marcarVoluntarios({ turnoId: TURNO, fecha: '2026-10-25', servicioIds: [S1], estado: null })).toEqual({ ok: true, data: { cambiados: 1 } })
    expect(rpc).toHaveBeenCalledWith('estudiantes_voluntarios_marcar', expect.objectContaining({ p_estado: null, p_solo_sin_marcar: false }))
  })

  it('rejects a bad estado, bad ids or too many before calling', async () => {
    const base = { turnoId: TURNO, fecha: '2026-10-25', servicioIds: [S1], estado: 'presente' as const }
    expect(await marcarVoluntarios({ ...base, estado: 'tarde' as unknown as 'presente' })).toMatchObject({ ok: false })
    expect(await marcarVoluntarios({ ...base, servicioIds: ['x'] })).toMatchObject({ ok: false })
    expect(await marcarVoluntarios({ ...base, servicioIds: [] })).toMatchObject({ ok: false })
    expect(await marcarVoluntarios({ ...base, servicioIds: Array.from({ length: 301 }, () => S1) })).toMatchObject({ ok: false })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('maps the RPC errors', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'sin_autoridad' } })
    expect(await marcarVoluntarios({ turnoId: TURNO, fecha: '2026-10-25', servicioIds: [S1], estado: 'presente' })).toEqual({
      ok: false,
      message: 'No tienes permiso para marcar a este voluntario.',
    })
    rpc.mockResolvedValueOnce({ data: null, error: { code: '22023', message: 'fecha_invalida' } })
    expect(await marcarVoluntarios({ turnoId: TURNO, fecha: '2026-10-01', servicioIds: [S1], estado: 'presente' })).toEqual({
      ok: false,
      message: 'Solo se puede marcar el día del servicio, hoy o hasta 14 días atrás.',
    })
  })
})
