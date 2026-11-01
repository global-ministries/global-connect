/**
 * Server actions of the leader list (C3b): they call the Estudiantes RPCs
 * with the session client, send a null turno only for The Living Room, leave
 * optional DEFAULT NULL arguments out, check ids and dates before calling and
 * return the RPC error in Spanish with its code.
 */
const rpc = jest.fn()
const getUser = jest.fn()
const revalidatePath = jest.fn()

jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser }, rpc }),
}))
jest.mock('next/cache', () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }))

import {
  agregarVisitante,
  buscarCoincidencias,
  confirmarMiembroLista,
  crearVisitante,
  guardarLugar,
  marcarAsistencia,
  sesionReciente,
} from '@/lib/actions/estudiantes-lista.actions'

const GRUPO = '33333333-3333-4333-8333-333333333333'
const PERSONA = '44444444-4444-4444-8444-444444444444'
const TURNO = '66666666-6666-4666-8666-666666666666'

beforeEach(() => {
  rpc.mockReset()
  getUser.mockReset()
  revalidatePath.mockReset()
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
})

describe('marcarAsistencia', () => {
  it('marks with the turno and returns the visits, without refreshing the page', async () => {
    rpc.mockResolvedValueOnce({ data: { reunion_id: 'r1', estado: 'presente', visitas: 3, sugerir_confirmar: true }, error: null })
    const r = await marcarAsistencia({ grupoId: GRUPO, fecha: '2026-10-25', turnoId: TURNO, personaId: PERSONA, estado: 'presente' })
    expect(r).toEqual({ ok: true, data: { visitas: 3, sugerirConfirmar: true } })
    expect(rpc).toHaveBeenCalledWith('estudiantes_marcar', {
      p_grupo_id: GRUPO,
      p_fecha: '2026-10-25',
      p_turno_id: TURNO,
      p_persona_id: PERSONA,
      p_estado: 'presente',
    })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('clears with a null estado and sends a null turno for The Living Room', async () => {
    rpc.mockResolvedValueOnce({ data: { visitas: 0, sugerir_confirmar: false }, error: null })
    await marcarAsistencia({ grupoId: GRUPO, fecha: '2026-10-29', turnoId: null, personaId: PERSONA, estado: null })
    expect(rpc).toHaveBeenCalledWith('estudiantes_marcar', {
      p_grupo_id: GRUPO,
      p_fecha: '2026-10-29',
      p_turno_id: null,
      p_persona_id: PERSONA,
      p_estado: null,
    })
  })

  it('rejects a bad date or estado before calling, and maps the RPC error', async () => {
    expect(await marcarAsistencia({ grupoId: GRUPO, fecha: '25/10/2026', turnoId: TURNO, personaId: PERSONA, estado: 'presente' })).toEqual({
      ok: false,
      message: 'Revisa los datos e inténtalo de nuevo.',
      codigo: 'datos_invalidos',
    })
    expect(
      await marcarAsistencia({ grupoId: GRUPO, fecha: '2026-10-25', turnoId: TURNO, personaId: PERSONA, estado: 'visitante' as unknown as 'presente' }),
    ).toMatchObject({ ok: false, codigo: 'datos_invalidos' })
    expect(rpc).not.toHaveBeenCalled()

    rpc.mockResolvedValueOnce({ data: null, error: { code: '22023', message: 'fecha_invalida' } })
    expect(await marcarAsistencia({ grupoId: GRUPO, fecha: '2026-10-25', turnoId: TURNO, personaId: PERSONA, estado: 'ausente' })).toEqual({
      ok: false,
      message: 'Esa fecha no tiene reunión para marcar. Elige otra.',
      codigo: 'fecha_invalida',
    })
  })

  it('asks to sign in again without a session', async () => {
    getUser.mockResolvedValueOnce({ data: { user: null } })
    expect(await marcarAsistencia({ grupoId: GRUPO, fecha: '2026-10-25', turnoId: TURNO, personaId: PERSONA, estado: 'presente' })).toEqual({
      ok: false,
      message: 'Tu sesión terminó. Vuelve a iniciar sesión.',
      codigo: null,
    })
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('guardarLugar', () => {
  it('saves the trimmed place of a The Living Room meeting', async () => {
    rpc.mockResolvedValueOnce({ data: 'r1', error: null })
    expect(await guardarLugar({ grupoId: GRUPO, fecha: '2026-10-29', turnoId: null, lugar: '  Casa de Adrián ' })).toEqual({ ok: true, data: null })
    expect(rpc).toHaveBeenCalledWith('estudiantes_reunion_guardar', { p_grupo_id: GRUPO, p_fecha: '2026-10-29', p_turno_id: null, p_lugar: 'Casa de Adrián' })
  })

  it('leaves p_lugar out to clear it', async () => {
    rpc.mockResolvedValueOnce({ data: 'r1', error: null })
    await guardarLugar({ grupoId: GRUPO, fecha: '2026-10-29', turnoId: null, lugar: ' ' })
    expect(rpc).toHaveBeenCalledWith('estudiantes_reunion_guardar', { p_grupo_id: GRUPO, p_fecha: '2026-10-29', p_turno_id: null })
  })
})

describe('visitors', () => {
  it('adds a person found by the search and refreshes the list', async () => {
    rpc.mockResolvedValueOnce({ data: { persona_id: PERSONA, estado: 'visitante' }, error: null })
    expect(await agregarVisitante({ grupoId: GRUPO, fecha: '2026-10-25', turnoId: TURNO, personaId: PERSONA })).toEqual({ ok: true, data: null })
    expect(rpc).toHaveBeenCalledWith('estudiantes_visitante_agregar', { p_grupo_id: GRUPO, p_fecha: '2026-10-25', p_turno_id: TURNO, p_persona_id: PERSONA })
    expect(revalidatePath).toHaveBeenCalledWith(`/estudiantes/grupos/${GRUPO}`)
  })

  it('creates a visitor with p_datos and returns the new person', async () => {
    rpc.mockResolvedValueOnce({ data: { persona_id: PERSONA, reunion_id: 'r1' }, error: null })
    const datos = { nombre: 'Luciana', apellido: 'Ferrer', genero: 'Femenino', telefono: '0414 555 0174', anio: 2 }
    expect(await crearVisitante({ grupoId: GRUPO, fecha: '2026-10-25', turnoId: TURNO, datos })).toEqual({ ok: true, data: { personaId: PERSONA } })
    expect(rpc).toHaveBeenCalledWith('estudiantes_visitante_crear', { p_grupo_id: GRUPO, p_fecha: '2026-10-25', p_turno_id: TURNO, p_datos: datos })
  })

  it('returns posibles_duplicados and cedula_existente as codes the form handles', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '23505', message: 'posibles_duplicados' } })
    expect(await crearVisitante({ grupoId: GRUPO, fecha: '2026-10-25', turnoId: TURNO, datos: { nombre: 'Luciana' } })).toMatchObject({
      ok: false,
      codigo: 'posibles_duplicados',
    })
    rpc.mockResolvedValueOnce({ data: null, error: { code: '23505', message: 'cedula_existente' } })
    expect(await crearVisitante({ grupoId: GRUPO, fecha: '2026-10-25', turnoId: TURNO, datos: { nombre: 'Luciana' } })).toMatchObject({
      ok: false,
      codigo: 'cedula_existente',
    })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('rejects datos that are not an object', async () => {
    expect(await crearVisitante({ grupoId: GRUPO, fecha: '2026-10-25', turnoId: TURNO, datos: [] as unknown as Record<string, never> })).toMatchObject({
      ok: false,
      codigo: 'datos_invalidos',
    })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('searches the possible duplicates by name, apellido and teléfono', async () => {
    rpc.mockResolvedValueOnce({
      data: [{ persona_id: PERSONA, nombre: 'Lucía', apellido: 'Fernández', coincide: ['nombre'], grupo_id: null, grupo: null, en_este_grupo: false }],
      error: null,
    })
    expect(await buscarCoincidencias({ grupoId: GRUPO, nombre: 'Lucía', apellido: 'Fernández', telefono: '0412 555 0187' })).toEqual({
      ok: true,
      data: [{ personaId: PERSONA, nombre: 'Lucía Fernández', grupoId: null, grupo: null, enEsteGrupo: false }],
    })
    expect(rpc).toHaveBeenCalledWith('estudiantes_buscar_personas', {
      p_grupo_id: GRUPO,
      p_nombre: 'Lucía',
      p_apellido: 'Fernández',
      p_telefono: '0412 555 0187',
    })
  })

  it('confirms a visitor as member', async () => {
    rpc.mockResolvedValueOnce({ data: true, error: null })
    expect(await confirmarMiembroLista({ grupoId: GRUPO, personaId: PERSONA })).toEqual({ ok: true, data: null })
    expect(rpc).toHaveBeenCalledWith('estudiantes_confirmar_miembro', { p_grupo_id: GRUPO, p_persona_id: PERSONA })
    expect(revalidatePath).toHaveBeenCalledWith(`/estudiantes/grupos/${GRUPO}`)
  })
})

describe('sesionReciente', () => {
  it('returns the newest meeting of the group, or null without one', async () => {
    rpc.mockResolvedValueOnce({ data: [{ fecha: '2026-10-25', turno_id: TURNO }, { fecha: '2026-10-18', turno_id: TURNO }], error: null })
    expect(await sesionReciente({ grupoId: GRUPO })).toEqual({ ok: true, data: { fecha: '2026-10-25', turnoId: TURNO } })
    expect(rpc).toHaveBeenCalledWith('estudiantes_grupo_sesiones', { p_grupo_id: GRUPO })
    rpc.mockResolvedValueOnce({ data: [], error: null })
    expect(await sesionReciente({ grupoId: GRUPO })).toEqual({ ok: true, data: null })
  })
})
