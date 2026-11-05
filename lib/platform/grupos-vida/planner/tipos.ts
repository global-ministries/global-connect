/**
 * Planner of GDV seasons — the RPC outputs (T4 of odd/tasks/planner-gdv.md).
 *
 * The types keep the RPC field names (snake_case) one to one so a column is
 * searchable from the SQL to the UI:
 *   planner_temporadas() → TemporadasPlanner and planner_tablero(uuid) →
 *   GrupoTablero (supabase/migrations/20261107100000_planner_lecturas.sql);
 *   planner_banco(uuid) → PersonaBanco (same file);
 *   planner_historial(uuid, int, timestamptz) → PasoHistorial
 *   (20261107110000_planner_pasos.sql);
 *   planner_bloqueos(uuid) → Bloqueo and planner_estado_publicacion(uuid) →
 *   EstadoPublicacion (20261107120000_planner_temporada.sql).
 * Localidad is a row of campus_localidades (id, nombre, municipio_id).
 *
 * The readers take `unknown` (these RPCs are not in database.types.ts yet):
 * a row missing a required value is dropped and counted in `descartadas`,
 * a nested entry (a person, a leader, a season) the same way, never a crash.
 */
import { Descartes, booleano, entero, esObjeto, id, ids, lista, textoOpcional, textoOVacio, type Objeto } from './campos'

/** The rows a reader kept and how many rows or nested entries it dropped. */
export interface Lectura<T> {
  readonly filas: readonly T[]
  readonly descartadas: number
}

export type Cohorte = 'I' | 'II'

export interface SegmentoPlanner {
  readonly id: string
  readonly nombre: string
}

export interface TemporadaPlanner {
  readonly id: string
  readonly nombre: string
  /** 'YYYY-MM-DD'. */
  readonly fecha_inicio: string | null
  readonly fecha_fin: string | null
  readonly estado: string | null
  readonly activa: boolean
  readonly cohorte: Cohorte | null
  readonly origen_id: string | null
  readonly origen_nombre: string | null
}

/** A segment the actor sees, with every eligible director de etapa (by surname, even one without a group). */
export interface SegmentoConDirectores extends SegmentoPlanner {
  readonly directores: readonly DirectorGrupo[]
}

export interface TemporadasPlanner {
  readonly usuario_id: string
  readonly ve_todos_los_segmentos: boolean
  readonly puede_publicar: boolean
  readonly puede_crear_temporada: boolean
  readonly segmentos_editables: readonly string[]
  readonly segmentos: readonly SegmentoConDirectores[]
  readonly temporadas: readonly TemporadaPlanner[]
}

/** A Líder, aprendiz (Colíder) or member of a board group. */
export interface PersonaGrupo {
  readonly usuario_id: string
  readonly nombre: string
  readonly apellido: string
  /** The Líder ids of the person's group in the origin season (empty for someone who led there). */
  readonly lideres_origen: readonly string[]
}

export interface DirectorGrupo {
  readonly segmento_lider_id: string
  readonly usuario_id: string
  readonly nombre: string
  readonly apellido: string
}

export interface GrupoTablero {
  readonly grupo_id: string
  readonly nombre: string
  readonly segmento_id: string
  readonly segmento_nombre: string
  readonly localidad_id: string | null
  readonly localidad_nombre: string | null
  readonly localidad_municipio_id: string | null
  readonly localidad_municipio_nombre: string | null
  readonly dia_reunion: string | null
  readonly hora_reunion: string | null
  readonly capacidad_maxima: number | null
  readonly estado_ciclo: string | null
  readonly estado_aprobacion: string | null
  readonly activo: boolean
  readonly directores: readonly DirectorGrupo[]
  readonly lideres: readonly PersonaGrupo[]
  readonly aprendices: readonly PersonaGrupo[]
  readonly miembros: readonly PersonaGrupo[]
}

export interface LiderOrigen {
  readonly usuario_id: string
  readonly nombre: string
  readonly apellido: string
}

export interface OtraTemporada {
  readonly temporada_id: string
  readonly temporada_nombre: string
  readonly grupo_id: string
  readonly grupo_nombre: string
}

