/**
 * Planner server wrappers (T5b and S24 of odd/tasks/planner-gdv.md): input
 * validation before any RPC, the exact RPC names and arguments, the Spanish
 * error messages (the RPC's own message for 22023/42501/40001/55000), the
 * position of the failed change of a save, and the server actions, which use
 * the session client and revalidate the planner route only after a saved call.
 */
import {
  FALTA_GUARDAR_CAMBIOS,
  RUTA_PLANNER,
  deshacerPaso,
  guardarCambios,
  marcarSegmento,
  mensajeErrorAccion,
  ultimosPasos,
  type CambioPlanner,
  type ClienteAcciones,
} from '@/lib/platform/grupos-vida/planner/acciones'

const T = '11111111-1111-4111-8111-111111111111'
const G = '22222222-2222-4222-8222-222222222222'
const U1 = '33333333-3333-4333-8333-333333333333'
const U2 = '44444444-4444-4444-8444-444444444444'
const S = '55555555-5555-4555-8555-555555555555'
const P = '66666666-6666-4666-8666-666666666666'

const PASO = { paso_id: P, descripcion: 'movió a Ana Pérez a Grupo Rosas', segmentos: [S], segmentos_reabiertos: [S] }

function cliente(respuesta: { data?: unknown; error?: { code?: string; message?: string; details?: string } | null } = { data: PASO }) {
  const rpc = jest.fn().mockResolvedValue({ data: respuesta.data ?? null, error: respuesta.error ?? null })
  return { rpc } satisfies ClienteAcciones
}

describe('mensajeErrorAccion', () => {
  it.each(['22023', '42501', '40001', '55000'])('keeps the RPC message for %s, with a final period', (code) => {
    expect(mensajeErrorAccion({ code, message: 'No se puede deshacer: después Héctor editó el grupo' })).toBe(
      'No se puede deshacer: después Héctor editó el grupo.',
    )
  })

  it('says the session ended for 28000 and gives a generic message otherwise', () => {
    expect(mensajeErrorAccion({ code: '28000', message: 'No autenticado' })).toBe('Tu sesión terminó. Vuelve a entrar.')
    expect(mensajeErrorAccion({ code: 'XX000', message: 'internal: relation foo' })).toBe('No se pudo guardar el cambio. Inténtalo de nuevo.')
    expect(mensajeErrorAccion({ code: '42501' })).toBe('No tienes permiso para hacer este cambio.')
    expect(mensajeErrorAccion(null)).toBe('No se pudo guardar el cambio. Inténtalo de nuevo.')
  })
})

