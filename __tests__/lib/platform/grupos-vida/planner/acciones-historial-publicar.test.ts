/**
 * Planner server wrappers of T8a (odd/tasks/planner-gdv.md; S13, S15, S8,
 * S12, S19): the history in pages (planner_historial with p_antes, "Ver
 * más"), publishing (planner_publicar) with its Spanish errors, and their
 * server actions, which use the session client; publishing revalidates the
 * planner and the Grupos de Vida pages, reading the history does not.
 */
import {
  PASOS_POR_PAGINA,
  RUTA_PLANNER,
  historialPaginado,
  publicarTemporada,
  type ClienteAcciones,
} from '@/lib/platform/grupos-vida/planner/acciones'

const T = '11111111-1111-4111-8111-111111111111'
const P1 = '66666666-6666-4666-8666-666666666661'
const P2 = '66666666-6666-4666-8666-666666666662'
const P3 = '66666666-6666-4666-8666-666666666663'

const fila = (paso_id: string, creado_en: string) => ({
  paso_id,
  numero: 1,
  accion: 'mover_personas',
  descripcion: 'movió a Ana Pérez a Grupo Rosas',
  creado_en,
  actor_id: 'u1',
  actor_nombre: 'Héctor Linárez',
  segmentos: [{ id: 's1', nombre: 'Matrimonios' }],
  grupo_ids: [],
  usuario_ids: [],
  deshace_paso_id: null,
  deshecho_por: null,
  deshecho_por_nombre: null,
  puede_deshacer: true,
  motivo_no_deshacer: null,
})

function cliente(respuesta: { data?: unknown; error?: { code?: string; message?: string } | null }) {
  const rpc = jest.fn().mockResolvedValue({ data: respuesta.data ?? null, error: respuesta.error ?? null })
  return { rpc } satisfies ClienteAcciones
}

describe('historialPaginado (S13, S15)', () => {
  it('asks one row more than the page to know whether there are more, and keeps the page', async () => {
    const c = cliente({ data: [fila(P1, '2026-11-07T10:00:03.123456+00:00'), fila(P2, '2026-11-07T10:00:02+00:00'), fila(P3, '2026-11-07T10:00:01+00:00')] })

    const r = await historialPaginado(c, { temporadaId: T, limite: 2 })

    expect(c.rpc).toHaveBeenCalledWith('planner_historial', { p_temporada_id: T, p_limite: 3, p_antes: null })
    expect(r).toEqual({ ok: true, datos: { pasos: [expect.objectContaining({ paso_id: P1 }), expect.objectContaining({ paso_id: P2 })], hayMas: true } })
  })

  it('passes the date of the last step shown as p_antes, and says when there are no more', async () => {
    const c = cliente({ data: [fila(P3, '2026-11-07T10:00:01+00:00')] })

    const r = await historialPaginado(c, { temporadaId: T, antes: '2026-11-07T10:00:02.5+00:00' })

    expect(c.rpc).toHaveBeenCalledWith('planner_historial', { p_temporada_id: T, p_limite: PASOS_POR_PAGINA + 1, p_antes: '2026-11-07T10:00:02.5+00:00' })
    expect(r.ok && r.datos.hayMas).toBe(false)
    expect(r.ok && r.datos.pasos).toHaveLength(1)
  })

  it('refuses a bad season or date before the RPC', async () => {
    const c = cliente({ data: [] })

    expect(await historialPaginado(c, { temporadaId: 'x' })).toEqual({ ok: false, codigo: 'validacion', mensaje: 'La temporada no es válida.' })
    expect(await historialPaginado(c, { temporadaId: T, antes: 'ayer' })).toEqual({ ok: false, codigo: 'validacion', mensaje: 'La fecha del historial no es válida.' })
    expect(c.rpc).not.toHaveBeenCalled()
  })

  it('says it could not read the history on an unexpected error', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {})
    const r = await historialPaginado(cliente({ error: { code: 'XX000', message: 'boom' } }), { temporadaId: T })

    expect(r).toEqual({ ok: false, codigo: 'XX000', mensaje: 'No se pudo leer el historial. Inténtalo de nuevo.' })
    error.mockRestore()
  })
})

