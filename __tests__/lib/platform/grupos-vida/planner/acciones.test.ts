/**
 * Planner step wrappers (T5b of odd/tasks/planner-gdv.md): input validation
 * before any RPC, the exact RPC names and arguments, the Spanish error
 * messages (the RPC's own message for 22023/42501/40001/55000) and the server
 * actions, which use the session client and revalidate the planner route only
 * after a saved step.
 */
import {
  RUTA_PLANNER,
  crearGrupo,
  deshacerPaso,
  editarGrupo,
  eliminarGrupo,
  marcarSegmento,
  mensajeErrorAccion,
  moverPersonas,
  ultimosPasos,
  type ClienteAcciones,
} from '@/lib/platform/grupos-vida/planner/acciones'

const T = '11111111-1111-4111-8111-111111111111'
const G = '22222222-2222-4222-8222-222222222222'
const U1 = '33333333-3333-4333-8333-333333333333'
const U2 = '44444444-4444-4444-8444-444444444444'
const S = '55555555-5555-4555-8555-555555555555'
const P = '66666666-6666-4666-8666-666666666666'

const PASO = { paso_id: P, descripcion: 'movió a Ana Pérez a Grupo Rosas', segmentos: [S], segmentos_reabiertos: [S] }

function cliente(respuesta: { data?: unknown; error?: { code?: string; message?: string } | null } = { data: PASO }) {
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

describe('moverPersonas', () => {
  it('calls planner_mover_personas with the people, the group and the role, and reads the step', async () => {
    const c = cliente()
    const r = await moverPersonas(c, { temporadaId: T, usuarioIds: [U1, U2], grupoId: G, rol: 'miembro' })

    expect(c.rpc).toHaveBeenCalledWith('planner_mover_personas', { p_temporada_id: T, p_usuarios: [U1, U2], p_grupo_destino: G, p_rol: 'miembro' })
    expect(r).toEqual({ ok: true, datos: { pasoId: P, descripcion: 'movió a Ana Pérez a Grupo Rosas', segmentosReabiertos: [S] } })
  })

  it('sends a move to the bank with no group and no role', async () => {
    const c = cliente()
    await moverPersonas(c, { temporadaId: T, usuarioIds: [U1], grupoId: null, rol: null })

    expect(c.rpc).toHaveBeenCalledWith('planner_mover_personas', { p_temporada_id: T, p_usuarios: [U1], p_grupo_destino: null, p_rol: null })
  })

  it.each([
    [{ temporadaId: 'x', usuarioIds: [U1], grupoId: G, rol: 'miembro' }, 'La temporada no es válida.'],
    [{ temporadaId: T, usuarioIds: [], grupoId: G, rol: 'miembro' }, 'Indica al menos una persona.'],
    [{ temporadaId: T, usuarioIds: ['nope'], grupoId: G, rol: 'miembro' }, 'Alguna de las personas no es válida.'],
    [{ temporadaId: T, usuarioIds: Array(21).fill(U1), grupoId: G, rol: 'miembro' }, 'Puedes mover hasta 20 personas por paso.'],
    [{ temporadaId: T, usuarioIds: [U1], grupoId: 'g', rol: 'miembro' }, 'El grupo no es válido.'],
    [{ temporadaId: T, usuarioIds: [U1], grupoId: G, rol: 'colider' }, 'El rol debe ser Líder, Aprendiz o Miembro.'],
    [{ temporadaId: T, usuarioIds: [U1], grupoId: G, rol: null }, 'El rol debe ser Líder, Aprendiz o Miembro.'],
  ])('rejects %j before calling the RPC', async (entrada, mensaje) => {
    const c = cliente()
    const r = await moverPersonas(c, entrada as Parameters<typeof moverPersonas>[1])

    expect(r).toEqual({ ok: false, codigo: 'validacion', mensaje })
    expect(c.rpc).not.toHaveBeenCalled()
  })

  it('returns the RPC refusal in Spanish (42501 out of scope)', async () => {
    const c = cliente({ error: { code: '42501', message: 'No puedes mover personas a Grupo Rosas: es de otro segmento (Mujeres +36)' } })
    const r = await moverPersonas(c, { temporadaId: T, usuarioIds: [U1], grupoId: G, rol: 'lider' })

    expect(r).toEqual({ ok: false, codigo: '42501', mensaje: 'No puedes mover personas a Grupo Rosas: es de otro segmento (Mujeres +36).' })
  })
})

describe('crearGrupo and editarGrupo', () => {
  const DATOS = {
    nombre: '  Cabudare Matrimonios 10 ',
    segmento_id: S,
    localidad_id: G,
    dia_reunion: 'Jueves',
    hora_reunion: '19:30',
    capacidad_maxima: 12,
    director_etapa_ids: [U1],
  }

  it('creates the group with the trimmed name and returns its id', async () => {
    const c = cliente({ data: { ...PASO, grupo_id: G } })
    const r = await crearGrupo(c, { temporadaId: T, datos: DATOS })

    expect(c.rpc).toHaveBeenCalledWith('planner_crear_grupo', { p_temporada_id: T, p_datos: { ...DATOS, nombre: 'Cabudare Matrimonios 10' } })
    expect(r).toEqual({ ok: true, datos: { pasoId: P, descripcion: PASO.descripcion, segmentosReabiertos: [S], grupoId: G } })
  })

  it.each([
    [{ ...DATOS, nombre: '  ' }, 'El grupo debe tener nombre.'],
    [{ ...DATOS, nombre: 'x'.repeat(121) }, 'El nombre del grupo puede tener hasta 120 caracteres.'],
    [{ ...DATOS, segmento_id: 'seg' }, 'El segmento no es válido.'],
    [{ ...DATOS, localidad_id: 'loc' }, 'La localidad no es válida.'],
    [{ ...DATOS, dia_reunion: 'Feriado' }, 'El día de reunión no es válido.'],
    [{ ...DATOS, hora_reunion: '7pm' }, 'La hora de reunión no es válida.'],
    [{ ...DATOS, capacidad_maxima: 0 }, 'La capacidad debe ser un número entero mayor que 0.'],
    [{ ...DATOS, director_etapa_ids: [U1, U2, S, G, P] }, 'Un grupo puede tener hasta 4 directores de etapa.'],
    [{ ...DATOS, director_etapa_ids: ['d'] }, 'Alguno de los directores de etapa no es válido.'],
  ])('rejects invalid data %#', async (datos, mensaje) => {
    const c = cliente()
    expect(await crearGrupo(c, { temporadaId: T, datos })).toEqual({ ok: false, codigo: 'validacion', mensaje })
    expect(c.rpc).not.toHaveBeenCalled()
  })

  it('edits only the given fields (localidad from "Usar <localidad>")', async () => {
    const c = cliente()
    const r = await editarGrupo(c, { grupoId: G, cambios: { localidad_id: S } })

    expect(c.rpc).toHaveBeenCalledWith('planner_editar_grupo', { p_grupo_id: G, p_cambios: { localidad_id: S } })
    expect(r.ok).toBe(true)
  })

  it('refuses an edit without changes or with a bad group id', async () => {
    const c = cliente()
    expect(await editarGrupo(c, { grupoId: G, cambios: {} })).toEqual({ ok: false, codigo: 'validacion', mensaje: 'No hay cambios para guardar.' })
    expect(await editarGrupo(c, { grupoId: 'g', cambios: { nombre: 'A' } })).toEqual({ ok: false, codigo: 'validacion', mensaje: 'El grupo no es válido.' })
    expect(c.rpc).not.toHaveBeenCalled()
  })
})

describe('eliminarGrupo, deshacerPaso and marcarSegmento', () => {
  it('deletes a group and returns the refusal of a group that already started', async () => {
    const ok = cliente()
    expect((await eliminarGrupo(ok, { grupoId: G })).ok).toBe(true)
    expect(ok.rpc).toHaveBeenCalledWith('planner_eliminar_grupo', { p_grupo_id: G })

    const no = cliente({ error: { code: '22023', message: 'No puedes eliminar Grupo Rosas: ya se reúne.' } })
    expect(await eliminarGrupo(no, { grupoId: G })).toEqual({ ok: false, codigo: '22023', mensaje: 'No puedes eliminar Grupo Rosas: ya se reúne.' })
  })

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

  it('use the session client and revalidate the planner route after a saved step', async () => {
    const { moverPersonasAction } = await import('@/app/(auth)/grupos-vida/planificar/actions')
    sesion.rpc.mockResolvedValue({ data: PASO, error: null })

    const r = await moverPersonasAction({ temporadaId: T, usuarioIds: [U1], grupoId: G, rol: 'aprendiz' })

    expect(createSupabaseServerClient).toHaveBeenCalled()
    expect(sesion.rpc).toHaveBeenCalledWith('planner_mover_personas', { p_temporada_id: T, p_usuarios: [U1], p_grupo_destino: G, p_rol: 'aprendiz' })
    expect(r.ok).toBe(true)
    expect(revalidatePath).toHaveBeenCalledWith(RUTA_PLANNER)
  })

  it('do not revalidate when the step is refused', async () => {
    const { deshacerPasoAction } = await import('@/app/(auth)/grupos-vida/planificar/actions')
    sesion.rpc.mockResolvedValue({ data: null, error: { code: '40001', message: 'No se puede deshacer: después Ana movió a Luis' } })

    const r = await deshacerPasoAction({ pasoId: P })

    expect(r).toEqual({ ok: false, codigo: '40001', mensaje: 'No se puede deshacer: después Ana movió a Luis.' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('cover every step RPC', async () => {
    const acciones = await import('@/app/(auth)/grupos-vida/planificar/actions')
    sesion.rpc.mockResolvedValue({ data: { ...PASO, grupo_id: G, terminado: false }, error: null })

    await acciones.crearGrupoAction({ temporadaId: T, datos: { nombre: 'A', segmento_id: S, localidad_id: null, dia_reunion: null, hora_reunion: null, capacidad_maxima: null, director_etapa_ids: [] } })
    await acciones.editarGrupoAction({ grupoId: G, cambios: { localidad_id: S } })
    await acciones.eliminarGrupoAction({ grupoId: G })
    await acciones.marcarSegmentoAction({ temporadaId: T, segmentoId: S, terminado: false })

    expect(sesion.rpc.mock.calls.map(([nombre]) => nombre)).toEqual(['planner_crear_grupo', 'planner_editar_grupo', 'planner_eliminar_grupo', 'planner_marcar_segmento'])
    expect(revalidatePath).toHaveBeenCalledTimes(4)
  })
})