describe('guardarCambios (S24)', () => {
  const DATOS = {
    nombre: '  Cabudare Matrimonios 10 ',
    segmento_id: S,
    localidad_id: G,
    dia_reunion: 'Jueves',
    hora_reunion: '19:30',
    capacidad_maxima: 12,
    director_etapa_ids: [U1],
  }
  const CAMBIOS: CambioPlanner[] = [
    { tipo: 'crear', clave: 'tmp:g1', datos: DATOS },
    { tipo: 'mover', usuarios: [U1, U2], grupo: 'tmp:g1', rol: 'lider' },
    { tipo: 'editar', grupo: G, cambios: { localidad_id: S } },
    { tipo: 'mover', usuarios: [U1], grupo: null, rol: 'miembro' },
    { tipo: 'eliminar', grupo: G },
  ]
  const RESPUESTA = { guardados: 5, pasos: [P, P, P, P, P], grupos_creados: { 'tmp:g1': G } }

  it('sends every change in order to planner_guardar_cambios, normalized, and reads what it saved', async () => {
    const c = cliente({ data: RESPUESTA })
    const r = await guardarCambios(c, { temporadaId: T, cambios: CAMBIOS })

    expect(c.rpc).toHaveBeenCalledWith('planner_guardar_cambios', {
      p_temporada_id: T,
      p_cambios: [
        { tipo: 'crear', clave: 'tmp:g1', datos: { ...DATOS, nombre: 'Cabudare Matrimonios 10' } },
        { tipo: 'mover', usuarios: [U1, U2], grupo: 'tmp:g1', rol: 'lider' },
        { tipo: 'editar', grupo: G, cambios: { localidad_id: S } },
        { tipo: 'mover', usuarios: [U1], grupo: null, rol: null },
        { tipo: 'eliminar', grupo: G },
      ],
    })
    expect(r).toEqual({ ok: true, datos: { guardados: 5, pasos: [P, P, P, P, P], gruposCreados: { 'tmp:g1': G } } })
  })

  it.each([
    [[{ tipo: 'mover', usuarios: [], grupo: G, rol: 'miembro' }], 'Cambio 1 de 1: Indica al menos una persona.', 0],
    [[{ tipo: 'mover', usuarios: ['nope'], grupo: G, rol: 'miembro' }], 'Cambio 1 de 1: Alguna de las personas no es válida.', 0],
    [[{ tipo: 'mover', usuarios: Array(21).fill(U1), grupo: G, rol: 'miembro' }], 'Cambio 1 de 1: Puedes mover hasta 20 personas por paso.', 0],
    [[{ tipo: 'mover', usuarios: [U1], grupo: G, rol: 'colider' }], 'Cambio 1 de 1: El rol debe ser Líder, Aprendiz o Miembro.', 0],
    [[{ tipo: 'mover', usuarios: [U1], grupo: 'tmp:g9', rol: 'miembro' }], 'Cambio 1 de 1: El grupo nuevo no se creó antes en estos cambios.', 0],
    [[{ tipo: 'eliminar', grupo: G }, { tipo: 'eliminar', grupo: 'tmp:g1' }], 'Cambio 2 de 2: El grupo no es válido.', 1],
    [[{ tipo: 'crear', clave: 'g1', datos: DATOS }], 'Cambio 1 de 1: La clave del grupo nuevo no es válida.', 0],
    [[{ tipo: 'crear', clave: 'tmp:g1', datos: DATOS }, { tipo: 'crear', clave: 'tmp:g1', datos: DATOS }], 'Cambio 2 de 2: La clave del grupo nuevo ya se usó.', 1],
    [[{ tipo: 'crear', clave: 'tmp:g1', datos: { ...DATOS, nombre: '  ' } }], 'Cambio 1 de 1: El grupo debe tener nombre.', 0],
    [[{ tipo: 'crear', clave: 'tmp:g1', datos: { ...DATOS, nombre: 'x'.repeat(121) } }], 'Cambio 1 de 1: El nombre del grupo puede tener hasta 120 caracteres.', 0],
    [[{ tipo: 'crear', clave: 'tmp:g1', datos: { ...DATOS, segmento_id: 'seg' } }], 'Cambio 1 de 1: El segmento no es válido.', 0],
    [[{ tipo: 'editar', grupo: G, cambios: { localidad_id: 'loc' } }], 'Cambio 1 de 1: La localidad no es válida.', 0],
    [[{ tipo: 'editar', grupo: G, cambios: { dia_reunion: 'Feriado' } }], 'Cambio 1 de 1: El día de reunión no es válido.', 0],
    [[{ tipo: 'editar', grupo: G, cambios: { hora_reunion: '7pm' } }], 'Cambio 1 de 1: La hora de reunión no es válida.', 0],
    [[{ tipo: 'editar', grupo: G, cambios: { capacidad_maxima: 0 } }], 'Cambio 1 de 1: La capacidad debe ser un número entero mayor que 0.', 0],
    [[{ tipo: 'editar', grupo: G, cambios: { director_etapa_ids: [U1, U2, S, G, P] } }], 'Cambio 1 de 1: Un grupo puede tener hasta 4 directores de etapa.', 0],
    [[{ tipo: 'editar', grupo: G, cambios: { director_etapa_ids: ['d'] } }], 'Cambio 1 de 1: Alguno de los directores de etapa no es válido.', 0],
    [[{ tipo: 'editar', grupo: G, cambios: {} }], 'Cambio 1 de 1: No hay cambios para guardar.', 0],
  ])('refuses %j before calling the RPC, with its position', async (cambios, mensaje, indice) => {
    const c = cliente()
    const r = await guardarCambios(c, { temporadaId: T, cambios: cambios as CambioPlanner[] })

    expect(r).toEqual({ ok: false, codigo: 'validacion', mensaje, indice })
    expect(c.rpc).not.toHaveBeenCalled()
  })

  it('refuses a bad season, an empty list and more than 200 changes', async () => {
    const c = cliente()
    const uno: CambioPlanner = { tipo: 'eliminar', grupo: G }

    expect(await guardarCambios(c, { temporadaId: 'x', cambios: [uno] })).toEqual({ ok: false, codigo: 'validacion', mensaje: 'La temporada no es válida.', indice: null })
    expect(await guardarCambios(c, { temporadaId: T, cambios: [] })).toEqual({ ok: false, codigo: 'validacion', mensaje: 'No hay cambios para guardar.', indice: null })
    expect(await guardarCambios(c, { temporadaId: T, cambios: Array(201).fill(uno) })).toEqual({
      ok: false,
      codigo: 'validacion',
      mensaje: 'Puedes guardar hasta 200 cambios a la vez.',
      indice: null,
    })
    expect(c.rpc).not.toHaveBeenCalled()
  })

  it.each(['22023', '42501', '40001', '55000'])('keeps the RPC message and the failed position for %s', async (code) => {
    const c = cliente({ error: { code, message: 'Cambio 2 de 5: No puedes mover personas a Grupo Rosas: es de otro segmento', details: '{"indice": 1}' } })

    expect(await guardarCambios(c, { temporadaId: T, cambios: CAMBIOS })).toEqual({
      ok: false,
      codigo: code,
      mensaje: 'Cambio 2 de 5: No puedes mover personas a Grupo Rosas: es de otro segmento.',
      indice: 1,
    })
  })

  it('ignores a DETAIL that is not a position of the list', async () => {
    const fuera = cliente({ error: { code: '22023', message: 'Cambio 9 de 5: x', details: '{"indice": 9}' } })
    const raro = cliente({ error: { code: '22023', message: 'La temporada no está en planificación', details: 'texto' } })

    expect(await guardarCambios(fuera, { temporadaId: T, cambios: CAMBIOS })).toMatchObject({ indice: null })
    expect(await guardarCambios(raro, { temporadaId: T, cambios: CAMBIOS })).toEqual({
      ok: false,
      codigo: '22023',
      mensaje: 'La temporada no está en planificación.',
      indice: null,
    })
  })

  it.each(['PGRST202', '42883'])('says the database is missing the update when the RPC does not exist (%s)', async (code) => {
    const espia = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    const c = cliente({ error: { code, message: 'Could not find the function public.planner_guardar_cambios' } })

    expect(await guardarCambios(c, { temporadaId: T, cambios: CAMBIOS })).toEqual({ ok: false, codigo: code, mensaje: FALTA_GUARDAR_CAMBIOS, indice: null })
    expect(FALTA_GUARDAR_CAMBIOS).toBe('Falta aplicar la actualización del planificador en la base de datos')
    espia.mockRestore()
  })

  it('gives a generic message for an unexpected error, keeping the position', async () => {
    const espia = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    const c = cliente({ error: { code: 'XX000', message: 'internal: relation foo', details: '{"indice": 3}' } })

    expect(await guardarCambios(c, { temporadaId: T, cambios: CAMBIOS })).toEqual({
      ok: false,
      codigo: 'XX000',
      mensaje: 'No se pudieron guardar los cambios. Inténtalo de nuevo.',
      indice: 3,
    })
    espia.mockRestore()
  })
})

