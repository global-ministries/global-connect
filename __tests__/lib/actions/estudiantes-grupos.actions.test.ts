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
  agregarRepresentante,
  buscarPersonas,
  crearGrupo,
  editarGrupo,
  historialLideres,
  moverIntegrante,
  quitarRepresentante,
} from '@/lib/actions/estudiantes-grupos.actions'

const SUBAREA = '11111111-1111-4111-8111-111111111111'
const CAMPUS = '22222222-2222-4222-8222-222222222222'
const GRUPO = '33333333-3333-4333-8333-333333333333'
const PERSONA = '44444444-4444-4444-8444-444444444444'
const SERVICIO = '55555555-5555-4555-8555-555555555555'
const REPRESENTANTE = '66666666-6666-4666-8666-666666666666'

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
      data: [{ personaId: PERSONA, nombre: 'Lucía Fernández', grupoId: null, grupo: null, enEsteGrupo: false, coincide: ['nombre'] }],
    })
    expect(rpc).toHaveBeenCalledWith('estudiantes_buscar_personas', { p_grupo_id: GRUPO, p_nombre: 'Lucía Fernández' })
  })

  it('passes what matched through, an empty list when the database sends none', async () => {
    rpc.mockResolvedValueOnce({
      data: [
        { persona_id: PERSONA, nombre: 'Lucía', apellido: 'Fernández', coincide: ['cedula', 'telefono'], grupo_id: null, grupo: null, en_este_grupo: false },
        { persona_id: REPRESENTANTE, nombre: 'Ana', apellido: null, coincide: null, grupo_id: null, grupo: null, en_este_grupo: false },
      ],
      error: null,
    })
    const resultado = await buscarPersonas({ grupoId: GRUPO, consulta: '04145550101' })
    expect(resultado.ok && resultado.data.map((p) => p.coincide)).toEqual([['cedula', 'telefono'], []])
  })
})

