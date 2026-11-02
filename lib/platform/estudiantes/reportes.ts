/**
 * Estudiantes — the pure view model of /estudiantes/reportes, "Reportes de
 * asistencia" (C6d3 of odd/tasks/estudiantes-fase-b.md, S17–S20, L48, L49;
 * artboards 11 desktop and 12 phone of design/estudiantes-asistencia,
 * A26–A34).
 *
 * - Reads the three report RPCs of
 *   supabase/migrations/20261102140000_estudiantes_reportes.sql
 *   (estudiantes_reporte_asistencia, _detalle, _embudo) defensively.
 * - Who may report (S19, level >= 2): the sub-áreas of
 *   estudiantes_subareas_gestionables (level 3, with the campus name) plus
 *   the active groups of estudiantes_mis_grupos seen at level >= 2
 *   (`puede_ver_vivo`, which also covers The Living Room entrenadores); the
 *   RPCs check it all again. Ámbitos go Transit → Inside Out → The Living
 *   Room (S20).
 * - The range: last 8 weeks ending today by default, the quick ranges of the
 *   artboard, or custom dates the RPC accepts (at most 366 days, up to
 *   today).
 * - Thresholds (L48): asistencia baja below 50 %, "Faltan 3+ seguidas" from 3
 *   absences in a row, "Estable" when the change is under 3 points.
 * - The lists (pills, search, sort, footer), the hero line, the ámbito cards,
 *   the «Embudo de conexión» Sin grupo → En grupo → Sirviendo (L49; Foyer /
 *   Living Room / Kitchen are only the plan's internal names and never show)
 *   and the read-only group / person drawers.
 */
import type { Json } from '@/lib/supabase/database.types'

import { experienciaDe, type Experiencia, type FilaMisGrupos, type FilaSubarea, type Objeto } from './grupos-datos'
import { fechaLarga, horaCorta } from './lista-vista'
import { compararAmbitos } from '@/lib/platform/estudiantes/orden-ambitos'

// ── Reading the RPCs ─────────────────────────────────────────────────

const esObjeto = (valor: unknown): valor is Objeto => typeof valor === 'object' && valor !== null && !Array.isArray(valor)
const objetos = (valor: unknown): readonly Objeto[] => (Array.isArray(valor) ? valor.filter(esObjeto) : [])
const texto = (o: Objeto, clave: string): string | null => {
  const v = o[clave]
  return typeof v === 'string' && v !== '' ? v : null
}
const numero = (o: Objeto, clave: string): number | null => {
  const v = o[clave]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}
const entero = (o: Objeto, clave: string): number => numero(o, clave) ?? 0
const textos = (valor: Json | undefined): string[] => (Array.isArray(valor) ? valor.filter((v): v is string => typeof v === 'string' && v !== '') : [])
const nombreDe = (o: Objeto): string => [texto(o, 'nombre'), texto(o, 'apellido')].filter(Boolean).join(' ')

export interface SubareaReporte {
  readonly subareaId: string
  readonly label: string
  readonly grupos: number
}

export interface ResumenReporte {
  readonly grupos: number
  readonly reuniones: number
  readonly presentes: number
  readonly ausentes: number
  readonly porcentaje: number | null
  readonly visitantes: number
  readonly sinMarcar: number
  readonly personas: number
}

/** A group's figures in the range (estudiantes_reporte_grupo). */
export interface CifrasGrupo {
  readonly reuniones: number
  readonly reunionesEsperadas: number
  readonly sinMarcar: number
  readonly sinMarcarFechas: readonly string[]
  readonly presentes: number
  readonly ausentes: number
  readonly visitantes: number
  readonly promedioPresentes: number | null
  readonly porcentaje: number | null
  readonly reunionesPrevias: number
  readonly porcentajePrevio: number | null
  readonly delta: number | null
}

export interface GrupoReporte extends CifrasGrupo {
  readonly grupoId: string
  readonly nombre: string
  readonly subareaId: string | null
  readonly subarea: string | null
  readonly anio: number | null
  readonly anioEtiqueta: string | null
  readonly diaSemana: number | null
  readonly hora: string | null
  readonly lideres: readonly string[]
  readonly miembros: number
}

/** A person's figures in the range (estudiantes_reporte_personas). */
export interface CifrasPersona {
  readonly reuniones: number
  readonly presentes: number
  readonly ausentes: number
  readonly sinMarcar: number
  readonly porcentaje: number | null
  readonly ausenciasSeguidas: number
  readonly ultimaPresente: string | null
  readonly gruposEnRango: readonly string[]
}

export interface PersonaReporte extends CifrasPersona {
  readonly personaId: string
  readonly nombre: string
  readonly anioEtiqueta: string | null
  readonly grupoId: string | null
  readonly grupo: string | null
  readonly miembroDesde: string | null
}

export interface ReporteAsistencia {
  readonly desde: string
  readonly hasta: string
  readonly previoDesde: string | null
  readonly previoHasta: string | null
  readonly subareas: readonly SubareaReporte[]
  readonly resumen: ResumenReporte
  readonly grupos: readonly GrupoReporte[]
  readonly personas: readonly PersonaReporte[]
}

function aCifrasGrupo(o: Objeto): CifrasGrupo {
  return {
    reuniones: entero(o, 'reuniones'),
    reunionesEsperadas: entero(o, 'reuniones_esperadas'),
    sinMarcar: entero(o, 'sin_marcar'),
    sinMarcarFechas: textos(o.sin_marcar_fechas),
    presentes: entero(o, 'presentes'),
    ausentes: entero(o, 'ausentes'),
    visitantes: entero(o, 'visitantes'),
    promedioPresentes: numero(o, 'promedio_presentes'),
    porcentaje: numero(o, 'porcentaje'),
    reunionesPrevias: entero(o, 'reuniones_previas'),
    porcentajePrevio: numero(o, 'porcentaje_previo'),
    delta: numero(o, 'delta'),
  }
}

function aCifrasPersona(o: Objeto): CifrasPersona {
  return {
    reuniones: entero(o, 'reuniones'),
    presentes: entero(o, 'presentes'),
    ausentes: entero(o, 'ausentes'),
    sinMarcar: entero(o, 'sin_marcar'),
    porcentaje: numero(o, 'porcentaje'),
    ausenciasSeguidas: entero(o, 'ausencias_seguidas'),
    ultimaPresente: texto(o, 'ultima_presente'),
    gruposEnRango: textos(o.grupos_en_rango),
  }
}

function aGrupoReporte(o: Objeto): GrupoReporte | null {
  const grupoId = texto(o, 'grupo_id')
  if (!grupoId) return null
  return {
    grupoId,
    nombre: texto(o, 'nombre') ?? 'Grupo',
    subareaId: texto(o, 'subarea_id'),
    subarea: texto(o, 'subarea'),
    anio: numero(o, 'anio'),
    anioEtiqueta: texto(o, 'anio_etiqueta'),
    diaSemana: numero(o, 'dia_semana'),
    hora: texto(o, 'hora'),
    lideres: textos(o.lideres),
    miembros: entero(o, 'miembros'),
    ...aCifrasGrupo(o),
  }
}

function aPersonaReporte(o: Objeto): PersonaReporte | null {
  const personaId = texto(o, 'persona_id')
  if (!personaId) return null
  return {
    personaId,
    nombre: nombreDe(o) || 'Sin nombre',
    anioEtiqueta: texto(o, 'anio_etiqueta'),
    grupoId: texto(o, 'grupo_id'),
    grupo: texto(o, 'grupo'),
    miembroDesde: texto(o, 'miembro_desde'),
    ...aCifrasPersona(o),
  }
}