describe('deshacerPaso and marcarSegmento', () => {
  it('undoes a step and keeps the refusal reason (40001, 55000)', async () => {
    const ok = cliente()
    expect((await deshacerPaso(ok, { pasoId: P })).ok).toBe(true)
    expect(ok.rpc).toHaveBeenCalledWith('planner_deshacer_paso', { p_paso_id: P })

    const no = cliente({ error: { code: '55000', message: 'Este paso ya se deshizo' } })
    expect(await deshacerPaso(no, { pasoId: P })).toEqual({ ok: false, codigo: '55000', mensaje: 'Este paso ya se deshizo.' })
    expect(await deshacerPaso(no, { pasoId: 'p' })).toEqual({ ok: false, codigo: 'validacion', mensaje: 'El paso no es válido.' })
  })

  it('marks and unmarks a segment and reads who marked it', async () => {
    const c = cliente({ data: { terminado: true, marcado_por_nombre: 'Héctor Linárez', marcado_en: '2026-11-05T10:00:00Z' } })
    const r = await marcarSegmento(c, { temporadaId: T, segmentoId: S, terminado: true })

    expect(c.rpc).toHaveBeenCalledWith('planner_marcar_segmento', { p_temporada_id: T, p_segmento_id: S, p_terminado: true })
    expect(r).toEqual({ ok: true, datos: { terminado: true, marcadoPorNombre: 'Héctor Linárez' } })
    expect(await marcarSegmento(c, { temporadaId: T, segmentoId: 's', terminado: false })).toEqual({ ok: false, codigo: 'validacion', mensaje: 'El segmento no es válido.' })
  })
})

describe('ultimosPasos', () => {
  it('reads the latest steps of the season with planner_historial', async () => {
    const fila = { paso_id: P, numero: 3, accion: 'mover_personas', descripcion: 'movió a Ana', creado_en: '2026-11-05T10:00:00Z', puede_deshacer: true }
    const c = cliente({ data: [fila] })
    const r = await ultimosPasos(c, { temporadaId: T })

    expect(c.rpc).toHaveBeenCalledWith('planner_historial', { p_temporada_id: T, p_limite: 50 })
    expect(r.ok && r.datos.map((p) => p.paso_id)).toEqual([P])
  })
})

