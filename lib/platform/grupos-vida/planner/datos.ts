/**
 * Planner — server loader of /grupos-vida/planificar (T5a of
 * odd/tasks/planner-gdv.md).
 *
 * Reads with the caller's session client only (never the service role): the
 * planner RPCs apply the role and segment scope in the database (S10, S11).
 * planner_temporadas() comes first (who the actor is, which seasons exist);
 * then, for the chosen season, planner_tablero, planner_banco,
 * planner_bloqueos and planner_estado_publicacion in parallel, plus the active
 * campus_localidades for the localidad suggestions (S3, S5). Rows are parsed
 * with the T4 readers (tipos.ts).
 *
 * planner_tablero and planner_banco are read in pages of FILAS_POR_PAGINA:
 * PostgREST's max_rows cuts one answer of a set-returning RPC at 1000 rows,
 * and the church has more people than that (L35).
 *
 * The board needs the groups, the bank and the blockers; any of them failing
 * is an error. The publish state and the localidades are extras: when they
 * fail the board still opens and `faltantes` says what is missing.
 * Server-side only.
 */
import {
  leerBanco,
  leerBloqueos,
  leerEstadoPublicacion,
  leerLocalidades,
  leerTablero,
  leerTemporadas,
  type Bloqueo,
  type EstadoPublicacion,
  type GrupoTablero,
  type Localidad,
  type PersonaBanco,
  type TemporadaPlanner,
  type TemporadasPlanner,
} from './tipos'

export interface ErrorPlanner {
  readonly code?: string
  readonly message?: string
}

interface Respuesta {
  readonly data: unknown
  readonly error: ErrorPlanner | null
}

interface ConsultaLocalidades {
  select(columnas: string): ConsultaLocalidades
  eq(columna: string, valor: boolean): ConsultaLocalidades
  order(columna: string): PromiseLike<Respuesta>
}

/** One RPC call: awaited whole, or one page of its rows with `range` (both ends included). */
export interface ConsultaRpc extends PromiseLike<Respuesta> {
  range(desde: number, hasta: number): PromiseLike<Respuesta>
}

/** What the loader needs from the Supabase session client (the planner RPCs are not in database.types.ts yet). */
export interface ClientePlanner {
  rpc(nombre: string, args?: Record<string, unknown>): ConsultaRpc
  from(tabla: 'campus_localidades'): ConsultaLocalidades
}

/** The session client seen through ClientePlanner, keeping `this` bound. */
export function comoClientePlanner(supabase: { rpc: unknown; from: unknown }): ClientePlanner {
  const rpc = supabase.rpc as (nombre: string, args?: Record<string, unknown>) => ConsultaRpc
  const from = supabase.from as (tabla: string) => ConsultaLocalidades
  return { rpc: rpc.bind(supabase), from: from.bind(supabase) }
}

export type ParteOpcional = 'estado_publicacion' | 'localidades'

export interface DatosPlanner {
  readonly capacidades: TemporadasPlanner
  readonly temporada: TemporadaPlanner
  readonly grupos: readonly GrupoTablero[]
  readonly banco: readonly PersonaBanco[]
  readonly bloqueos: readonly Bloqueo[]
  readonly estado: EstadoPublicacion | null
  readonly localidades: readonly Localidad[]
  /** Extras that could not be read; the board opens without them. */
  readonly faltantes: readonly ParteOpcional[]
}

export type ResultadoPlanner =
  | { readonly tipo: 'sin_acceso' }
  | { readonly tipo: 'error'; readonly mensaje: string }
  | { readonly tipo: 'sin_temporada'; readonly capacidades: TemporadasPlanner }
  | { readonly tipo: 'listo'; readonly datos: DatosPlanner }

const SIN_DATOS = 'No se pudo cargar el planificador. Recarga la página.'

const conPunto = (texto: string): string => (/[.!?]$/.test(texto) ? texto : `${texto}.`)

/** Spanish message for a planner RPC error: 42501 no access, 28000 no session, 22023 the RPC's own message. */
export function mensajeErrorPlanner(error: ErrorPlanner | null | undefined): string {
  if (error?.code === '42501') return 'No tienes permiso para usar el planificador.'
  if (error?.code === '28000') return 'Tu sesión terminó. Vuelve a entrar.'
  const mensaje = error?.message?.trim()
  if (error?.code === '22023' && mensaje) return conPunto(mensaje)
  return SIN_DATOS
}