const sinNulos = <T>(lista: readonly (T | null)[]): T[] => lista.filter((x): x is T => x !== null)

/** estudiantes_reporte_asistencia; `null` when it is not a report. */
export function leerReporteAsistencia(data: unknown): ReporteAsistencia | null {
  if (!esObjeto(data)) return null
  const desde = texto(data, 'desde')
  const hasta = texto(data, 'hasta')
  if (!desde || !hasta || !Array.isArray(data.grupos)) return null
  const r = esObjeto(data.resumen) ? data.resumen : {}
  return {
    desde,
    hasta,
    previoDesde: texto(data, 'previo_desde'),
    previoHasta: texto(data, 'previo_hasta'),
    subareas: sinNulos(
      objetos(data.subareas).map((s) => {
        const subareaId = texto(s, 'subarea_id')
        return subareaId ? { subareaId, label: texto(s, 'label') ?? '', grupos: entero(s, 'grupos') } : null
      }),
    ),
    resumen: {
      grupos: entero(r, 'grupos'),
      reuniones: entero(r, 'reuniones'),
      presentes: entero(r, 'presentes'),
      ausentes: entero(r, 'ausentes'),
      porcentaje: numero(r, 'porcentaje'),
      visitantes: entero(r, 'visitantes'),
      sinMarcar: entero(r, 'sin_marcar'),
      personas: entero(r, 'personas'),
    },
    grupos: sinNulos(objetos(data.grupos).map(aGrupoReporte)),
    personas: sinNulos(objetos(data.personas).map(aPersonaReporte)),
  }
}

export type TipoSinGrupo = 'visitante' | 'ficha' | 'antes_en_grupo'

export interface PersonaEmbudo {
  readonly personaId: string
  readonly nombre: string
  /** Only in Sin grupo. */
  readonly tipo: TipoSinGrupo | null
  readonly grupoId: string | null
  readonly grupo: string | null
  readonly anioEtiqueta: string | null
  /** The Dream Team equipos of whoever serves (En grupo, Sirviendo). */
  readonly servicio: string | null
}

export interface EtapaEmbudo {
  readonly cantidad: number
  readonly personas: readonly PersonaEmbudo[]
}

export interface Embudo {
  readonly fecha: string | null
  readonly sinGrupo: EtapaEmbudo
  readonly enGrupo: EtapaEmbudo
  readonly sirviendo: EtapaEmbudo
}

const TIPOS_SIN_GRUPO: readonly TipoSinGrupo[] = ['visitante', 'ficha', 'antes_en_grupo']

function aEtapa(valor: Json | undefined): EtapaEmbudo | null {
  if (!esObjeto(valor) || numero(valor, 'cantidad') === null) return null
  return {
    cantidad: entero(valor, 'cantidad'),
    personas: sinNulos(
      objetos(valor.personas).map((p) => {
        const personaId = texto(p, 'persona_id')
        if (!personaId) return null
        const tipo = texto(p, 'tipo')
        return {
          personaId,
          nombre: nombreDe(p) || 'Sin nombre',
          tipo: TIPOS_SIN_GRUPO.find((t) => t === tipo) ?? null,
          grupoId: texto(p, 'grupo_id'),
          grupo: texto(p, 'grupo'),
          anioEtiqueta: texto(p, 'anio_etiqueta'),
          servicio: texto(p, 'servicio'),
        }
      }),
    ),
  }
}

/** estudiantes_reporte_embudo; `null` when a step is missing. */
export function leerEmbudo(data: unknown): Embudo | null {
  if (!esObjeto(data)) return null
  const sinGrupo = aEtapa(data.sin_grupo)
  const enGrupo = aEtapa(data.en_grupo)
  const sirviendo = aEtapa(data.sirviendo)
  if (!sinGrupo || !enGrupo || !sirviendo) return null
  return { fecha: texto(data, 'fecha'), sinGrupo, enGrupo, sirviendo }
}

export interface ReunionGrupoDetalle {
  readonly fecha: string
  readonly reunionId: string | null
  readonly turno: string | null
  readonly lugar: string | null
  readonly presentes: number
  readonly ausentes: number
  readonly visitantes: number
  readonly porcentaje: number | null
  readonly sinMarcar: boolean
}

export interface IntegranteDetalle extends CifrasPersona {
  readonly personaId: string
  readonly nombre: string
  readonly miembroDesde: string | null
}

export interface DetalleGrupoReporte {
  readonly grupo: {
    readonly grupoId: string
    readonly nombre: string
    readonly ambitoId: string | null
    readonly ambito: string | null
    readonly subarea: string | null
    readonly anioEtiqueta: string | null
    readonly diaSemana: number | null
    readonly hora: string | null
    readonly lideres: readonly string[]
  }
  readonly desde: string
  readonly hasta: string
  readonly resumen: CifrasGrupo
  readonly reuniones: readonly ReunionGrupoDetalle[]
  readonly integrantes: readonly IntegranteDetalle[]
}

/** estudiantes_reporte_detalle with p_grupo_id; `null` for anything else. */
export function leerDetalleGrupo(data: unknown): DetalleGrupoReporte | null {
  if (!esObjeto(data) || !esObjeto(data.grupo)) return null
  const g = data.grupo
  const grupoId = texto(g, 'grupo_id')
  const desde = texto(data, 'desde')
  const hasta = texto(data, 'hasta')
  if (!grupoId || !desde || !hasta) return null
  return {
    grupo: {
      grupoId,
      nombre: texto(g, 'nombre') ?? 'Grupo',
      ambitoId: texto(g, 'ambito_id'),
      ambito: texto(g, 'ambito'),
      subarea: texto(g, 'subarea'),
      anioEtiqueta: texto(g, 'anio_etiqueta'),
      diaSemana: numero(g, 'dia_semana'),
      hora: texto(g, 'hora'),
      lideres: textos(g.lideres),
    },
    desde,
    hasta,
    resumen: aCifrasGrupo(esObjeto(data.resumen) ? data.resumen : {}),
    reuniones: sinNulos(
      objetos(data.reuniones).map((r) => {
        const fecha = texto(r, 'fecha')
        if (!fecha) return null
        return {
          fecha,
          reunionId: texto(r, 'reunion_id'),
          turno: texto(r, 'turno'),
          lugar: texto(r, 'lugar'),
          presentes: entero(r, 'presentes'),
          ausentes: entero(r, 'ausentes'),
          visitantes: entero(r, 'visitantes'),
          porcentaje: numero(r, 'porcentaje'),
          sinMarcar: r.sin_marcar === true,
        }
      }),
    ),
    integrantes: sinNulos(
      objetos(data.integrantes).map((p) => {
        const personaId = texto(p, 'persona_id')
        return personaId ? { personaId, nombre: nombreDe(p) || 'Sin nombre', miembroDesde: texto(p, 'miembro_desde'), ...aCifrasPersona(p) } : null
      }),
    ),
  }
}

export type EstadoReunionPersona = 'presente' | 'ausente' | 'sin_marcar' | 'nadie_marco'

export interface ReunionPersonaDetalle {
  readonly fecha: string
  readonly grupoId: string
  readonly grupo: string
  readonly reunionId: string | null
  readonly turno: string | null
  readonly estado: EstadoReunionPersona
}

export interface MembresiaDetalle {
  readonly grupoId: string
  readonly grupo: string
  readonly desde: string | null
  readonly retiradoAt: string | null
  readonly activo: boolean
}

export interface DetallePersonaReporte {
  readonly persona: { readonly personaId: string; readonly nombre: string; readonly anioEtiqueta: string | null; readonly egresado: boolean }
  readonly desde: string
  readonly hasta: string
  readonly resumen: CifrasPersona
  readonly membresias: readonly MembresiaDetalle[]
  readonly reuniones: readonly ReunionPersonaDetalle[]
}