export interface PersonaBanco {
  readonly usuario_id: string
  readonly nombre: string
  readonly apellido: string
  readonly edad: number | null
  readonly genero: string | null
  readonly estado_civil: string | null
  readonly fecha_registro: string | null
  readonly conyuge_id: string | null
  readonly segmento_sugerido_id: string | null
  readonly segmento_sugerido_nombre: string | null
  readonly tiene_direccion: boolean
  readonly municipio_id: string | null
  readonly municipio_nombre: string | null
  readonly grupo_actual_id: string | null
  readonly grupo_actual_nombre: string | null
  readonly grupo_actual_rol: string | null
  readonly grupo_actual_segmento_id: string | null
  readonly grupos_en_temporada: number
  readonly origen_grupo_id: string | null
  readonly origen_grupo_nombre: string | null
  readonly origen_rol: string | null
  readonly origen_lideres: readonly LiderOrigen[]
  readonly otras_temporadas: readonly OtraTemporada[]
}

export const TIPOS_BLOQUEO = ['sin_lider', 'sin_director', 'sin_localidad', 'persona_en_dos_grupos'] as const
export type TipoBloqueo = (typeof TIPOS_BLOQUEO)[number]

export interface Bloqueo {
  readonly tipo: TipoBloqueo
  readonly segmento_id: string
  readonly grupo_id: string
  readonly grupo_nombre: string
  /** Only for persona_en_dos_grupos (one row per person and group). */
  readonly usuario_id: string | null
  readonly detalle: string
}

export type ConteoBloqueos = Readonly<Record<'total' | TipoBloqueo, number>>

export interface SegmentoPublicacion {
  readonly id: string
  readonly nombre: string
  readonly grupos: number
  readonly bloqueos: number
  readonly terminado: boolean
  readonly marcado_por: { readonly id: string; readonly nombre: string | null } | null
  readonly marcado_en: string | null
}

export interface EstadoPublicacion {
  readonly temporada: {
    readonly id: string
    readonly nombre: string
    readonly estado: string | null
    readonly activa: boolean
    readonly cohorte: Cohorte | null
  }
  readonly bloqueos: ConteoBloqueos
  readonly grupos: number
  readonly segmentos: readonly SegmentoPublicacion[]
  readonly segmentos_con_grupos: number
  readonly segmentos_terminados: number
  readonly faltan_segmentos: number
  readonly rol_puede_publicar: boolean
  readonly puede_publicar: boolean
  readonly origen: {
    readonly id: string
    readonly nombre: string
    readonly estado: string | null
    readonly activa: boolean
    readonly grupos_a_archivar: number
  } | null
  readonly otras_activas: readonly { readonly id: string; readonly nombre: string; readonly cohorte: Cohorte | null }[]
}

export const ACCIONES_PASO = ['mover_personas', 'crear_grupo', 'editar_grupo', 'eliminar_grupo', 'deshacer'] as const
export type AccionPaso = (typeof ACCIONES_PASO)[number]

export interface PasoHistorial {
  readonly paso_id: string
  readonly numero: number
  readonly accion: AccionPaso
  readonly descripcion: string
  readonly creado_en: string
  readonly actor_id: string | null
  readonly actor_nombre: string
  readonly segmentos: readonly SegmentoPlanner[]
  readonly grupo_ids: readonly string[]
  readonly usuario_ids: readonly string[]
  readonly deshace_paso_id: string | null
  readonly deshecho_por: string | null
  readonly deshecho_por_nombre: string | null
  readonly puede_deshacer: boolean
  readonly motivo_no_deshacer: string | null
}

export interface Localidad {
  readonly id: string
  readonly nombre: string
  readonly municipio_id: string | null
}

const cohorte = (valor: unknown): Cohorte | null => (valor === 'I' || valor === 'II' ? valor : null)

const unoDe = <T extends string>(opciones: readonly T[], valor: unknown): T | null =>
  opciones.find((opcion) => opcion === valor) ?? null

function leerFilas<T>(datos: unknown, leer: (fila: Objeto, descartes: Descartes) => T | null): Lectura<T> {
  const descartes = new Descartes()
  if (datos === null || datos === undefined) return { filas: [], descartadas: 0 }
  if (!Array.isArray(datos)) return { filas: [], descartadas: 1 }
  const filas = lista(datos, (fila) => (esObjeto(fila) ? leer(fila, descartes) : null), descartes)
  return { filas, descartadas: descartes.total }
}

const leerSegmento = (valor: unknown): SegmentoPlanner | null => {
  if (!esObjeto(valor)) return null
  const segmentoId = id(valor.id)
  const nombre = id(valor.nombre)
  return segmentoId && nombre ? { id: segmentoId, nombre } : null
}

const leerPersonaGrupo = (valor: unknown): PersonaGrupo | null => {
  if (!esObjeto(valor)) return null
  const usuarioId = id(valor.usuario_id)
  if (!usuarioId) return null
  return { usuario_id: usuarioId, nombre: textoOVacio(valor.nombre), apellido: textoOVacio(valor.apellido), lideres_origen: ids(valor.lideres_origen) }
}

