/**
 * Planner — the server wrappers of /grupos-vida/planificar (T5b and S24 of
 * odd/tasks/planner-gdv.md; S3, S4, S10, S13–S15, S22, S24).
 *
 * The board keeps every change in the browser (borrador.ts) until "Guardar":
 * guardarCambios sends the whole list to planner_guardar_cambios
 * (supabase/migrations/20261107130000_planner_guardar_cambios.sql), which
 * applies it in order in ONE transaction through the step RPCs of
 * 20261107110000_planner_pasos.sql, one step per change. Undo
 * (planner_deshacer_paso), the history (planner_historial) and "Terminé mi
 * segmento" (planner_marcar_segmento of 20261107120000_planner_temporada.sql)
 * still run on their own, as do the history pages ("Ver pasos anteriores",
 * p_antes) and publishing (planner_publicar, T8a). Each wrapper checks the input shape first (uuids,
 * roles, group fields, "tmp:" keys) so a bad call never reaches the
 * database, then calls the RPC with the caller's session client: the
 * database checks the role, the segment scope and the rules again. Errors
 * come back as Spanish messages; for 22023, 42501, 40001 and 55000 the RPC's
 * own message is kept, because it already names the change, the group, the
 * person or the reason.
 *
 * The server actions (app/(auth)/grupos-vida/planificar/actions.ts) pass the
 * session client and revalidate RUTA_PLANNER after a saved call.
 */
import { esObjeto, id, ids, textoOVacio } from './campos'
import { leerHistorial, type PasoHistorial } from './tipos'
import type { ErrorPlanner } from './datos'

export const RUTA_PLANNER = '/grupos-vida/planificar'

/** What the wrappers need from the Supabase session client. */
export interface ClienteAcciones {
  rpc(nombre: string, args?: Record<string, unknown>): PromiseLike<{ readonly data: unknown; readonly error: ErrorAccion | null }>
}

/** A PostgREST error; `details` carries planner_guardar_cambios' DETAIL {"indice": i}. */
export interface ErrorAccion extends ErrorPlanner {
  readonly details?: string | null
}

export const ROLES_PLANNER = ['lider', 'aprendiz', 'miembro'] as const
export type RolPlanner = (typeof ROLES_PLANNER)[number]

/** enum_dia_semana. */
export const DIAS_REUNION = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'] as const

export const MAXIMO_PERSONAS_POR_PASO = 20
export const MAXIMO_DIRECTORES = 4
export const LARGO_NOMBRE_GRUPO = 120

export type ResultadoAccion<T> =
  | { readonly ok: true; readonly datos: T }
  | { readonly ok: false; readonly mensaje: string; readonly codigo: string | null }