const fallo = (error: ErrorPlanner): ResultadoPlanner =>
  error.code === '42501' ? { tipo: 'sin_acceso' } : { tipo: 'error', mensaje: mensajeErrorPlanner(error) }

/**
 * The season to open: the requested one when it exists (any state), else the
 * most recent in 'planificacion' (planner_temporadas orders by fecha_inicio
 * descending), else none.
 */
export function elegirTemporada(temporadas: readonly TemporadaPlanner[], pedida: string | null | undefined): TemporadaPlanner | null {
  return temporadas.find((t) => t.id === pedida) ?? temporadas.find((t) => t.estado === 'planificacion') ?? null
}

/** PostgREST's max_rows on Supabase: the most rows one answer carries. */
export const FILAS_POR_PAGINA = 1000
/** Safety stop: 20.000 rows. */
export const MAXIMO_PAGINAS = 20

/**
 * A set-returning planner RPC read page by page until a short page. The RPCs
 * order their rows (planner_banco by apellido, nombre, id), so the pages do
 * not overlap. The first error is the answer; past MAXIMO_PAGINAS it stops
 * with what it read and logs it.
 */
export async function rpcPorPaginas(supabase: ClientePlanner, nombre: string, args: Record<string, unknown>): Promise<Respuesta> {
  const filas: unknown[] = []
  for (let pagina = 0; pagina < MAXIMO_PAGINAS; pagina += 1) {
    const desde = pagina * FILAS_POR_PAGINA
    const respuesta = await supabase.rpc(nombre, args).range(desde, desde + FILAS_POR_PAGINA - 1)
    if (respuesta.error) return respuesta
    // Not rows (a malformed answer): the reader decides, as without pages.
    if (!Array.isArray(respuesta.data)) return pagina === 0 ? respuesta : { data: filas, error: null }
    filas.push(...respuesta.data)
    if (respuesta.data.length < FILAS_POR_PAGINA) return { data: filas, error: null }
  }
  console.error(`[grupos-vida/planificar] ${nombre}: más de ${MAXIMO_PAGINAS} páginas, se cortó`, { filas: filas.length })
  return { data: filas, error: null }
}

export async function cargarPlanner(supabase: ClientePlanner, temporadaPedida?: string | null): Promise<ResultadoPlanner> {
  const temporadasRes = await supabase.rpc('planner_temporadas')
  if (temporadasRes.error) return fallo(temporadasRes.error)
  const capacidades = leerTemporadas(temporadasRes.data)
  if (!capacidades) return { tipo: 'error', mensaje: SIN_DATOS }

  const temporada = elegirTemporada(capacidades.temporadas, temporadaPedida)
  if (!temporada) return { tipo: 'sin_temporada', capacidades }

  const args = { p_temporada_id: temporada.id }
  const [tableroRes, bancoRes, bloqueosRes, estadoRes, localidadesRes] = await Promise.all([
    rpcPorPaginas(supabase, 'planner_tablero', args),
    rpcPorPaginas(supabase, 'planner_banco', args),
    supabase.rpc('planner_bloqueos', args),
    supabase.rpc('planner_estado_publicacion', args),
    supabase.from('campus_localidades').select('id, nombre, municipio_id').eq('activo', true).order('nombre'),
  ])
  const obligatorio = [tableroRes, bancoRes, bloqueosRes].find((r) => r.error)
  if (obligatorio?.error) return fallo(obligatorio.error)

  const estado = estadoRes.error ? null : leerEstadoPublicacion(estadoRes.data)
  if (estadoRes.error) console.error('[grupos-vida/planificar] planner_estado_publicacion failed', estadoRes.error)
  if (localidadesRes.error) console.error('[grupos-vida/planificar] campus_localidades failed', localidadesRes.error)
  const faltantes: ParteOpcional[] = []
  if (!estado) faltantes.push('estado_publicacion')
  if (localidadesRes.error) faltantes.push('localidades')

  return {
    tipo: 'listo',
    datos: {
      capacidades,
      temporada,
      grupos: leerTablero(tableroRes.data).filas,
      banco: leerBanco(bancoRes.data).filas,
      bloqueos: leerBloqueos(bloqueosRes.data).filas,
      estado,
      localidades: localidadesRes.error ? [] : leerLocalidades(localidadesRes.data).filas,
      faltantes,
    },
  }
}