const leerDirector = (valor: unknown): DirectorGrupo | null => {
  if (!esObjeto(valor)) return null
  const segmentoLiderId = id(valor.segmento_lider_id)
  const usuarioId = id(valor.usuario_id)
  if (!segmentoLiderId || !usuarioId) return null
  return { segmento_lider_id: segmentoLiderId, usuario_id: usuarioId, nombre: textoOVacio(valor.nombre), apellido: textoOVacio(valor.apellido) }
}

const leerSegmentoConDirectores = (valor: unknown, descartes: Descartes): SegmentoConDirectores | null => {
  const segmento = leerSegmento(valor)
  return segmento && esObjeto(valor) ? { ...segmento, directores: lista(valor.directores, leerDirector, descartes) } : null
}

function leerGrupo(fila: Objeto, descartes: Descartes): GrupoTablero | null {
  const grupoId = id(fila.grupo_id)
  const segmentoId = id(fila.segmento_id)
  const segmentoNombre = id(fila.segmento_nombre)
  const activo = booleano(fila.activo)
  if (!grupoId || !segmentoId || !segmentoNombre || activo === null || typeof fila.nombre !== 'string') return null
  return {
    grupo_id: grupoId,
    nombre: fila.nombre,
    segmento_id: segmentoId,
    segmento_nombre: segmentoNombre,
    localidad_id: id(fila.localidad_id),
    localidad_nombre: textoOpcional(fila.localidad_nombre),
    localidad_municipio_id: id(fila.localidad_municipio_id),
    localidad_municipio_nombre: textoOpcional(fila.localidad_municipio_nombre),
    dia_reunion: textoOpcional(fila.dia_reunion),
    hora_reunion: textoOpcional(fila.hora_reunion),
    capacidad_maxima: entero(fila.capacidad_maxima),
    estado_ciclo: textoOpcional(fila.estado_ciclo),
    estado_aprobacion: textoOpcional(fila.estado_aprobacion),
    activo,
    directores: lista(fila.directores, leerDirector, descartes),
    lideres: lista(fila.lideres, leerPersonaGrupo, descartes),
    aprendices: lista(fila.aprendices, leerPersonaGrupo, descartes),
    miembros: lista(fila.miembros, leerPersonaGrupo, descartes),
  }
}

/** planner_tablero rows: one per visible group of the season. */
export const leerTablero = (datos: unknown): Lectura<GrupoTablero> => leerFilas(datos, leerGrupo)

const leerLiderOrigen = (valor: unknown): LiderOrigen | null => {
  if (!esObjeto(valor)) return null
  const usuarioId = id(valor.usuario_id)
  return usuarioId ? { usuario_id: usuarioId, nombre: textoOVacio(valor.nombre), apellido: textoOVacio(valor.apellido) } : null
}

const leerOtraTemporada = (valor: unknown): OtraTemporada | null => {
  if (!esObjeto(valor)) return null
  const temporadaId = id(valor.temporada_id)
  const grupoId = id(valor.grupo_id)
  if (!temporadaId || !grupoId) return null
  return { temporada_id: temporadaId, temporada_nombre: textoOVacio(valor.temporada_nombre), grupo_id: grupoId, grupo_nombre: textoOVacio(valor.grupo_nombre) }
}

function leerPersonaBanco(fila: Objeto, descartes: Descartes): PersonaBanco | null {
  const usuarioId = id(fila.usuario_id)
  if (!usuarioId) return null
  return {
    usuario_id: usuarioId,
    nombre: textoOVacio(fila.nombre),
    apellido: textoOVacio(fila.apellido),
    edad: entero(fila.edad),
    genero: textoOpcional(fila.genero),
    estado_civil: textoOpcional(fila.estado_civil),
    fecha_registro: textoOpcional(fila.fecha_registro),
    conyuge_id: id(fila.conyuge_id),
    segmento_sugerido_id: id(fila.segmento_sugerido_id),
    segmento_sugerido_nombre: textoOpcional(fila.segmento_sugerido_nombre),
    tiene_direccion: booleano(fila.tiene_direccion) ?? false,
    municipio_id: id(fila.municipio_id),
    municipio_nombre: textoOpcional(fila.municipio_nombre),
    grupo_actual_id: id(fila.grupo_actual_id),
    grupo_actual_nombre: textoOpcional(fila.grupo_actual_nombre),
    grupo_actual_rol: textoOpcional(fila.grupo_actual_rol),
    grupo_actual_segmento_id: id(fila.grupo_actual_segmento_id),
    grupos_en_temporada: entero(fila.grupos_en_temporada) ?? 0,
    origen_grupo_id: id(fila.origen_grupo_id),
    origen_grupo_nombre: textoOpcional(fila.origen_grupo_nombre),
    origen_rol: textoOpcional(fila.origen_rol),
    origen_lideres: lista(fila.origen_lideres, leerLiderOrigen, descartes),
    otras_temporadas: lista(fila.otras_temporadas, leerOtraTemporada, descartes),
  }
}