const ESTADOS_REUNION: readonly EstadoReunionPersona[] = ['presente', 'ausente', 'sin_marcar', 'nadie_marco']

/** estudiantes_reporte_detalle with p_persona_id; `null` for anything else. */
export function leerDetallePersona(data: unknown): DetallePersonaReporte | null {
  if (!esObjeto(data) || !esObjeto(data.persona)) return null
  const p = data.persona
  const personaId = texto(p, 'persona_id')
  const desde = texto(data, 'desde')
  const hasta = texto(data, 'hasta')
  if (!personaId || !desde || !hasta) return null
  return {
    persona: { personaId, nombre: nombreDe(p) || 'Sin nombre', anioEtiqueta: texto(p, 'anio_etiqueta'), egresado: p.egresado === true },
    desde,
    hasta,
    resumen: aCifrasPersona(esObjeto(data.resumen) ? data.resumen : {}),
    membresias: sinNulos(
      objetos(data.membresias).map((m) => {
        const grupoId = texto(m, 'grupo_id')
        return grupoId ? { grupoId, grupo: texto(m, 'grupo') ?? 'Grupo', desde: texto(m, 'desde'), retiradoAt: texto(m, 'retirado_at'), activo: m.activo === true } : null
      }),
    ),
    reuniones: sinNulos(
      objetos(data.reuniones).map((r) => {
        const fecha = texto(r, 'fecha')
        const grupoId = texto(r, 'grupo_id')
        const estado = ESTADOS_REUNION.find((e) => e === texto(r, 'estado'))
        if (!fecha || !grupoId || !estado) return null
        return { fecha, grupoId, grupo: texto(r, 'grupo') ?? 'Grupo', reunionId: texto(r, 'reunion_id'), turno: texto(r, 'turno'), estado }
      }),
    ),
  }
}

// ── Errors ───────────────────────────────────────────────────────────

type ErrorRpc = { readonly code?: string; readonly message?: string } | null | undefined

export const MENSAJES_ERROR_REPORTES = {
  sin_autoridad: 'No tienes acceso a los reportes de este ámbito.',
  rango_invalido: 'Revisa las fechas: «Desde» debe ser anterior a «Hasta» y el rango no puede pasar de un año.',
  ambito_invalido: 'Ese ámbito ya no tiene grupos para reportar. Recarga la página.',
  subarea_invalida: 'Esa sub-área ya no tiene grupos en este ámbito. Recarga la página.',
  parametros_invalidos: 'Revisa los datos e inténtalo de nuevo.',
  grupo_invalido: 'Ese grupo ya no existe. Recarga la página.',
  persona_invalida: 'Esa persona ya no existe. Recarga la página.',
} as const

export type CodigoErrorReportes = keyof typeof MENSAJES_ERROR_REPORTES

export const SIN_CARGAR_REPORTE = 'No se pudo cargar el reporte. Recarga la página.'

const esCodigo = (valor: string): valor is CodigoErrorReportes => Object.prototype.hasOwnProperty.call(MENSAJES_ERROR_REPORTES, valor)

/** The code of an RPC error (`sin_autoridad` for SQLSTATE 42501); `null` when unknown. */
export function codigoErrorReportes(error: ErrorRpc): CodigoErrorReportes | null {
  const mensaje = error?.message?.trim() ?? ''
  if (esCodigo(mensaje)) return mensaje
  if (error?.code === '42501') return 'sin_autoridad'
  return null
}

export function mensajeErrorReportes(error: ErrorRpc): string {
  const codigo = codigoErrorReportes(error)
  return codigo ? MENSAJES_ERROR_REPORTES[codigo] : SIN_CARGAR_REPORTE
}

// ── Who may report: campus and ámbitos ───────────────────────────────

/** A sub-área of a campus the caller may report on (level >= 2). */
export interface OpcionReporte {
  readonly campusId: string
  /** Known from estudiantes_subareas_gestionables; `null` for level-2 rows. */
  readonly campus: string | null
  readonly ambitoId: string
  readonly ambito: string
  readonly experiencia: Experiencia
  readonly subareaId: string
  readonly subarea: string
}

/** Managed sub-áreas (level 3) plus the active groups seen at level >= 2, once per campus and sub-área. */
export function opcionesReportes(gestionables: readonly FilaSubarea[], misGrupos: readonly FilaMisGrupos[]): OpcionReporte[] {
  const porClave = new Map<string, OpcionReporte>()
  const agregar = (o: OpcionReporte): void => {
    const clave = `${o.campusId}|${o.subareaId}`
    if (!porClave.has(clave)) porClave.set(clave, o)
  }
  for (const s of gestionables) {
    agregar({ campusId: s.campus_id, campus: s.campus, ambitoId: s.ambito_id, ambito: s.ambito, experiencia: experienciaDe(s.experiencia), subareaId: s.subarea_id, subarea: s.subarea })
  }
  for (const g of misGrupos) {
    if (!g.puede_ver_vivo || !g.activo) continue
    agregar({ campusId: g.campus_id, campus: null, ambitoId: g.ambito_id, ambito: g.ambito, experiencia: experienciaDe(g.experiencia), subareaId: g.subarea_id, subarea: g.subarea })
  }
  return [...porClave.values()]
}

export interface CampusReporte {
  readonly id: string
  readonly nombre: string
}

