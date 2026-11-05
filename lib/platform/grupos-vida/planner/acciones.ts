/**
 * Planner — the step wrappers of /grupos-vida/planificar (T5b of
 * odd/tasks/planner-gdv.md; S3, S4, S10, S13–S15, S22).
 *
 * One thin function per step RPC of
 * supabase/migrations/20261107110000_planner_pasos.sql (planner_mover_personas,
 * planner_crear_grupo, planner_editar_grupo, planner_eliminar_grupo,
 * planner_deshacer_paso, planner_historial) and planner_marcar_segmento of
 * 20261107120000_planner_temporada.sql. Each one checks the input shape
 * first (uuids, role, group fields) so a bad call never reaches the database,
 * then calls the RPC with the caller's session client: the database checks
 * the role, the segment scope and the rules again. Errors come back as
 * Spanish messages; for 22023, 42501, 40001 and 55000 the RPC's own message
 * is kept, because it already names the group, the person or the reason.
 *
 * The server actions (app/(auth)/grupos-vida/planificar/actions.ts) pass the
 * session client and revalidate RUTA_PLANNER after a saved step.
 */
import { esObjeto, id, ids, textoOVacio } from './campos'
import { leerHistorial, type PasoHistorial } from './tipos'
import type { ErrorPlanner } from './datos'

export const RUTA_PLANNER = '/grupos-vida/planificar'

/** What the wrappers need from the Supabase session client. */
export interface ClienteAcciones {
  rpc(nombre: string, args?: Record<string, unknown>): PromiseLike<{ readonly data: unknown; readonly error: ErrorPlanner | null }>
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
): Promise<ResultadoAccion<T>> {
  const { data, error } = await cliente.rpc(nombre, args)
  if (error) {
    if (!error.code || !CODIGOS_CON_MENSAJE.has(error.code)) console.error(`[grupos-vida/planificar] ${nombre} failed`, error)
    return { ok: false, codigo: error.code ?? null, mensaje: mensajeErrorAccion(error) }
  }
  return { ok: true, datos: leer(data) }
}

const leerPaso = (data: unknown): PasoGuardado => {
  const fila = esObjeto(data) ? data : {}
  return { pasoId: id(fila.paso_id), descripcion: textoOVacio(fila.descripcion), segmentosReabiertos: ids(fila.segmentos_reabiertos) }
}

// ─── Move people ───

export interface EntradaMover {
  readonly temporadaId: string
  readonly usuarioIds: readonly string[]
  /** null = back to the bank. */
  readonly grupoId: string | null
  /** Required with a group; ignored for the bank. */
  readonly rol: RolPlanner | null
}

/** S2, S13: one step; the caller already applied the spouse rule (personasAMover). */
export function moverPersonas(cliente: ClienteAcciones, entrada: EntradaMover): Promise<ResultadoAccion<PasoGuardado>> {
  if (!esUuid(entrada.temporadaId)) return Promise.resolve(invalido('La temporada no es válida.'))
  if (entrada.usuarioIds.length === 0) return Promise.resolve(invalido('Indica al menos una persona.'))
  if (!entrada.usuarioIds.every(esUuid)) return Promise.resolve(invalido('Alguna de las personas no es válida.'))
  if (entrada.usuarioIds.length > MAXIMO_PERSONAS_POR_PASO) {
    return Promise.resolve(invalido(`Puedes mover hasta ${MAXIMO_PERSONAS_POR_PASO} personas por paso.`))
  }
  if (entrada.grupoId !== null && !esUuid(entrada.grupoId)) return Promise.resolve(invalido('El grupo no es válido.'))
  if (entrada.grupoId !== null && !ROLES_PLANNER.includes(entrada.rol as RolPlanner)) {
    return Promise.resolve(invalido('El rol debe ser Líder, Aprendiz o Miembro.'))
  }
  return llamar(
    cliente,
    'planner_mover_personas',
    {
      p_temporada_id: entrada.temporadaId,
      p_usuarios: [...entrada.usuarioIds],
      p_grupo_destino: entrada.grupoId,
      p_rol: entrada.grupoId === null ? null : entrada.rol,
    },
    leerPaso,
  )
}