describe('publicarTemporada (S8, S12, S19)', () => {
  const PUBLICADA = {
    temporada_id: T,
    nombre: '2026-II',
    grupos: 27,
    publicados: 9,
    ya_aprobados: 18,
    grupos_activados: 9,
    origen_id: 'o1',
    origen_nombre: '2025 - II',
    grupos_archivados: 19,
  }

  it('calls planner_publicar and reads what it activated and archived', async () => {
    const c = cliente({ data: PUBLICADA })

    const r = await publicarTemporada(c, { temporadaId: T })

    expect(c.rpc).toHaveBeenCalledWith('planner_publicar', { p_temporada_id: T })
    expect(r).toEqual({
      ok: true,
      datos: { temporadaId: T, nombre: '2026-II', grupos: 27, gruposActivados: 9, origenNombre: '2025 - II', gruposArchivados: 19 },
    })
  })

  it('reads a season without origin', async () => {
    const r = await publicarTemporada(cliente({ data: { ...PUBLICADA, origen_id: null, origen_nombre: null, grupos_archivados: 0 } }), { temporadaId: T })

    expect(r.ok && r.datos.origenNombre).toBeNull()
  })

  it('keeps the RPC message for the rule refusals, with a final period', async () => {
    const bloqueos = await publicarTemporada(
      cliente({ error: { code: '22023', message: 'No se puede publicar: hay 2 bloqueos por resolver (sin localidad: 2)' } }),
      { temporadaId: T },
    )
    const rol = await publicarTemporada(
      cliente({ error: { code: '42501', message: 'Solo el director general, un pastor o un administrador pueden publicar la temporada' } }),
      { temporadaId: T },
    )

    expect(bloqueos).toEqual({ ok: false, codigo: '22023', mensaje: 'No se puede publicar: hay 2 bloqueos por resolver (sin localidad: 2).' })
    expect(rol).toEqual({ ok: false, codigo: '42501', mensaje: 'Solo el director general, un pastor o un administrador pueden publicar la temporada.' })
  })

  it('gives a publishing message on an unexpected error and refuses a bad season before the RPC', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {})
    const c = cliente({ error: { code: 'XX000', message: 'internal' } })

    expect(await publicarTemporada(c, { temporadaId: T })).toEqual({ ok: false, codigo: 'XX000', mensaje: 'No se pudo publicar la temporada. Inténtalo de nuevo.' })
    expect(await publicarTemporada(c, { temporadaId: '' })).toEqual({ ok: false, codigo: 'validacion', mensaje: 'La temporada no es válida.' })
    expect(c.rpc).toHaveBeenCalledTimes(1)
    error.mockRestore()
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

  it('read a history page with the session client, without revalidating', async () => {
    const { cargarHistorialAction } = await import('@/app/(auth)/grupos-vida/planificar/actions')
    sesion.rpc.mockResolvedValue({ data: [fila(P1, '2026-11-07T10:00:00+00:00')], error: null })

    const r = await cargarHistorialAction({ temporadaId: T, antes: '2026-11-07T11:00:00+00:00' })

    expect(createSupabaseServerClient).toHaveBeenCalled()
    expect(sesion.rpc).toHaveBeenCalledWith('planner_historial', { p_temporada_id: T, p_limite: PASOS_POR_PAGINA + 1, p_antes: '2026-11-07T11:00:00+00:00' })
    expect(r.ok && r.datos.hayMas).toBe(false)
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('publish with the session client and revalidate the planner and Grupos de Vida', async () => {
    const { publicarTemporadaAction } = await import('@/app/(auth)/grupos-vida/planificar/actions')
    sesion.rpc.mockResolvedValue({ data: { temporada_id: T, nombre: '2026-II', grupos: 3, grupos_activados: 3, origen_nombre: null, grupos_archivados: 0 }, error: null })

    const r = await publicarTemporadaAction({ temporadaId: T })

    expect(sesion.rpc).toHaveBeenCalledWith('planner_publicar', { p_temporada_id: T })
    expect(r.ok).toBe(true)
    expect(revalidatePath).toHaveBeenCalledWith(RUTA_PLANNER, 'layout')
    expect(revalidatePath).toHaveBeenCalledWith('/grupos-vida', 'layout')
  })

  it('do not revalidate when publishing is refused', async () => {
    const { publicarTemporadaAction } = await import('@/app/(auth)/grupos-vida/planificar/actions')
    sesion.rpc.mockResolvedValue({ data: null, error: { code: '22023', message: 'No se puede publicar: falta 1 segmento por terminar (Matrimonios)' } })

    const r = await publicarTemporadaAction({ temporadaId: T })

    expect(r).toEqual({ ok: false, codigo: '22023', mensaje: 'No se puede publicar: falta 1 segmento por terminar (Matrimonios).' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
