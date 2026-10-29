/**
 * Server actions of /estudiantes/grupos (C2): they call the Estudiantes RPCs
 * with the session client, leave optional DEFAULT NULL arguments out, check
 * ids before calling and turn RPC errors into Spanish messages.
 */
const rpc = jest.fn()
const getUser = jest.fn()

jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser }, rpc }),
}))
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))

import {
  agregarIntegrante,
  buscarPersonas,
  crearGrupo,
  editarGrupo,
  moverIntegrante,
} from '@/lib/actions/estudiantes-grupos.actions'

const SUBAREA = '11111111-1111-4111-8111-111111111111'
const CAMPUS = '22222222-2222-4222-8222-222222222222'
const GRUPO = '33333333-3333-4333-8333-333333333333'
const PERSONA = '44444444-4444-4444-8444-444444444444'
const SERVICIO = '55555555-5555-4555-8555-555555555555'

beforeEach(() => {
  rpc.mockReset()
  getUser.mockReset()
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
})

describe('crearGrupo', () => {
  it('creates a Transit group without the The Living Room arguments, then sets its leaders', async () => {
    rpc.mockResolvedValueOnce({ data: GRUPO, error: null }).mockResolvedValueOnce({ data: 1, error: null })
    const resultado = await crearGrupo({
      subareaId: SUBAREA,
      campusId: CAMPUS,
      nombre: ' 2do año · Chicas ',
      anio: 2,
      zona: null,
      diaSemana: null,
      hora: null,
      lideres: [SERVICIO],
    })
    expect(resultado).toEqual({ ok: true, data: { grupoId: GRUPO, aviso: null } })
    expect(rpc).toHaveBeenNthCalledWith(1, 'estudiantes_grupo_crear', {
      p_subarea_id: SUBAREA,
      p_campus_id: CAMPUS,
      p_nombre: '2do año · Chicas',
      p_anio: 2,
    })
    expect(rpc).toHaveBeenNthCalledWith(2, 'estudiantes_grupo_lideres_fijar', { p_grupo_id: GRUPO, p_servicio_ids: [SERVICIO] })
  })

  it('sends zona, día and hora for The Living Room and skips the leaders call without leaders', async () => {
    rpc.mockResolvedValueOnce({ data: GRUPO, error: null })
    await crearGrupo({ subareaId: SUBAREA, campusId: CAMPUS, nombre: 'Zona Este · Chicos', anio: null, zona: 'Zona Este', diaSemana: 4, hora: '19:30', lideres: [] })
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('estudiantes_grupo_crear', {
      p_subarea_id: SUBAREA,
      p_campus_id: CAMPUS,
      p_nombre: 'Zona Este · Chicos',
      p_zona: 'Zona Este',
      p_dia_semana: 4,
      p_hora: '19:30',
    })
  })

  it('maps a duplicate name to its message', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '23505', message: 'nombre_duplicado' } })
    const resultado = await crearGrupo({ subareaId: SUBAREA, campusId: CAMPUS, nombre: 'X', anio: 2, zona: null, diaSemana: null, hora: null, lideres: [] })
    expect(resultado).toEqual({ ok: false, message: 'Ya hay un grupo con ese nombre en esta sub-área. Elige otro.' })
  })

  it('keeps the group when the leaders fail and says so', async () => {
    rpc.mockResolvedValueOnce({ data: GRUPO, error: null }).mockResolvedValueOnce({ data: null, error: { message: 'servicio_invalido' } })
    const resultado = await crearGrupo({ subareaId: SUBAREA, campusId: CAMPUS, nombre: 'X', anio: 2, zona: null, diaSemana: null, hora: null, lideres: [SERVICIO] })
    expect(resultado).toEqual({
      ok: true,
      data: { grupoId: GRUPO, aviso: 'El grupo se creó, pero no se pudieron asignar los líderes. Uno de los líderes ya no sirve en esta sub-área. Recarga la página y vuelve a elegir.' },
    })
  })

  it('refuses without a session or with a bad id, before calling the database', async () => {
    getUser.mockResolvedValueOnce({ data: { user: null } })
    expect(await crearGrupo({ subareaId: SUBAREA, campusId: CAMPUS, nombre: 'X', anio: 2, zona: null, diaSemana: null, hora: null, lideres: [] })).toEqual({
      ok: false,
      message: 'Tu sesión terminó. Vuelve a iniciar sesión.',
    })
    expect(await crearGrupo({ subareaId: 'x', campusId: CAMPUS, nombre: 'X', anio: 2, zona: null, diaSemana: null, hora: null, lideres: [] })).toEqual({
      ok: false,
      message: 'Revisa los datos e inténtalo de nuevo.',
    })
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('editarGrupo', () => {
  it('sends every argument (the function has no defaults), null where it does not apply', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null })
    expect(await editarGrupo({ grupoId: GRUPO, nombre: '3er año · Chicas', anio: 3, zona: null, diaSemana: null, hora: null })).toEqual({ ok: true, data: null })
    expect(rpc).toHaveBeenCalledWith('estudiantes_grupo_editar', {
      p_grupo_id: GRUPO,
      p_nombre: '3er año · Chicas',
      p_anio: 3,
      p_zona: null,
      p_dia_semana: null,
      p_hora: null,
    })
  })
})

describe('members', () => {
  it('adds a person as miembro', async () => {
    rpc.mockResolvedValueOnce({ data: 'm1', error: null })
    expect(await agregarIntegrante({ grupoId: GRUPO, personaId: PERSONA })).toEqual({ ok: true, data: null })
    expect(rpc).toHaveBeenCalledWith('estudiantes_grupo_miembro_agregar', { p_grupo_id: GRUPO, p_persona_id: PERSONA, p_estado: 'miembro' })
  })

  it('moves a person in one call', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'sin_autoridad' } })
    expect(await moverIntegrante({ grupoId: GRUPO, personaId: PERSONA })).toEqual({ ok: false, message: 'No tienes permiso para gestionar este grupo.' })
    expect(rpc).toHaveBeenCalledWith('estudiantes_grupo_miembro_mover', { p_persona_id: PERSONA, p_grupo_id: GRUPO })
  })
})

describe('buscarPersonas', () => {
  it('does not search below three characters', async () => {
    expect(await buscarPersonas({ grupoId: GRUPO, consulta: 'lu' })).toEqual({ ok: true, data: [] })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('searches a full name and maps the matches', async () => {
    rpc.mockResolvedValueOnce({
      data: [{ persona_id: PERSONA, nombre: 'Lucía', apellido: 'Fernández', coincide: ['nombre'], grupo_id: null, grupo: null, en_este_grupo: false }],
      error: null,
    })
    expect(await buscarPersonas({ grupoId: GRUPO, consulta: 'Lucía Fernández' })).toEqual({
      ok: true,
      data: [{ personaId: PERSONA, nombre: 'Lucía Fernández', grupoId: null, grupo: null, enEsteGrupo: false }],
    })
    expect(rpc).toHaveBeenCalledWith('estudiantes_buscar_personas', { p_grupo_id: GRUPO, p_nombre: 'Lucía Fernández' })
  })
})