// ─── Groups ───

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

/** The shape of each field the RPC would refuse, with the same words; the normalized value or an error. */
function validarCampos(datos: Partial<DatosGrupo>): { valores: Record<string, unknown> } | { error: string } {
  const valores: Record<string, unknown> = {}
  if ('nombre' in datos) {
    const nombre = (datos.nombre ?? '').replace(/\s+/g, ' ').trim()
    if (!nombre) return { error: 'El grupo debe tener nombre.' }
    if (nombre.length > LARGO_NOMBRE_GRUPO) return { error: `El nombre del grupo puede tener hasta ${LARGO_NOMBRE_GRUPO} caracteres.` }
    valores.nombre = nombre
  }
  if ('segmento_id' in datos) {
    if (!esUuid(datos.segmento_id)) return { error: 'El segmento no es válido.' }
    valores.segmento_id = datos.segmento_id
  }
  if ('localidad_id' in datos) {
    if (datos.localidad_id !== null && !esUuid(datos.localidad_id)) return { error: 'La localidad no es válida.' }
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
    if (!directores.every(esUuid)) return { error: 'Alguno de los directores de etapa no es válido.' }
    if (new Set(directores).size > MAXIMO_DIRECTORES) return { error: `Un grupo puede tener hasta ${MAXIMO_DIRECTORES} directores de etapa.` }
    valores.director_etapa_ids = [...directores]
  }
  return { valores }
}

export interface EntradaCrearGrupo {
  readonly temporadaId: string
  readonly datos: DatosGrupo
}

/** S3, S4: a new group of the season (starts proximo, inactive). */
export function crearGrupo(cliente: ClienteAcciones, entrada: EntradaCrearGrupo): Promise<ResultadoAccion<PasoGuardado & { readonly grupoId: string | null }>> {
  if (!esUuid(entrada.temporadaId)) return Promise.resolve(invalido('La temporada no es válida.'))
  const validados = validarCampos(entrada.datos)
  if ('error' in validados) return Promise.resolve(invalido(validados.error))
  return llamar(cliente, 'planner_crear_grupo', { p_temporada_id: entrada.temporadaId, p_datos: validados.valores }, (data) => ({
    ...leerPaso(data),
    grupoId: esObjeto(data) ? id(data.grupo_id) : null,
  }))
}

export interface EntradaEditarGrupo {
  readonly grupoId: string
  readonly cambios: Partial<DatosGrupo>
}

/** Only the given fields (e.g. "Usar Cabudare" sends localidad_id). */
export function editarGrupo(cliente: ClienteAcciones, entrada: EntradaEditarGrupo): Promise<ResultadoAccion<PasoGuardado>> {
  if (!esUuid(entrada.grupoId)) return Promise.resolve(invalido('El grupo no es válido.'))
  if (Object.keys(entrada.cambios).length === 0) return Promise.resolve(invalido('No hay cambios para guardar.'))
  const validados = validarCampos(entrada.cambios)
  if ('error' in validados) return Promise.resolve(invalido(validados.error))
  return llamar(cliente, 'planner_editar_grupo', { p_grupo_id: entrada.grupoId, p_cambios: validados.valores }, leerPaso)
}

/** S22: the database refuses a group that already started. */
export function eliminarGrupo(cliente: ClienteAcciones, entrada: { readonly grupoId: string }): Promise<ResultadoAccion<PasoGuardado>> {
  if (!esUuid(entrada.grupoId)) return Promise.resolve(invalido('El grupo no es válido.'))
  return llamar(cliente, 'planner_eliminar_grupo', { p_grupo_id: entrada.grupoId }, leerPaso)
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

/**
 * The step "Deshacer" undoes: the caller's newest step that is not an undo
 * and was not undone. Null when the caller has none in the list.
 */
export function pasoADeshacer(pasos: readonly PasoHistorial[], usuarioId: string): PasoHistorial | null {
  return pasos.find((p) => p.actor_id === usuarioId && p.accion !== 'deshacer' && p.deshecho_por === null) ?? null
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