/** The campuses of the options by name; `nombres` fills the level-2 ones. */
export function campusDeReportes(opciones: readonly OpcionReporte[], nombres: Readonly<Record<string, string>>): CampusReporte[] {
  const porId = new Map<string, string>()
  for (const o of opciones) if (o.campus && !porId.has(o.campusId)) porId.set(o.campusId, o.campus)
  for (const o of opciones) if (!porId.has(o.campusId)) porId.set(o.campusId, nombres[o.campusId] ?? 'Campus')
  return [...porId.entries()].map(([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

/** Campus ids whose name is not in the options (to read from `campus`). */
export function campusSinNombre(opciones: readonly OpcionReporte[]): string[] {
  const conNombre = new Set(opciones.filter((o) => o.campus).map((o) => o.campusId))
  return [...new Set(opciones.map((o) => o.campusId))].filter((id) => !conNombre.has(id))
}

/** `?campus=` when it is one of them, else the first. */
export function elegirCampusReporte(campus: readonly CampusReporte[], pedido: string | null | undefined): CampusReporte | null {
  return campus.find((c) => c.id === pedido) ?? campus[0] ?? null
}

export interface AmbitoReporte {
  readonly id: string
  readonly nombre: string
  readonly experiencia: Experiencia
  readonly subareas: readonly { readonly id: string; readonly label: string }[]
}

/** The ámbitos of a campus, Transit → Inside Out → The Living Room (S20), with their sub-áreas A–Z. */
export function ambitosDeCampus(opciones: readonly OpcionReporte[], campusId: string): AmbitoReporte[] {
  const porId = new Map<string, { nombre: string; experiencia: Experiencia; subareas: { id: string; label: string }[] }>()
  for (const o of opciones) {
    if (o.campusId !== campusId) continue
    const ambito = porId.get(o.ambitoId) ?? { nombre: o.ambito, experiencia: o.experiencia, subareas: [] }
    ambito.subareas.push({ id: o.subareaId, label: o.subarea })
    porId.set(o.ambitoId, ambito)
  }
  return [...porId.entries()]
    .map(([id, a]) => ({ id, nombre: a.nombre, experiencia: a.experiencia, subareas: [...a.subareas].sort((x, y) => x.label.localeCompare(y.label, 'es')) }))
    .sort((a, b) => compararAmbitos({ ambito: a.nombre, experiencia: a.experiencia }, { ambito: b.nombre, experiencia: b.experiencia }))
}

// ── Dates and ranges ─────────────────────────────────────────────────

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'] as const
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'] as const
/** The RPCs accept at most 366 days counting both ends. */
const MAX_DIAS = 365

const aTiempo = (fecha: string): number => Date.parse(`${fecha}T00:00:00Z`)
const aFecha = (tiempo: number): string => new Date(tiempo).toISOString().slice(0, 10)
const sumarDias = (fecha: string, dias: number): string => aFecha(aTiempo(fecha) + dias * 864e5)
const diasEntre = (desde: string, hasta: string): number => Math.round((aTiempo(hasta) - aTiempo(desde)) / 864e5)
const esFecha = (valor: unknown): valor is string => typeof valor === 'string' && FECHA_RE.test(valor) && aFecha(aTiempo(valor)) === valor

function sumarMeses(fecha: string, meses: number): string {
  const [anio, mes, dia] = fecha.split('-').map(Number)
  const ultimo = new Date(Date.UTC(anio, mes - 1 + meses + 1, 0)).getUTCDate()
  return aFecha(Date.UTC(anio, mes - 1 + meses, Math.min(dia, ultimo)))
}

function limitesMes(hoy: string, desplazamiento: number): { readonly desde: string; readonly hasta: string } {
  const [anio, mes] = hoy.split('-').map(Number)
  return { desde: aFecha(Date.UTC(anio, mes - 1 + desplazamiento, 1)), hasta: aFecha(Date.UTC(anio, mes + desplazamiento, 0)) }
}

/** "8 sep". */
export function fechaDia(fecha: string): string {
  const d = new Date(aTiempo(fecha))
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`
}

/** "8 sep – 2 nov". */
export const fechaRango = (desde: string, hasta: string): string => `${fechaDia(desde)} – ${fechaDia(hasta)}`

export type ClaveRango = '8sem' | 'mes' | 'anterior' | '6m'

export interface RangoRapido {
  readonly clave: ClaveRango
  readonly etiqueta: string
  readonly desde: string
  readonly hasta: string
}

export interface RangoReporte {
  /** `fechas` = custom dates. */
  readonly clave: ClaveRango | 'fechas'
  readonly desde: string
  readonly hasta: string
}

/** The quick ranges of the artboard, ending today (Caracas): weeks, not Sundays, because The Living Room meets on weekdays. */
export function rangosReportes(hoy: string): RangoRapido[] {
  return [
    { clave: '8sem', etiqueta: 'Últimas 8 semanas', desde: sumarDias(hoy, -55), hasta: hoy },
    { clave: 'mes', etiqueta: 'Este mes', desde: limitesMes(hoy, 0).desde, hasta: hoy },
    { clave: 'anterior', etiqueta: 'Mes anterior', ...limitesMes(hoy, -1) },
    { clave: '6m', etiqueta: 'Últimos 6 meses', desde: sumarDias(sumarMeses(hoy, -6), 1), hasta: hoy },
  ]
}

/** Why a custom range cannot be used; `null` when it can. */
export function validarRango(desde: string, hasta: string, hoy: string): string | null {
  if (!esFecha(desde) || !esFecha(hasta)) return 'Elige las dos fechas.'
  if (desde > hasta) return 'Revisa las fechas: «Desde» debe ser anterior a «Hasta».'
  if (hasta > hoy) return '«Hasta» no puede ser después de hoy.'
  if (diasEntre(desde, hasta) > MAX_DIAS) return 'Elige un rango de hasta un año.'
  return null
}

const primero = (valor: string | readonly string[] | undefined): string | undefined => (Array.isArray(valor) ? valor[0] : (valor as string | undefined))

/** `?rango=` or valid `?desde&hasta`; the last 8 weeks otherwise. */
export function resolverRango(parametros: { readonly rango?: string | readonly string[]; readonly desde?: string | readonly string[]; readonly hasta?: string | readonly string[] }, hoy: string): RangoReporte {
  const rapidos = rangosReportes(hoy)
  const pedido = rapidos.find((r) => r.clave === primero(parametros.rango))
  if (pedido) return { clave: pedido.clave, desde: pedido.desde, hasta: pedido.hasta }
  const desde = primero(parametros.desde)
  const hasta = primero(parametros.hasta)
  if (desde && hasta && validarRango(desde, hasta, hoy) === null) return { clave: 'fechas', desde, hasta }
  return { clave: '8sem', desde: rapidos[0].desde, hasta: rapidos[0].hasta }
}

// ── URL ──────────────────────────────────────────────────────────────

export type TabReportes = 'grupos' | 'personas'
export type MetricaGruposReporte = 'baja' | 'bajando' | 'sinmarcar'
export type MetricaPersonasReporte = 'seguidas' | 'baja' | 'sinmarcar'
export type OrdenGruposReporte = 'anio' | 'nombre' | 'miembros' | 'asistencia' | 'tendencia'
export type OrdenPersonasReporte = 'nombre' | 'grupo' | 'asistencia' | 'seguidas' | 'ultima'

export interface FiltrosReportes {
  readonly tab: TabReportes
  readonly metrica: MetricaGruposReporte | MetricaPersonasReporte | null
  readonly ordenGrupos: OrdenGruposReporte
  readonly ordenPersonas: OrdenPersonasReporte
  readonly q: string
}

export const FILTROS_REPORTES: FiltrosReportes = { tab: 'grupos', metrica: null, ordenGrupos: 'anio', ordenPersonas: 'nombre', q: '' }

export const METRICAS_GRUPOS: readonly MetricaGruposReporte[] = ['baja', 'bajando', 'sinmarcar']
export const METRICAS_PERSONAS: readonly MetricaPersonasReporte[] = ['seguidas', 'baja', 'sinmarcar']

export const ORDENES_GRUPOS: readonly { readonly id: OrdenGruposReporte; readonly etiqueta: string; readonly pie: string }[] = [
  { id: 'anio', etiqueta: 'Año escolar', pie: 'Orden: año escolar' },
  { id: 'nombre', etiqueta: 'Grupo A–Z', pie: 'Orden: grupo A–Z' },
  { id: 'miembros', etiqueta: 'Más integrantes', pie: 'Orden: más integrantes primero' },
  { id: 'asistencia', etiqueta: 'Asistencia más baja', pie: 'Orden: asistencia más baja primero' },
  { id: 'tendencia', etiqueta: 'Más bajada', pie: 'Orden: más bajada primero' },
]

export const ORDENES_PERSONAS: readonly { readonly id: OrdenPersonasReporte; readonly etiqueta: string; readonly pie: string }[] = [
  { id: 'nombre', etiqueta: 'Nombre A–Z', pie: 'Orden: nombre A–Z' },
  { id: 'grupo', etiqueta: 'Grupo', pie: 'Orden: grupo' },
  { id: 'asistencia', etiqueta: 'Asistencia más baja', pie: 'Orden: asistencia más baja primero' },
  { id: 'seguidas', etiqueta: 'Más faltas seguidas', pie: 'Orden: más faltas seguidas primero' },
  { id: 'ultima', etiqueta: 'Hace más tiempo', pie: 'Orden: hace más tiempo primero' },
]

export type ParametrosReportes = Readonly<Record<string, string | readonly string[] | undefined>>

/** The list filters of `?tab&metrica&orden&q`; unknown values fall back to the default. */
export function leerFiltrosReportes(parametros: ParametrosReportes): FiltrosReportes {
  const tab: TabReportes = primero(parametros.tab) === 'personas' ? 'personas' : 'grupos'
  const metrica = primero(parametros.metrica)
  const orden = primero(parametros.orden)
  const metricas: readonly string[] = tab === 'grupos' ? METRICAS_GRUPOS : METRICAS_PERSONAS
  return {
    tab,
    metrica: metrica && metricas.includes(metrica) ? (metrica as FiltrosReportes['metrica']) : null,
    ordenGrupos: tab === 'grupos' ? (ORDENES_GRUPOS.find((o) => o.id === orden)?.id ?? 'anio') : 'anio',
    ordenPersonas: tab === 'personas' ? (ORDENES_PERSONAS.find((o) => o.id === orden)?.id ?? 'nombre') : 'nombre',
    q: primero(parametros.q) ?? '',
  }
}

export interface ConsultaReportes {
  /** Only when the caller has more than one campus. */
  readonly campusId: string | null
  readonly ambitoId: string
  readonly subareaId: string | null
  readonly rango: RangoReporte
}

export interface DetalleUrl {
  readonly grupoId: string | null
  readonly personaId: string | null
}

/** The page URL; only what differs from the defaults. */
export function urlReportes(consulta: ConsultaReportes, filtros: FiltrosReportes, detalle: DetalleUrl | null = null): string {
  const p = new URLSearchParams()
  if (consulta.campusId) p.set('campus', consulta.campusId)
  p.set('ambito', consulta.ambitoId)
  if (consulta.subareaId) p.set('subarea', consulta.subareaId)
  if (consulta.rango.clave === 'fechas') {
    p.set('desde', consulta.rango.desde)
    p.set('hasta', consulta.rango.hasta)
  } else if (consulta.rango.clave !== '8sem') p.set('rango', consulta.rango.clave)
  if (filtros.tab !== 'grupos') p.set('tab', filtros.tab)
  if (filtros.metrica) p.set('metrica', filtros.metrica)
  const orden = filtros.tab === 'grupos' ? (filtros.ordenGrupos !== 'anio' ? filtros.ordenGrupos : null) : filtros.ordenPersonas !== 'nombre' ? filtros.ordenPersonas : null
  if (orden) p.set('orden', orden)
  if (filtros.q.trim()) p.set('q', filtros.q.trim())
  if (detalle?.grupoId) p.set('grupo', detalle.grupoId)
  else if (detalle?.personaId) p.set('persona', detalle.personaId)
  return `/estudiantes/reportes?${p.toString()}`
}

// ── Thresholds (L48) and words ───────────────────────────────────────

export const UMBRAL_BAJA = 50
export const UMBRAL_SEGUIDAS = 3
export const UMBRAL_ESTABLE = 3

export const asistenciaBaja = (porcentaje: number | null): boolean => porcentaje !== null && porcentaje < UMBRAL_BAJA
export const faltanSeguidas = (seguidas: number): boolean => seguidas >= UMBRAL_SEGUIDAS
const bajando = (delta: number | null): boolean => delta !== null && delta <= -UMBRAL_ESTABLE

export interface Tendencia {
  readonly tipo: 'sube' | 'baja' | 'estable' | 'sin_datos'
  readonly texto: string
  readonly accesible: string
}

/** The change in points against the previous period of the same length; never color alone (GR2). */
export function tendencia(delta: number | null): Tendencia {
  if (delta === null) return { tipo: 'sin_datos', texto: 'Sin datos previos', accesible: 'Sin datos del período anterior' }
  if (Math.abs(delta) < UMBRAL_ESTABLE) return { tipo: 'estable', texto: 'Estable', accesible: 'Estable frente al período anterior' }
  const puntos = Math.round(Math.abs(delta))
  const palabra = delta > 0 ? 'Sube' : 'Baja'
  return { tipo: delta > 0 ? 'sube' : 'baja', texto: `${palabra} ${puntos}`, accesible: `${palabra} ${puntos} ${puntos === 1 ? 'punto' : 'puntos'} frente al período anterior` }
}

export type TonoPorcentaje = 'success' | 'warning' | 'brand' | 'danger'

/** The one percentage scale of docs/design-system/patterns.md (Reports and attendance). */
export function tonoPorcentaje(porcentaje: number): TonoPorcentaje {
  if (porcentaje >= 80) return 'success'
  if (porcentaje >= 60) return 'warning'
  if (porcentaje >= 40) return 'brand'
  return 'danger'
}

export const textoPorcentaje = (porcentaje: number | null): string => (porcentaje === null ? '—' : `${Math.round(porcentaje)}%`)

const plural = (n: number, uno: string, varios: string): string => `${n} ${n === 1 ? uno : varios}`
const unirY = (partes: readonly string[]): string => (partes.length <= 1 ? (partes[0] ?? '') : `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`)
const decimal = (valor: number): string => valor.toLocaleString('es-VE', { maximumFractionDigits: 1 })
const normalizar = (valor: string): string =>
  valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

/** "hace 3 semanas" from `hoy`. */
export function haceCuanto(fecha: string, hoy: string): string {
  const dias = diasEntre(fecha, hoy)
  if (dias <= 0) return 'hoy'
  if (dias === 1) return 'ayer'
  if (dias < 7) return `hace ${dias} días`
  if (dias < 14) return 'hace 1 semana'
  return `hace ${Math.floor(dias / 7)} semanas`
}

// ── The lists ────────────────────────────────────────────────────────

export interface PastillaReporte {
  readonly id: FiltrosReportes['metrica']
  readonly etiqueta: string
  readonly cantidad: number
}

export interface FilaGrupoReporte extends GrupoReporte {
  readonly baja: boolean
  readonly tendencia: Tendencia
}

export interface FilaPersonaReporte extends PersonaReporte {
  /** "Antes en <grupo>" after a move in the range (A32). */
  readonly antesEn: string | null
  /** "Entró el 1 oct" when they joined inside the range. */
  readonly entro: string | null
  readonly lideres: readonly string[]
  readonly baja: boolean
  readonly seguidas: boolean
}

export interface VistaReportes {
  readonly hayReuniones: boolean
  readonly tabs: { readonly grupos: number; readonly personas: number }
  readonly pastillas: readonly PastillaReporte[]
  readonly grupos: readonly FilaGrupoReporte[]
  readonly personas: readonly FilaPersonaReporte[]
  readonly pie: { readonly resumen: string; readonly orden: string }
}

const FILTRO_GRUPO: Readonly<Record<MetricaGruposReporte, (g: FilaGrupoReporte) => boolean>> = {
  baja: (g) => g.baja,
  bajando: (g) => bajando(g.delta),
  sinmarcar: (g) => g.sinMarcar > 0,
}

const FILTRO_PERSONA: Readonly<Record<MetricaPersonasReporte, (p: FilaPersonaReporte) => boolean>> = {
  seguidas: (p) => p.seguidas,
  baja: (p) => p.baja,
  sinmarcar: (p) => p.sinMarcar > 0,
}

const ETIQUETA_GRUPOS: Readonly<Record<MetricaGruposReporte, string>> = {
  baja: 'Asistencia baja (<50%)',
  bajando: 'Bajando',
  sinmarcar: 'Reuniones sin marcar',
}

const ETIQUETA_PERSONAS: Readonly<Record<MetricaPersonasReporte, string>> = {
  seguidas: 'Faltan 3+ seguidas',
  baja: 'Asistencia baja (<50%)',
  sinmarcar: 'Sin marcar',
}

/** Nulls last; lowest first. */
const menorPrimero = (a: number | null, b: number | null): number => (a ?? Number.POSITIVE_INFINITY) - (b ?? Number.POSITIVE_INFINITY)
const porNombre = (a: string, b: string): number => a.localeCompare(b, 'es')

const ORDEN_GRUPOS: Readonly<Record<OrdenGruposReporte, ((a: FilaGrupoReporte, b: FilaGrupoReporte) => number) | null>> = {
  // The RPC already orders by sub-área, año and nombre (A34).
  anio: null,
  nombre: (a, b) => porNombre(a.nombre, b.nombre),
  miembros: (a, b) => b.miembros - a.miembros,
  asistencia: (a, b) => menorPrimero(a.porcentaje, b.porcentaje),
  tendencia: (a, b) => menorPrimero(a.delta, b.delta),
}

const ORDEN_PERSONAS: Readonly<Record<OrdenPersonasReporte, (a: FilaPersonaReporte, b: FilaPersonaReporte) => number>> = {
  nombre: (a, b) => porNombre(a.nombre, b.nombre),
  grupo: (a, b) => porNombre(a.grupo ?? '', b.grupo ?? '') || porNombre(a.nombre, b.nombre),
  asistencia: (a, b) => menorPrimero(a.porcentaje, b.porcentaje),
  seguidas: (a, b) => b.ausenciasSeguidas - a.ausenciasSeguidas,
  // Never came first, then the oldest last visit.
  ultima: (a, b) => (a.ultimaPresente ?? '').localeCompare(b.ultimaPresente ?? ''),
}

const coincide = (q: string, ...valores: readonly (string | null | undefined)[]): boolean => q === '' || valores.some((v) => v && normalizar(v).includes(q))

export function calcularVistaReportes({ reporte, filtros }: { readonly reporte: ReporteAsistencia; readonly filtros: FiltrosReportes }): VistaReportes {
  const q = normalizar(filtros.q)
  const lideresDe = new Map(reporte.grupos.map((g) => [g.grupoId, g.lideres]))
  const filasGrupos: FilaGrupoReporte[] = reporte.grupos.map((g) => ({ ...g, baja: asistenciaBaja(g.porcentaje), tendencia: tendencia(g.delta) }))
  const filasPersonas: FilaPersonaReporte[] = reporte.personas.map((p) => {
    const antesEn = p.gruposEnRango.length > 1 ? ([...p.gruposEnRango].reverse().find((n) => n !== p.grupo) ?? null) : null
    return {
      ...p,
      antesEn,
      entro: !antesEn && p.miembroDesde && p.miembroDesde > reporte.desde ? `Entró el ${fechaDia(p.miembroDesde)}` : null,
      lideres: (p.grupoId && lideresDe.get(p.grupoId)) || [],
      baja: asistenciaBaja(p.porcentaje),
      seguidas: faltanSeguidas(p.ausenciasSeguidas),
    }
  })
  const hayReuniones = reporte.grupos.some((g) => g.reuniones > 0)
  const integrantes = reporte.grupos.reduce((suma, g) => suma + g.miembros, 0)
  const tabs = { grupos: reporte.grupos.length, personas: reporte.personas.length }

  if (filtros.tab === 'grupos') {
    const nombresPorGrupo = new Map<string, string[]>()
    for (const p of reporte.personas) if (p.grupoId) nombresPorGrupo.set(p.grupoId, [...(nombresPorGrupo.get(p.grupoId) ?? []), p.nombre])
    const base = filasGrupos.filter((g) => coincide(q, g.nombre, ...g.lideres, ...(nombresPorGrupo.get(g.grupoId) ?? [])))
    const metrica = hayReuniones && METRICAS_GRUPOS.includes(filtros.metrica as MetricaGruposReporte) ? (filtros.metrica as MetricaGruposReporte) : null
    const visibles = metrica ? base.filter(FILTRO_GRUPO[metrica]) : base
    const orden = ORDEN_GRUPOS[filtros.ordenGrupos]
    return {
      hayReuniones,
      tabs,
      pastillas: hayReuniones ? [{ id: null, etiqueta: 'Todos', cantidad: base.length }, ...METRICAS_GRUPOS.map((id) => ({ id, etiqueta: ETIQUETA_GRUPOS[id], cantidad: base.filter(FILTRO_GRUPO[id]).length }))] : [],
      grupos: orden ? [...visibles].sort(orden) : visibles,
      personas: [],
      pie: {
        resumen: `${visibles.length} de ${plural(filasGrupos.length, 'grupo', 'grupos')} · ${plural(integrantes, 'integrante', 'integrantes')}`,
        orden: ORDENES_GRUPOS.find((o) => o.id === filtros.ordenGrupos)!.pie,
      },
    }
  }

  const base = filasPersonas.filter((p) => coincide(q, p.nombre, p.grupo, ...p.lideres))
  const metrica = hayReuniones && METRICAS_PERSONAS.includes(filtros.metrica as MetricaPersonasReporte) ? (filtros.metrica as MetricaPersonasReporte) : null
  const visibles = metrica ? base.filter(FILTRO_PERSONA[metrica]) : base
  return {
    hayReuniones,
    tabs,
    pastillas: hayReuniones ? [{ id: null, etiqueta: 'Todas', cantidad: base.length }, ...METRICAS_PERSONAS.map((id) => ({ id, etiqueta: ETIQUETA_PERSONAS[id], cantidad: base.filter(FILTRO_PERSONA[id]).length }))] : [],
    grupos: [],
    personas: [...visibles].sort(ORDEN_PERSONAS[filtros.ordenPersonas]),
    pie: {
      resumen: `${visibles.length} de ${plural(filasPersonas.length, 'persona', 'personas')} · el % cuenta desde que cada uno entró`,
      orden: ORDENES_PERSONAS.find((o) => o.id === filtros.ordenPersonas)!.pie,
    },
  }
}

// ── Hero and ámbito cards ────────────────────────────────────────────

export interface ResumenHero {
  /** "Barquisimeto · Transit · Grupos de Chicas · 8 sep – 2 nov". */
  readonly prefijo: string
  /** `null` when the range has no meetings ("sin reuniones en este rango"). */
  readonly cifras: { readonly grupos: number; readonly reuniones: number; readonly porcentaje: string } | null
}

export function resumenReporte({
  campus,
  ambito,
  subarea,
  rango,
  reporte,
}: {
  readonly campus: string
  readonly ambito: string
  readonly subarea: string | null
  readonly rango: Pick<RangoReporte, 'desde' | 'hasta'>
  readonly reporte: ReporteAsistencia
}): ResumenHero {
  const prefijo = [campus, ambito, subarea, fechaRango(rango.desde, rango.hasta)].filter(Boolean).join(' · ')
  const { grupos, reuniones, porcentaje } = reporte.resumen
  return { prefijo, cifras: reuniones > 0 ? { grupos, reuniones, porcentaje: textoPorcentaje(porcentaje) } : null }
}

export interface InsigniaAmbito {
  readonly texto: string
  readonly tono: 'warning' | 'info'
}

export interface TarjetaAmbitoReporte {
  readonly id: string
  readonly nombre: string
  readonly grupos: number
  readonly porcentaje: number | null
  readonly insignias: readonly InsigniaAmbito[]
}

/** An ámbito card (A31): its %, "N grupos bajo 50%" and "N faltan 3+ seguidas". */
export function tarjetaAmbito(ambito: { readonly id: string; readonly nombre: string }, reporte: ReporteAsistencia): TarjetaAmbitoReporte {
  const bajos = reporte.grupos.filter((g) => asistenciaBaja(g.porcentaje)).length
  const seguidas = reporte.personas.filter((p) => faltanSeguidas(p.ausenciasSeguidas)).length
  const insignias: InsigniaAmbito[] = []
  if (bajos) insignias.push({ texto: plural(bajos, 'grupo bajo 50%', 'grupos bajo 50%'), tono: 'warning' })
  if (seguidas) insignias.push({ texto: `${seguidas} ${seguidas === 1 ? 'falta' : 'faltan'} 3+ seguidas`, tono: 'info' })
  return { id: ambito.id, nombre: ambito.nombre, grupos: reporte.resumen.grupos, porcentaje: reporte.resumen.porcentaje, insignias }
}

// ── The «Embudo de conexión» (S18, L48 "Foto de hoy", L49 names) ──────

export type IdEtapa = 'sin_grupo' | 'en_grupo' | 'sirviendo'

export interface PasoEmbudo {
  readonly id: IdEtapa
  readonly nombre: string
  readonly definicion: string
  readonly cantidad: number
  /** 0–100, one decimal; `null` without a denominator. */
  readonly conversion: number | null
  readonly conversionTexto: string
}

const ETAPAS: Readonly<Record<IdEtapa, { readonly nombre: string; readonly definicion: string; readonly largo: (ambito: string) => string }>> = {
  sin_grupo: {
    nombre: 'Sin grupo',
    definicion: 'Conocidos que hoy no están en un grupo',
    largo: (a) => `Conocidos de ${a} sin grupo: visitantes que todavía no son integrantes y fichas sin grupo. No cuenta a quienes egresaron.`,
  },
  en_grupo: { nombre: 'En grupo', definicion: 'Miembros de un grupo activo', largo: (a) => `Integrantes activos de un grupo de ${a}.` },
  sirviendo: {
    nombre: 'Sirviendo',
    definicion: 'En un grupo y sirviendo en el Dream Team',
    largo: (a) => `Integrantes de un grupo de ${a} que además sirven en el Dream Team.`,
  },
}

const proporcion = (parte: number, total: number): number | null => (total > 0 ? Math.round((1000 * parte) / total) / 10 : null)

/** The three steps with the conversions of A29. */
export function pasosEmbudo(embudo: Embudo): PasoEmbudo[] {
  const conocidos = embudo.sinGrupo.cantidad + embudo.enGrupo.cantidad
  const paso = (id: IdEtapa, cantidad: number, conversion: number | null, conversionTexto: string): PasoEmbudo => ({
    id,
    nombre: ETAPAS[id].nombre,
    definicion: ETAPAS[id].definicion,
    cantidad,
    conversion,
    conversionTexto,
  })
  return [
    paso('sin_grupo', embudo.sinGrupo.cantidad, proporcion(embudo.sinGrupo.cantidad, conocidos), 'de los conocidos'),
    paso('en_grupo', embudo.enGrupo.cantidad, proporcion(embudo.enGrupo.cantidad, conocidos), 'de los conocidos'),
    paso('sirviendo', embudo.sirviendo.cantidad, proporcion(embudo.sirviendo.cantidad, embudo.enGrupo.cantidad), 'de los que están en grupo'),
  ]
}

export interface FilaEtapa {
  readonly personaId: string
  readonly nombre: string
  readonly detalle: string
  readonly insignia: 'Visitante' | 'Ficha' | null
  /** En grupo and Sirviendo open the person view; Sin grupo has no attendance yet (A29). */
  readonly navegable: boolean
}

export interface VistaEtapa {
  readonly titulo: string
  readonly cantidad: number
  readonly descripcion: string
  readonly filas: readonly FilaEtapa[]
  readonly vacio: { readonly titulo: string; readonly subtitulo: string }
  readonly nota: string | null
}

const VACIO_ETAPA: Readonly<Record<IdEtapa, VistaEtapa['vacio']>> = {
  sin_grupo: { titulo: 'No hay conocidos sin grupo', subtitulo: 'No hay personas en este paso.' },
  en_grupo: { titulo: 'Nadie está en un grupo', subtitulo: 'No hay personas en este paso.' },
  sirviendo: { titulo: 'Nadie está sirviendo', subtitulo: 'Ningún integrante de un grupo sirve todavía en el Dream Team.' },
}

function detalleSinGrupo(p: PersonaEmbudo): string {
  if (p.tipo === 'visitante') return p.grupo ? `Visita ${p.grupo}` : 'Visitante'
  if (p.tipo === 'antes_en_grupo') return p.grupo ? `Antes en ${p.grupo}` : 'Antes en un grupo'
  return p.anioEtiqueta ? `${p.anioEtiqueta} · sin grupo` : 'Ficha sin grupo'
}

/** The drawer of one step; `ambito` is the scope line ("Transit · Grupos de Chicas"). */
export function vistaEtapa(embudo: Embudo, id: IdEtapa, ambito: string): VistaEtapa {
  const etapa = id === 'sin_grupo' ? embudo.sinGrupo : id === 'en_grupo' ? embudo.enGrupo : embudo.sirviendo
  const filas: FilaEtapa[] = etapa.personas.map((p) => {
    if (id === 'sin_grupo') {
      return { personaId: p.personaId, nombre: p.nombre, detalle: detalleSinGrupo(p), insignia: p.tipo === 'visitante' ? 'Visitante' : p.tipo === 'ficha' ? 'Ficha' : null, navegable: false }
    }
    const grupo = p.grupo ?? 'Sin grupo'
    const detalle = id === 'sirviendo' ? `Sirve en ${p.servicio ?? 'el Dream Team'} · ${grupo}` : p.servicio ? `${grupo} · sirve en ${p.servicio}` : grupo
    return { personaId: p.personaId, nombre: p.nombre, detalle, insignia: null, navegable: true }
  })
  return {
    titulo: ETAPAS[id].nombre,
    cantidad: etapa.cantidad,
    descripcion: ETAPAS[id].largo(ambito),
    filas,
    vacio: VACIO_ETAPA[id],
    nota: id === 'sin_grupo' && filas.length ? 'Un visitante pasa a «En grupo» cuando su líder lo confirma como integrante; una ficha sin grupo, cuando la agregan a un grupo.' : null,
  }
}

// ── The detail drawers ───────────────────────────────────────────────

export interface DatoDetalle {
  readonly etiqueta: string
  readonly valor: string
}

export interface VistaDetalleGrupo {
  readonly titulo: string
  readonly meta: string
  readonly sinMarcar: { readonly titulo: string; readonly texto: string } | null
  readonly datos: readonly DatoDetalle[]
  readonly tendencia: string
  readonly reuniones: readonly { readonly clave: string; readonly fecha: string; readonly detalle: string; readonly porcentaje: string | null; readonly sinMarcar: boolean }[]
  readonly integrantes: readonly { readonly personaId: string; readonly nombre: string; readonly detalle: string; readonly seguidas: number }[]
  readonly rango: string
}

function cuandoSeReune(diaSemana: number | null, hora: string | null): string | null {
  if (diaSemana === null || diaSemana < 0 || diaSemana > 6) return null
  const h = horaCorta(hora)
  return `cada ${DIAS[diaSemana]}${h ? `, ${h}` : ''}`
}

export function vistaDetalleGrupo(detalle: DetalleGrupoReporte): VistaDetalleGrupo {
  const { grupo, resumen } = detalle
  const lideres = grupo.lideres.length ? unirY(grupo.lideres) : 'Sin líder'
  const meta = [grupo.ambito, grupo.subarea, lideres, cuandoSeReune(grupo.diaSemana, grupo.hora)].filter(Boolean).join(' · ')
  const largo = diasEntre(detalle.desde, detalle.hasta) + 1
  const previo = fechaRango(sumarDias(detalle.desde, -largo), sumarDias(detalle.desde, -1))
  const t = tendencia(resumen.delta)
  const frase =
    t.tipo === 'sin_datos'
      ? 'No hay reuniones del período anterior para comparar.'
      : `${t.tipo === 'estable' ? 'Estable' : t.accesible.replace(' frente al período anterior', '')} frente al período anterior (${previo}: ${textoPorcentaje(resumen.porcentajePrevio)}).`
  const miembros = detalle.integrantes.length
  return {
    titulo: grupo.nombre,
    meta,
    sinMarcar: resumen.sinMarcar
      ? {
          titulo: plural(resumen.sinMarcar, 'reunión sin marcar', 'reuniones sin marcar'),
          texto: `${resumen.sinMarcarFechas.map(fechaLarga).join(', ')}: nadie marcó la lista. No cuenta en el promedio.`,
        }
      : null,
    datos: [
      { etiqueta: 'Reuniones', valor: String(resumen.reuniones) },
      { etiqueta: 'Promedio de presentes', valor: resumen.promedioPresentes === null ? '—' : `${decimal(resumen.promedioPresentes)} de ${miembros}` },
      { etiqueta: 'Asistencia', valor: textoPorcentaje(resumen.porcentaje) },
      { etiqueta: 'Visitantes nuevos', valor: String(resumen.visitantes) },
    ],
    tendencia: frase,
    reuniones: detalle.reuniones.map((r) => {
      if (r.sinMarcar) return { clave: `${r.fecha}|${r.reunionId ?? ''}`, fecha: fechaLarga(r.fecha), detalle: 'Nadie marcó la lista', porcentaje: null, sinMarcar: true }
      const partes = [plural(r.presentes, 'presente', 'presentes'), plural(r.ausentes, 'ausente', 'ausentes')]
      if (r.visitantes) partes.push(plural(r.visitantes, 'visitante', 'visitantes'))
      if (r.lugar) partes.push(r.lugar)
      return { clave: `${r.fecha}|${r.reunionId ?? ''}`, fecha: fechaLarga(r.fecha), detalle: partes.join(' · '), porcentaje: textoPorcentaje(r.porcentaje), sinMarcar: false }
    }),
    integrantes: detalle.integrantes.map((p) => {
      const partes = [textoPorcentaje(p.porcentaje), `${p.presentes} de ${p.reuniones}`]
      if (faltanSeguidas(p.ausenciasSeguidas)) partes.push(`faltó ${p.ausenciasSeguidas} seguidas`)
      return { personaId: p.personaId, nombre: p.nombre, detalle: partes.join(' · '), seguidas: p.ausenciasSeguidas }
    }),
    rango: `del ${fechaDia(detalle.desde)} al ${fechaDia(detalle.hasta)}`,
  }
}

export type TonoReunion = 'success' | 'danger' | 'muted'

const ESTADO_REUNION: Readonly<Record<EstadoReunionPersona, { readonly tono: TonoReunion; readonly etiqueta: string }>> = {
  presente: { tono: 'success', etiqueta: 'Presente' },
  ausente: { tono: 'danger', etiqueta: 'Ausente' },
  sin_marcar: { tono: 'muted', etiqueta: 'Sin marcar' },
  nadie_marco: { tono: 'muted', etiqueta: 'Nadie marcó' },
}

export interface VistaDetallePersona {
  readonly titulo: string
  readonly meta: string
  readonly grupoActual: { readonly grupoId: string; readonly nombre: string } | null
  readonly alerta: { readonly titulo: string; readonly texto: string } | null
  readonly datos: readonly DatoDetalle[]
  readonly nota: string
  readonly reuniones: readonly { readonly clave: string; readonly fecha: string; readonly detalle: string; readonly estado: { readonly tono: TonoReunion; readonly etiqueta: string } }[]
}

export interface ContextoPersona {
  /** The ámbito of the report. */
  readonly ambito: string
  /** Leaders of their current group, from the report. */
  readonly lideres: readonly string[]
  /** Their Dream Team service, from the funnel. */
  readonly servicio: string | null
}

export function vistaDetallePersona(detalle: DetallePersonaReporte, contexto: ContextoPersona): VistaDetallePersona {
  const { persona, resumen } = detalle
  const membresias = [...detalle.membresias].sort((a, b) => (a.desde ?? '').localeCompare(b.desde ?? ''))
  const actual = [...membresias].reverse().find((m) => m.activo) ?? null
  const primera = membresias[0] ?? null
  const varios = new Set(detalle.reuniones.map((r) => r.grupoId)).size > 1

  let alerta: VistaDetallePersona['alerta'] = null
  if (faltanSeguidas(resumen.ausenciasSeguidas)) {
    const ultima = resumen.ultimaPresente ? `Vino por última vez el ${fechaLarga(resumen.ultimaPresente).toLocaleLowerCase('es')}.` : 'No ha venido desde que entró.'
    const lideres = contexto.lideres.length ? ` ${contexto.lideres.length > 1 ? 'Sus líderes' : 'Su líder'}: ${unirY(contexto.lideres)}.` : ''
    alerta = { titulo: `Faltó las últimas ${resumen.ausenciasSeguidas} reuniones`, texto: `${ultima}${lideres}` }
  }

  const nota: string[] = []
  const anterior = actual ? [...membresias].reverse().find((m) => m !== actual && (m.desde ?? '') <= (actual.desde ?? '')) : undefined
  if (actual && anterior && actual.desde && actual.desde >= detalle.desde && actual.desde <= detalle.hasta) {
    nota.push(`Pasó de ${anterior.grupo} a ${actual.grupo} el ${fechaDia(actual.desde)}.`)
  }
  if (primera?.desde && primera.desde > detalle.desde) nota.push(`Cuenta desde que entró, el ${fechaDia(primera.desde)}.`)
  else if (varios) nota.push(`Cuenta todas sus reuniones del ${fechaDia(detalle.desde)} al ${fechaDia(detalle.hasta)}, en los dos grupos.`)
  else {
    const grupo = detalle.reuniones[0]?.grupo ?? actual?.grupo
    if (grupo) nota.push(`Cuenta las reuniones de ${grupo} del ${fechaDia(detalle.desde)} al ${fechaDia(detalle.hasta)}.`)
  }
  if (resumen.sinMarcar) {
    nota.push(resumen.sinMarcar === 1 ? 'La reunión sin marcar no cuenta en el porcentaje.' : `Las ${resumen.sinMarcar} reuniones sin marcar no cuentan en el porcentaje.`)
  }
  if (contexto.servicio) nota.push(`Sirve en el Dream Team: ${contexto.servicio}.`)

  return {
    titulo: persona.nombre,
    meta: [actual?.grupo ?? persona.anioEtiqueta, contexto.ambito].filter(Boolean).join(' · '),
    grupoActual: actual ? { grupoId: actual.grupoId, nombre: actual.grupo } : null,
    alerta,
    datos: [
      { etiqueta: 'Asistencia', valor: textoPorcentaje(resumen.porcentaje) },
      { etiqueta: 'Presentes', valor: `${resumen.presentes} de ${resumen.reuniones}` },
      { etiqueta: 'Faltas seguidas', valor: String(resumen.ausenciasSeguidas) },
      { etiqueta: 'Última vez', valor: resumen.ultimaPresente ? fechaDia(resumen.ultimaPresente) : '—' },
    ],
    nota: nota.join(' '),
    reuniones: detalle.reuniones.map((r) => ({
      clave: `${r.fecha}|${r.grupoId}|${r.reunionId ?? ''}`,
      fecha: fechaLarga(r.fecha),
      // L48: the group of each meeting when the range spans more than one.
      detalle: varios ? [r.grupo, r.turno].filter(Boolean).join(' · ') : (r.turno ?? 'Reunión del grupo'),
      estado: ESTADO_REUNION[r.estado],
    })),
  }
}