// ─── Server actions ───

const revalidatePath = jest.fn()
jest.mock('next/cache', () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }))
const sesion = { rpc: jest.fn(), from: jest.fn() }
const createSupabaseServerClient = jest.fn(async () => sesion)
jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => createSupabaseServerClient() }))
jest.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: () => { throw new Error('service role is never used') } }))

describe('server actions', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('use the session client and revalidate the planner route after a save', async () => {
    const { guardarCambiosAction } = await import('@/app/(auth)/grupos-vida/planificar/actions')
    sesion.rpc.mockResolvedValue({ data: { guardados: 1, pasos: [P], grupos_creados: {} }, error: null })

    const r = await guardarCambiosAction({ temporadaId: T, cambios: [{ tipo: 'mover', usuarios: [U1], grupo: G, rol: 'aprendiz' }] })

    expect(createSupabaseServerClient).toHaveBeenCalled()
    expect(sesion.rpc).toHaveBeenCalledWith('planner_guardar_cambios', {
      p_temporada_id: T,
      p_cambios: [{ tipo: 'mover', usuarios: [U1], grupo: G, rol: 'aprendiz' }],
    })
    expect(r.ok).toBe(true)
    expect(revalidatePath).toHaveBeenCalledWith(RUTA_PLANNER)
  })

  it('do not revalidate when a save is refused', async () => {
    const { guardarCambiosAction } = await import('@/app/(auth)/grupos-vida/planificar/actions')
    sesion.rpc.mockResolvedValue({ data: null, error: { code: '22023', message: 'Cambio 1 de 1: El grupo no es de esta temporada', details: '{"indice": 0}' } })

    const r = await guardarCambiosAction({ temporadaId: T, cambios: [{ tipo: 'eliminar', grupo: G }] })

    expect(r).toEqual({ ok: false, codigo: '22023', mensaje: 'Cambio 1 de 1: El grupo no es de esta temporada.', indice: 0 })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('do not revalidate when the step is refused', async () => {
    const { deshacerPasoAction } = await import('@/app/(auth)/grupos-vida/planificar/actions')
    sesion.rpc.mockResolvedValue({ data: null, error: { code: '40001', message: 'No se puede deshacer: después Ana movió a Luis' } })

    const r = await deshacerPasoAction({ pasoId: P })

    expect(r).toEqual({ ok: false, codigo: '40001', mensaje: 'No se puede deshacer: después Ana movió a Luis.' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('cover undo and "Terminé mi segmento"', async () => {
    const acciones = await import('@/app/(auth)/grupos-vida/planificar/actions')
    sesion.rpc.mockResolvedValue({ data: { ...PASO, terminado: false }, error: null })

    await acciones.deshacerPasoAction({ pasoId: P })
    await acciones.marcarSegmentoAction({ temporadaId: T, segmentoId: S, terminado: false })

    expect(sesion.rpc.mock.calls.map(([nombre]) => nombre)).toEqual(['planner_deshacer_paso', 'planner_marcar_segmento'])
    expect(revalidatePath).toHaveBeenCalledTimes(2)
    expect(Object.keys(acciones).sort()).toEqual([
      'cargarCierreAction',
      'cargarHistorialAction',
      'cargarOrigenAction',
      'crearTemporadaAction',
      'deshacerPasoAction',
      'guardarCambiosAction',
      'marcarSegmentoAction',
      'publicarTemporadaAction',
    ])
  })

  it('read the origin season groups for Lado a lado without revalidating (T7)', async () => {
    const { cargarOrigenAction } = await import('@/app/(auth)/grupos-vida/planificar/actions')
    sesion.rpc.mockResolvedValue({
      data: {
        usuario_id: U1,
        ve_todos_los_segmentos: true,
        puede_publicar: true,
        puede_crear_temporada: true,
        segmentos_editables: [],
        segmentos: [],
        temporadas: [{ id: T, nombre: '2026-II', estado: 'planificacion', activa: false, origen_id: null }],
      },
      error: null,
    })

    expect(await cargarOrigenAction({ temporadaId: '' })).toEqual({ ok: false, mensaje: 'La temporada no existe.' })
    expect(sesion.rpc).not.toHaveBeenCalled()

    expect(await cargarOrigenAction({ temporadaId: T })).toEqual({ ok: true, origen: null, grupos: [] })
    expect(sesion.rpc.mock.calls.map(([nombre]) => nombre)).toEqual(['planner_temporadas'])
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