describe('representantes (S2, S3)', () => {
  it('adds a picked person with the exact arguments and refreshes', async () => {
    rpc.mockResolvedValueOnce({ data: { representante_id: REPRESENTANTE, creado: false }, error: null })
    expect(
      await agregarRepresentante({ grupoId: GRUPO, personaId: PERSONA, representante: { persona_id: REPRESENTANTE, tipo: 'tutor' } }),
    ).toEqual({ ok: true, data: null })
    expect(rpc).toHaveBeenCalledWith('estudiantes_representante_agregar', {
      p_grupo_id: GRUPO,
      p_persona_id: PERSONA,
      p_representante: { persona_id: REPRESENTANTE, tipo: 'tutor' },
    })
    const { revalidatePath } = jest.requireMock('next/cache') as { revalidatePath: jest.Mock }
    expect(revalidatePath).toHaveBeenCalledWith('/estudiantes/grupos')
  })

  it('sends a typed representante as it comes and turns its errors into Spanish', async () => {
    const tecleado = { nombre: 'José', apellido: 'Bermúdez', telefono: '0412 555 0118', cedula: 'V-12345678', genero: 'Masculino', tipo: 'padre' }
    rpc.mockResolvedValueOnce({ data: null, error: { code: '23505', message: 'relacion_existente' } })
    expect(await agregarRepresentante({ grupoId: GRUPO, personaId: PERSONA, representante: tecleado })).toEqual({
      ok: false,
      message: 'Esa persona ya tiene otra relación familiar con el estudiante.',
    })
    expect(rpc).toHaveBeenCalledWith('estudiantes_representante_agregar', { p_grupo_id: GRUPO, p_persona_id: PERSONA, p_representante: tecleado })
    rpc.mockResolvedValueOnce({ data: null, error: { code: '22023', message: 'representante_invalido' } })
    expect(await agregarRepresentante({ grupoId: GRUPO, personaId: PERSONA, representante: tecleado })).toEqual({
      ok: false,
      message: 'Una persona no puede ser su propio representante.',
    })
  })

  it('explains a too long field and a taken cédula in the words of the representante form', async () => {
    const tecleado = { nombre: 'José', telefono: '0412 555 0118', genero: 'Masculino', tipo: 'padre' }
    rpc.mockResolvedValueOnce({ data: null, error: { code: '22023', message: 'texto_muy_largo' } })
    expect(await agregarRepresentante({ grupoId: GRUPO, personaId: PERSONA, representante: tecleado })).toEqual({
      ok: false,
      message: 'Nombre, apellido, teléfono y cédula del representante admiten hasta 80 caracteres.',
    })
    rpc.mockResolvedValueOnce({ data: null, error: { code: '23505', message: 'cedula_existente' } })
    expect(await agregarRepresentante({ grupoId: GRUPO, personaId: PERSONA, representante: tecleado })).toEqual({
      ok: false,
      message: 'Ya hay alguien con esa cédula. Búscalo por su cédula y elígelo.',
    })
  })

  it('refuses a bad id or a representante that is not an object, before calling the database', async () => {
    expect(await agregarRepresentante({ grupoId: 'x', personaId: PERSONA, representante: { persona_id: REPRESENTANTE, tipo: 'padre' } })).toEqual({
      ok: false,
      message: 'Revisa los datos e inténtalo de nuevo.',
    })
    expect(
      await agregarRepresentante({ grupoId: GRUPO, personaId: PERSONA, representante: ['x'] as unknown as { tipo: 'padre'; persona_id: string } }),
    ).toEqual({ ok: false, message: 'Revisa los datos e inténtalo de nuevo.' })
    expect(await quitarRepresentante({ grupoId: GRUPO, personaId: PERSONA, representanteId: 'x' })).toEqual({
      ok: false,
      message: 'Revisa los datos e inténtalo de nuevo.',
    })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('removes the link with the exact arguments and maps a refusal', async () => {
    rpc.mockResolvedValueOnce({ data: true, error: null })
    expect(await quitarRepresentante({ grupoId: GRUPO, personaId: PERSONA, representanteId: REPRESENTANTE })).toEqual({ ok: true, data: null })
    expect(rpc).toHaveBeenCalledWith('estudiantes_representante_quitar', { p_grupo_id: GRUPO, p_persona_id: PERSONA, p_representante_id: REPRESENTANTE })
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'sin_autoridad' } })
    expect(await quitarRepresentante({ grupoId: GRUPO, personaId: PERSONA, representanteId: REPRESENTANTE })).toEqual({
      ok: false,
      message: 'No tienes permiso para gestionar este grupo.',
    })
  })
})

describe('historialLideres', () => {
  it('reads every period of the group', async () => {
    rpc.mockResolvedValueOnce({
      data: [
        {
          servicio_id: SERVICIO,
          persona_id: PERSONA,
          nombre: 'Ana',
          apellido: 'Pérez',
          rol: 'Líder',
          desde: '2025-01-15T12:00:00+00:00',
          hasta: '2025-06-20T12:00:00+00:00',
          cerrado_por_nombre: 'Carla Ruiz',
        },
      ],
      error: null,
    })
    expect(await historialLideres({ grupoId: GRUPO })).toEqual({
      ok: true,
      data: [
        {
          servicioId: SERVICIO,
          personaId: PERSONA,
          nombre: 'Ana Pérez',
          rol: 'Líder',
          desde: '2025-01-15T12:00:00+00:00',
          hasta: '2025-06-20T12:00:00+00:00',
          cerradoPor: 'Carla Ruiz',
        },
      ],
    })
    expect(rpc).toHaveBeenCalledWith('estudiantes_grupo_lideres_historial', { p_grupo_id: GRUPO })
  })

  it('turns a refusal into Spanish and checks the id before calling', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'sin_autoridad' } })
    expect(await historialLideres({ grupoId: GRUPO })).toEqual({ ok: false, message: 'No tienes permiso para gestionar este grupo.' })
    rpc.mockReset()
    expect(await historialLideres({ grupoId: 'x' })).toEqual({ ok: false, message: 'Revisa los datos e inténtalo de nuevo.' })
    expect(rpc).not.toHaveBeenCalled()
  })
})