/** planner_banco rows: everyone, one row per person. */
export const leerBanco = (datos: unknown): Lectura<PersonaBanco> => leerFilas(datos, leerPersonaBanco)

const leerTemporada = (valor: unknown): TemporadaPlanner | null => {
  if (!esObjeto(valor)) return null
  const temporadaId = id(valor.id)
  const nombre = id(valor.nombre)
  const activa = booleano(valor.activa)
  if (!temporadaId || !nombre || activa === null) return null
  return {
    id: temporadaId,
    nombre,
    fecha_inicio: textoOpcional(valor.fecha_inicio),
    fecha_fin: textoOpcional(valor.fecha_fin),
    estado: textoOpcional(valor.estado),
    activa,
    cohorte: cohorte(valor.cohorte),
    origen_id: id(valor.origen_id),
    origen_nombre: textoOpcional(valor.origen_nombre),
  }
}

/** planner_temporadas(): null when the actor or a capability is missing. */
export function leerTemporadas(datos: unknown): TemporadasPlanner | null {
  if (!esObjeto(datos)) return null
  const usuarioId = id(datos.usuario_id)
  const veTodo = booleano(datos.ve_todos_los_segmentos)
  const puedePublicar = booleano(datos.puede_publicar)
  const puedeCrear = booleano(datos.puede_crear_temporada)
  if (!usuarioId || veTodo === null || puedePublicar === null || puedeCrear === null) return null
  const descartes = new Descartes()
  return {
    usuario_id: usuarioId,
    ve_todos_los_segmentos: veTodo,
    puede_publicar: puedePublicar,
    puede_crear_temporada: puedeCrear,
    segmentos_editables: ids(datos.segmentos_editables),
    segmentos: lista(datos.segmentos, (valor) => leerSegmentoConDirectores(valor, descartes), descartes),
    temporadas: lista(datos.temporadas, leerTemporada, descartes),
  }
}

function leerBloqueo(fila: Objeto): Bloqueo | null {
  const tipo = unoDe(TIPOS_BLOQUEO, fila.tipo)
  const segmentoId = id(fila.segmento_id)
  const grupoId = id(fila.grupo_id)
  if (!tipo || !segmentoId || !grupoId) return null
  return {
    tipo,
    segmento_id: segmentoId,
    grupo_id: grupoId,
    grupo_nombre: textoOVacio(fila.grupo_nombre),
    usuario_id: id(fila.usuario_id),
    detalle: textoOVacio(fila.detalle),
  }
}

/** planner_bloqueos rows (the actor's segments). */
export const leerBloqueos = (datos: unknown): Lectura<Bloqueo> => leerFilas(datos, leerBloqueo)

function leerConteo(valor: unknown): ConteoBloqueos | null {
  if (!esObjeto(valor)) return null
  const total = entero(valor.total)
  const [sinLider, sinDirector, sinLocalidad, enDosGrupos] = TIPOS_BLOQUEO.map((tipo) => entero(valor[tipo]))
  if (total === null || sinLider === null || sinDirector === null || sinLocalidad === null || enDosGrupos === null) return null
  return { total, sin_lider: sinLider, sin_director: sinDirector, sin_localidad: sinLocalidad, persona_en_dos_grupos: enDosGrupos }
}

const leerMarca = (valor: unknown): SegmentoPublicacion['marcado_por'] => {
  const marcadoPor = esObjeto(valor) ? id(valor.id) : null
  return marcadoPor && esObjeto(valor) ? { id: marcadoPor, nombre: textoOpcional(valor.nombre) } : null
}

const leerSegmentoPublicacion = (valor: unknown): SegmentoPublicacion | null => {
  const segmento = leerSegmento(valor)
  if (!segmento || !esObjeto(valor)) return null
  const grupos = entero(valor.grupos)
  const bloqueos = entero(valor.bloqueos)
  const terminado = booleano(valor.terminado)
  if (grupos === null || bloqueos === null || terminado === null) return null
  return { ...segmento, grupos, bloqueos, terminado, marcado_por: leerMarca(valor.marcado_por), marcado_en: textoOpcional(valor.marcado_en) }
}