export interface PasoGuardado {
  readonly pasoId: string | null
  /** "movió a Ana Pérez de Grupo Rosas a Grupo Renacer". */
  readonly descripcion: string
  /** Segments whose "Terminé mi segmento" this step removed (S17). */
  readonly segmentosReabiertos: readonly string[]
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** 'H:MM', 'HH:MM' or 'HH:MM:SS' (the RPC also casts it to time). */
const esHora = (valor: string): boolean => /^\d{1,2}:\d{2}$/.test(valor) || /^\d{1,2}:\d{2}:\d{2}$/.test(valor)

const esUuid = (valor: unknown): valor is string => typeof valor === 'string' && UUID.test(valor)

const CODIGOS_CON_MENSAJE = new Set(['22023', '42501', '40001', '55000'])
const GENERICO = 'No se pudo guardar el cambio. Inténtalo de nuevo.'

const conPunto = (texto: string): string => (/[.!?]$/.test(texto) ? texto : `${texto}.`)

/** Spanish message for a step RPC error; the RPC's own message for the rule codes. */
export function mensajeErrorAccion(error: ErrorPlanner | null | undefined): string {
  const mensaje = error?.message?.trim()
  if (error?.code === '28000') return 'Tu sesión terminó. Vuelve a entrar.'
  if (error?.code && CODIGOS_CON_MENSAJE.has(error.code) && mensaje) return conPunto(mensaje)
  if (error?.code === '42501') return 'No tienes permiso para hacer este cambio.'
  return GENERICO
}

const invalido = (mensaje: string): ResultadoAccion<never> => ({ ok: false, codigo: 'validacion', mensaje })

async function llamar<T>(
  cliente: ClienteAcciones,
  nombre: string,
  args: Record<string, unknown>,
  leer: (data: unknown) => T,
  generico: string = GENERICO,
): Promise<ResultadoAccion<T>> {
  const { data, error } = await cliente.rpc(nombre, args)
  if (error) {
    if (!error.code || !CODIGOS_CON_MENSAJE.has(error.code)) console.error(`[grupos-vida/planificar] ${nombre} failed`, error)
    const mensaje = mensajeErrorAccion(error)
    return { ok: false, codigo: error.code ?? null, mensaje: mensaje === GENERICO ? generico : mensaje }
  }
  return { ok: true, datos: leer(data) }
}

const leerPaso = (data: unknown): PasoGuardado => {
  const fila = esObjeto(data) ? data : {}
  return { pasoId: id(fila.paso_id), descripcion: textoOVacio(fila.descripcion), segmentosReabiertos: ids(fila.segmentos_reabiertos) }
}

// ─── Group fields ───

/** The fields planner_paso_validar_grupo accepts; director_etapa_ids are usuarios ids. */
export interface DatosGrupo {
  readonly nombre: string
  readonly segmento_id: string
  readonly localidad_id: string | null
  readonly dia_reunion: string | null
  readonly hora_reunion: string | null
  readonly capacidad_maxima: number | null
  readonly director_etapa_ids: readonly string[]
}

/**
 * The shape of each given field the RPC would refuse, with the same words:
 * the normalized values (trimmed name) or the first error. The board runs it
 * on what the director typed before adding a change to the draft
 * (`comprobarIds: false`: the ids come from the loaded data);
 * guardarCambios runs all of it again.
 */
export function validarDatosGrupo(
  datos: Partial<DatosGrupo>,
  { comprobarIds = true }: { readonly comprobarIds?: boolean } = {},
): { readonly valores: Partial<DatosGrupo> } | { readonly error: string } {
  const esId = (valor: unknown): valor is string => (comprobarIds ? esUuid(valor) : typeof valor === 'string' && valor !== '')
  const valores: { -readonly [K in keyof DatosGrupo]?: DatosGrupo[K] } = {}
  if ('nombre' in datos) {
    const nombre = (datos.nombre ?? '').replace(/\s+/g, ' ').trim()
    if (!nombre) return { error: 'El grupo debe tener nombre.' }
    if (nombre.length > LARGO_NOMBRE_GRUPO) return { error: `El nombre del grupo puede tener hasta ${LARGO_NOMBRE_GRUPO} caracteres.` }
    valores.nombre = nombre
  }
  if ('segmento_id' in datos) {
    if (!esId(datos.segmento_id)) return { error: 'El segmento no es válido.' }
    valores.segmento_id = datos.segmento_id
  }
  if ('localidad_id' in datos) {
    if (datos.localidad_id !== null && !esId(datos.localidad_id)) return { error: 'La localidad no es válida.' }
    valores.localidad_id = datos.localidad_id ?? null
  }
  if ('dia_reunion' in datos) {
    if (datos.dia_reunion !== null && !DIAS_REUNION.includes(datos.dia_reunion as (typeof DIAS_REUNION)[number])) {
      return { error: 'El día de reunión no es válido.' }
    }
    valores.dia_reunion = datos.dia_reunion ?? null
  }
  if ('hora_reunion' in datos) {
    if (datos.hora_reunion !== null && !esHora(datos.hora_reunion ?? '')) return { error: 'La hora de reunión no es válida.' }
    valores.hora_reunion = datos.hora_reunion ?? null
  }
  if ('capacidad_maxima' in datos) {
    const capacidad = datos.capacidad_maxima
    if (capacidad !== null && (capacidad === undefined || !Number.isInteger(capacidad) || capacidad <= 0)) {
      return { error: 'La capacidad debe ser un número entero mayor que 0.' }
    }
    valores.capacidad_maxima = capacidad ?? null
  }
  if ('director_etapa_ids' in datos) {
    const directores = datos.director_etapa_ids ?? []
    if (!directores.every(esId)) return { error: 'Alguno de los directores de etapa no es válido.' }
    if (new Set(directores).size > MAXIMO_DIRECTORES) return { error: `Un grupo puede tener hasta ${MAXIMO_DIRECTORES} directores de etapa.` }
    valores.director_etapa_ids = [...directores]
  }
  return { valores }
}

// ─── Save the session's changes (S24) ───

/** "tmp:<clave>": a group created earlier in the same list (planner_guardar_cambios). */
export const CLAVE_TEMPORAL = /^tmp:[A-Za-z0-9_.:-]{1,64}$/

export const esClaveTemporal = (valor: unknown): valor is string => typeof valor === 'string' && CLAVE_TEMPORAL.test(valor)

/** The most changes one save carries (planner_guardar_cambios). */
export const MAXIMO_CAMBIOS = 200

/** One change of planner_guardar_cambios, in its exact shape. */
export type CambioPlanner =
  | {
      readonly tipo: 'mover'
      readonly usuarios: readonly string[]
      /** A group id, "tmp:<clave>" or null (back to the bank). */
      readonly grupo: string | null
      /** Required with a group; null for the bank. */
      readonly rol: RolPlanner | null
    }
  | { readonly tipo: 'crear'; readonly clave: string; readonly datos: DatosGrupo }
  | { readonly tipo: 'editar'; readonly grupo: string; readonly cambios: Partial<DatosGrupo> }
  | { readonly tipo: 'eliminar'; readonly grupo: string }

export interface CambiosGuardados {
  readonly guardados: number
  readonly pasos: readonly string[]
  /** "tmp:<clave>" → the id of the group it created. */
  readonly gruposCreados: Readonly<Record<string, string>>
}

export type ResultadoGuardar =
  | { readonly ok: true; readonly datos: CambiosGuardados }
  | {
      readonly ok: false
      readonly mensaje: string
      readonly codigo: string | null
      /** The change that failed (0-based, the server's DETAIL {"indice"}); null when it is not one change. */
      readonly indice: number | null
    }

export const FALTA_GUARDAR_CAMBIOS = 'Falta aplicar la actualización del planificador en la base de datos'
const GENERICO_GUARDAR = 'No se pudieron guardar los cambios. Inténtalo de nuevo.'

/** The shape problem of one change, with the normalized change; `claves` are the "tmp:" keys created before it. */
function validarCambio(cambio: CambioPlanner, claves: ReadonlySet<string>): { readonly cambio: CambioPlanner } | { readonly error: string } {
  const destino = (grupo: unknown, conTemporal: boolean): string | null => {
    if (esUuid(grupo)) return null
    if (conTemporal && esClaveTemporal(grupo)) return claves.has(grupo) ? null : 'El grupo nuevo no se creó antes en estos cambios.'
    return 'El grupo no es válido.'
  }
  switch (cambio.tipo) {
    case 'mover': {
      if (cambio.usuarios.length === 0) return { error: 'Indica al menos una persona.' }
      if (!cambio.usuarios.every(esUuid)) return { error: 'Alguna de las personas no es válida.' }
      if (cambio.usuarios.length > MAXIMO_PERSONAS_POR_PASO) return { error: `Puedes mover hasta ${MAXIMO_PERSONAS_POR_PASO} personas por paso.` }
      if (cambio.grupo === null) return { cambio: { tipo: 'mover', usuarios: [...cambio.usuarios], grupo: null, rol: null } }
      const problema = destino(cambio.grupo, true)
      if (problema) return { error: problema }
      if (!ROLES_PLANNER.includes(cambio.rol as RolPlanner)) return { error: 'El rol debe ser Líder, Aprendiz o Miembro.' }
      return { cambio: { tipo: 'mover', usuarios: [...cambio.usuarios], grupo: cambio.grupo, rol: cambio.rol } }
    }
    case 'crear': {
      if (!esClaveTemporal(cambio.clave)) return { error: 'La clave del grupo nuevo no es válida.' }
      if (claves.has(cambio.clave)) return { error: 'La clave del grupo nuevo ya se usó.' }
      const validados = validarDatosGrupo(cambio.datos)
      if ('error' in validados) return { error: validados.error }
      if (!validados.valores.nombre) return { error: 'El grupo debe tener nombre.' }
      if (!validados.valores.segmento_id) return { error: 'El segmento no es válido.' }
      return { cambio: { tipo: 'crear', clave: cambio.clave, datos: validados.valores as DatosGrupo } }
    }
    case 'editar': {
      const problema = destino(cambio.grupo, true)
      if (problema) return { error: problema }
      if (Object.keys(cambio.cambios).length === 0) return { error: 'No hay cambios para guardar.' }
      const validados = validarDatosGrupo(cambio.cambios)
      if ('error' in validados) return { error: validados.error }
      return { cambio: { tipo: 'editar', grupo: cambio.grupo, cambios: validados.valores } }
    }
    case 'eliminar': {
      const problema = destino(cambio.grupo, false)
      return problema ? { error: problema } : { cambio: { tipo: 'eliminar', grupo: cambio.grupo } }
    }
    default:
      return { error: 'El tipo de cambio no es válido.' }
  }
}

/** DETAIL {"indice": i} of a planner_guardar_cambios error, when it is a valid position. */
function leerIndice(detalle: string | null | undefined, total: number): number | null {
  if (!detalle) return null
  try {
    const valor: unknown = JSON.parse(detalle)
    const indice = esObjeto(valor) ? valor.indice : null
    return typeof indice === 'number' && Number.isInteger(indice) && indice >= 0 && indice < total ? indice : null
  } catch {
    return null
  }
}

function leerGuardados(data: unknown): CambiosGuardados {
  const fila = esObjeto(data) ? data : {}
  const creados = esObjeto(fila.grupos_creados) ? fila.grupos_creados : {}
  const gruposCreados: Record<string, string> = {}
  Object.entries(creados).forEach(([clave, grupo]) => {
    const grupoId = id(grupo)
    if (esClaveTemporal(clave) && grupoId) gruposCreados[clave] = grupoId
  })
  return { guardados: typeof fila.guardados === 'number' ? fila.guardados : 0, pasos: ids(fila.pasos), gruposCreados }
}

export interface EntradaGuardarCambios {
  readonly temporadaId: string
  readonly cambios: readonly CambioPlanner[]
}

/**
 * S24: every pending change in one planner_guardar_cambios call, all or
 * nothing. A shape problem is refused before the RPC with the same
 * "Cambio N de M: " prefix the RPC uses; the RPC's errors keep its message
 * and the position of the change (DETAIL {"indice"}). Without the RPC
 * (PGRST202, 42883) it says the database is missing the update.
 */
export async function guardarCambios(cliente: ClienteAcciones, entrada: EntradaGuardarCambios): Promise<ResultadoGuardar> {
  const total = entrada.cambios.length
  const rechazo = (mensaje: string, indice: number | null = null): ResultadoGuardar => ({ ok: false, codigo: 'validacion', mensaje, indice })
  if (!esUuid(entrada.temporadaId)) return rechazo('La temporada no es válida.')
  if (total === 0) return rechazo('No hay cambios para guardar.')
  if (total > MAXIMO_CAMBIOS) return rechazo(`Puedes guardar hasta ${MAXIMO_CAMBIOS} cambios a la vez.`)

  const claves = new Set<string>()
  const cambios: CambioPlanner[] = []
  for (const [i, cambio] of entrada.cambios.entries()) {
    const validado = validarCambio(cambio, claves)
    if ('error' in validado) return rechazo(`Cambio ${i + 1} de ${total}: ${validado.error}`, i)
    if (validado.cambio.tipo === 'crear') claves.add(validado.cambio.clave)
    cambios.push(validado.cambio)
  }

  const { data, error } = await cliente.rpc('planner_guardar_cambios', { p_temporada_id: entrada.temporadaId, p_cambios: cambios })
  if (!error) return { ok: true, datos: leerGuardados(data) }
  const indice = leerIndice(error.details, total)
  if (error.code === 'PGRST202' || error.code === '42883') {
    console.error('[grupos-vida/planificar] planner_guardar_cambios is missing', error)
    return { ok: false, codigo: error.code, mensaje: FALTA_GUARDAR_CAMBIOS, indice: null }
  }
  if (!error.code || !CODIGOS_CON_MENSAJE.has(error.code)) console.error('[grupos-vida/planificar] planner_guardar_cambios failed', error)
  const conMensaje = error.code === '28000' || (error.code !== undefined && CODIGOS_CON_MENSAJE.has(error.code))
  const mensaje = conMensaje ? mensajeErrorAccion(error) : GENERICO_GUARDAR
  return { ok: false, codigo: error.code ?? null, mensaje, indice }
}

// ─── Undo and history ───

/** S15: refused with the reason (40001 someone changed it later, 55000 already undone, 42501 not yours or too old). */
export function deshacerPaso(cliente: ClienteAcciones, entrada: { readonly pasoId: string }): Promise<ResultadoAccion<PasoGuardado>> {
  if (!esUuid(entrada.pasoId)) return Promise.resolve(invalido('El paso no es válido.'))
  return llamar(cliente, 'planner_deshacer_paso', { p_paso_id: entrada.pasoId }, leerPaso)
}

export const PASOS_RECIENTES = 50

/** The latest steps of the season, newest first, with puede_deshacer for the caller. */
export function ultimosPasos(
  cliente: ClienteAcciones,
  entrada: { readonly temporadaId: string; readonly limite?: number },
): Promise<ResultadoAccion<readonly PasoHistorial[]>> {
  if (!esUuid(entrada.temporadaId)) return Promise.resolve(invalido('La temporada no es válida.'))
  const limite = Math.min(Math.max(Math.trunc(entrada.limite ?? PASOS_RECIENTES), 1), 500)
  return llamar(cliente, 'planner_historial', { p_temporada_id: entrada.temporadaId, p_limite: limite }, (data) => leerHistorial(data).filas)
}

/** One page of the history panel (artboard 09). */
export const PASOS_POR_PAGINA = 30

export interface PaginaHistorial {
  readonly pasos: readonly PasoHistorial[]
  /** planner_historial has older steps than the last one of this page. */
  readonly hayMas: boolean
}

/**
 * A page of the history, newest first: the steps saved before `antes` (the
 * creado_en of the last step shown; none for the first page). It asks one
 * row more than the page to know whether there are older ones.
 */
export function historialPaginado(
  cliente: ClienteAcciones,
  entrada: { readonly temporadaId: string; readonly antes?: string | null; readonly limite?: number },
): Promise<ResultadoAccion<PaginaHistorial>> {
  if (!esUuid(entrada.temporadaId)) return Promise.resolve(invalido('La temporada no es válida.'))
  const antes = entrada.antes ?? null
  if (antes !== null && (typeof antes !== 'string' || Number.isNaN(Date.parse(antes)))) {
    return Promise.resolve(invalido('La fecha del historial no es válida.'))
  }
  const limite = Math.min(Math.max(Math.trunc(entrada.limite ?? PASOS_POR_PAGINA), 1), 499)
  return llamar(
    cliente,
    'planner_historial',
    { p_temporada_id: entrada.temporadaId, p_limite: limite + 1, p_antes: antes },
    (data) => {
      const filas = leerHistorial(data).filas
      return { pasos: filas.slice(0, limite), hayMas: filas.length > limite }
    },
    'No se pudo leer el historial. Inténtalo de nuevo.',
  )
}

/**
 * The step "Deshacer" undoes: the caller's newest step that is not an undo
 * and was not undone. Null when the caller has none in the list.
 */
export function pasoADeshacer(pasos: readonly PasoHistorial[], usuarioId: string): PasoHistorial | null {
  return pasos.find((p) => p.actor_id === usuarioId && p.accion !== 'deshacer' && p.deshecho_por === null) ?? null
}

// ─── Publish (S8, S12, S19) ───

export interface TemporadaPublicada {
  readonly temporadaId: string
  readonly nombre: string
  /** The season's groups, all active now. */
  readonly grupos: number
  /** Those that were not active yet. */
  readonly gruposActivados: number
  /** The origin season of the same cohort it closed; null when there was none. */
  readonly origenNombre: string | null
  readonly gruposArchivados: number
}

const numero = (valor: unknown): number => (typeof valor === 'number' && Number.isFinite(valor) ? valor : 0)

/**
 * planner_publicar: activates the season and its groups and closes only the
 * origin of its cohort (S19). Refused with the RPC's own words: blockers or
 * unfinished segments (22023), not the director general (42501).
 */
export function publicarTemporada(cliente: ClienteAcciones, entrada: { readonly temporadaId: string }): Promise<ResultadoAccion<TemporadaPublicada>> {
  if (!esUuid(entrada.temporadaId)) return Promise.resolve(invalido('La temporada no es válida.'))
  return llamar(
    cliente,
    'planner_publicar',
    { p_temporada_id: entrada.temporadaId },
    (data) => {
      const fila = esObjeto(data) ? data : {}
      return {
        temporadaId: id(fila.temporada_id) ?? entrada.temporadaId,
        nombre: textoOVacio(fila.nombre),
        grupos: numero(fila.grupos),
        gruposActivados: numero(fila.grupos_activados),
        origenNombre: id(fila.origen_nombre),
        gruposArchivados: numero(fila.grupos_archivados),
      }
    },
    'No se pudo publicar la temporada. Inténtalo de nuevo.',
  )
}

// ─── "Terminé mi segmento" (S14) ───

export interface EntradaMarcarSegmento {
  readonly temporadaId: string
  readonly segmentoId: string
  readonly terminado: boolean
}

export function marcarSegmento(
  cliente: ClienteAcciones,
  entrada: EntradaMarcarSegmento,
): Promise<ResultadoAccion<{ readonly terminado: boolean; readonly marcadoPorNombre: string | null }>> {
  if (!esUuid(entrada.temporadaId)) return Promise.resolve(invalido('La temporada no es válida.'))
  if (!esUuid(entrada.segmentoId)) return Promise.resolve(invalido('El segmento no es válido.'))
  return llamar(
    cliente,
    'planner_marcar_segmento',
    { p_temporada_id: entrada.temporadaId, p_segmento_id: entrada.segmentoId, p_terminado: entrada.terminado === true },
    (data) => ({
      terminado: esObjeto(data) && data.terminado === true,
      marcadoPorNombre: esObjeto(data) ? id(data.marcado_por_nombre) : null,
    }),
  )
}