function leerTemporadaPublicacion(valor: unknown): EstadoPublicacion['temporada'] | null {
  if (!esObjeto(valor)) return null
  const temporadaId = id(valor.id)
  const nombre = id(valor.nombre)
  const activa = booleano(valor.activa)
  if (!temporadaId || !nombre || activa === null) return null
  return { id: temporadaId, nombre, estado: textoOpcional(valor.estado), activa, cohorte: cohorte(valor.cohorte) }
}

function leerOrigen(valor: unknown): EstadoPublicacion['origen'] {
  if (!esObjeto(valor)) return null
  const origenId = id(valor.id)
  const nombre = id(valor.nombre)
  if (!origenId || !nombre) return null
  return {
    id: origenId,
    nombre,
    estado: textoOpcional(valor.estado),
    activa: booleano(valor.activa) ?? false,
    grupos_a_archivar: entero(valor.grupos_a_archivar) ?? 0,
  }
}

const leerOtraActiva = (valor: unknown): EstadoPublicacion['otras_activas'][number] | null => {
  const segmento = leerSegmento(valor)
  return segmento && esObjeto(valor) ? { ...segmento, cohorte: cohorte(valor.cohorte) } : null
}

/** planner_estado_publicacion(): null when the season, the counts or the flags are missing. */
export function leerEstadoPublicacion(datos: unknown): EstadoPublicacion | null {
  if (!esObjeto(datos)) return null
  const temporada = leerTemporadaPublicacion(datos.temporada)
  const bloqueos = leerConteo(datos.bloqueos)
  const [grupos, conGrupos, terminados, faltan] = [datos.grupos, datos.segmentos_con_grupos, datos.segmentos_terminados, datos.faltan_segmentos].map(entero)
  const rolPuede = booleano(datos.rol_puede_publicar)
  const puede = booleano(datos.puede_publicar)
  if (!temporada || !bloqueos || grupos === null || conGrupos === null || terminados === null || faltan === null) return null
  if (rolPuede === null || puede === null) return null
  const descartes = new Descartes()
  return {
    temporada,
    bloqueos,
    grupos,
    segmentos: lista(datos.segmentos, leerSegmentoPublicacion, descartes),
    segmentos_con_grupos: conGrupos,
    segmentos_terminados: terminados,
    faltan_segmentos: faltan,
    rol_puede_publicar: rolPuede,
    puede_publicar: puede,
    origen: leerOrigen(datos.origen),
    otras_activas: lista(datos.otras_activas, leerOtraActiva, descartes),
  }
}

function leerPaso(fila: Objeto, descartes: Descartes): PasoHistorial | null {
  const pasoId = id(fila.paso_id)
  const numero = entero(fila.numero)
  const accion = unoDe(ACCIONES_PASO, fila.accion)
  const creadoEn = id(fila.creado_en)
  const puedeDeshacer = booleano(fila.puede_deshacer)
  if (!pasoId || numero === null || !accion || !creadoEn || puedeDeshacer === null) return null
  return {
    paso_id: pasoId,
    numero,
    accion,
    descripcion: textoOVacio(fila.descripcion),
    creado_en: creadoEn,
    actor_id: id(fila.actor_id),
    actor_nombre: textoOVacio(fila.actor_nombre),
    segmentos: lista(fila.segmentos, leerSegmento, descartes),
    grupo_ids: ids(fila.grupo_ids),
    usuario_ids: ids(fila.usuario_ids),
    deshace_paso_id: id(fila.deshace_paso_id),
    deshecho_por: id(fila.deshecho_por),
    deshecho_por_nombre: textoOpcional(fila.deshecho_por_nombre),
    puede_deshacer: puedeDeshacer,
    motivo_no_deshacer: textoOpcional(fila.motivo_no_deshacer),
  }
}

/** planner_historial rows, newest first as the RPC orders them. */
export const leerHistorial = (datos: unknown): Lectura<PasoHistorial> => leerFilas(datos, leerPaso)

function leerLocalidad(fila: Objeto): Localidad | null {
  const localidadId = id(fila.id)
  const nombre = id(fila.nombre)
  return localidadId && nombre ? { id: localidadId, nombre, municipio_id: id(fila.municipio_id) } : null
}

/** campus_localidades rows (id, nombre, municipio_id); other columns are ignored. */
export const leerLocalidades = (datos: unknown): Lectura<Localidad> => leerFilas(datos, leerLocalidad)
