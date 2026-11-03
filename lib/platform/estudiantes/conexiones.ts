/**
 * Estudiantes — the 4 connections of The Living Room, first delivery (C7c of
 * odd/tasks/estudiantes-fase-b.md, S21 with L54 / L55; artboards 13 desktop
 * and 14 phone of design/estudiantes-asistencia, A35–A47).
 *
 * - Reads estudiantes_reporte_conexiones
 *   (supabase/migrations/20261102170500_estudiantes_reporte_conexiones.sql)
 *   defensively: a missing block is "nothing recorded", never an error.
 * - The figures of a Personas row (A37): 1:1 realizados in the range, the
 *   "desconectado" flag of L55 (no 1:1 with their TLR leader in the 2 months
 *   up to the end of the range, or never), the service (every active
 *   servicio added up; a justificado is not a presente, O6) and the talleres
 *   completados of all time (O7).
 * - The four cards of the person drawer, in the plan's order (S6): Con su
 *   líder, Con otros, Con la Iglesia, Con Jesús. What is not recorded yet
 *   (1:1 topics, private disciplines, retiros, CGL, Irresistibles) has fixed
 *   copy, never a number or a warning (A45, A46).
 * Words (L49): never "Foyer", "Living Room" as a step or "Kitchen".
 */
import type { Json } from '@/lib/supabase/database.types'

import type { Objeto } from './grupos-datos'
import { fechaDia, fechaRango, haceCuanto, textoPorcentaje } from './reportes'

// ── Reading the RPC ──────────────────────────────────────────────────

const esObjeto = (valor: unknown): valor is Objeto => typeof valor === 'object' && valor !== null && !Array.isArray(valor)
const bloque = (valor: Json | undefined): Objeto => (esObjeto(valor) ? valor : {})
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

/** «Con su líder»: the 1:1 realizados with the leader of their TLR group at that date (L55). */
export interface ConexionLider {
  readonly realizados: number
  readonly porSemana: number
  /** The last one up to the end of the range, even before it. */
  readonly ultimo: string | null
  readonly ultimoCon: string | null
  /** Current leaders of their current group. */
  readonly lideres: readonly string[]
  readonly desconectado: boolean
}

export interface ServicioConexion {
  readonly servicioId: string
  readonly equipo: string | null
  readonly area: string | null
  readonly rol: string | null
  readonly esperadas: number
  readonly presentes: number
  readonly justificados: number
  readonly ausentes: number
  readonly porcentaje: number | null
}

/** «Con otros»: their TLR group (the S17 figure) and each active Dream Team servicio. */
export interface ConexionOtros {
  readonly grupo: { readonly reuniones: number; readonly presentes: number; readonly ausentes: number; readonly sinMarcar: number; readonly porcentaje: number | null }
  readonly sirve: boolean
  readonly servicios: readonly ServicioConexion[]
}

export interface TallerCompletado {
  readonly taller: string
  readonly fecha: string | null
  readonly anio: number | null
}

export interface ConexionesPersona {
  readonly personaId: string
  readonly nombre: string
  readonly grupoId: string | null
  readonly grupo: string | null
  readonly lider: ConexionLider
  readonly otros: ConexionOtros
  readonly iglesia: { readonly talleres: number; readonly lista: readonly TallerCompletado[] }
  readonly jesus: { readonly registrado: boolean }
}

export interface ReporteConexiones {
  readonly desde: string
  readonly hasta: string
  readonly semanas: number | null
  /** A 1:1 before this date no longer keeps someone connected (L55). */
  readonly desconectadoSiAntesDe: string | null
  readonly resumen: { readonly personas: number; readonly desconectados: number; readonly sinServicio: number; readonly conTalleres: number }
  readonly personas: readonly ConexionesPersona[]
}

function aServicio(o: Objeto): ServicioConexion | null {
  const servicioId = texto(o, 'servicio_id')
  if (!servicioId) return null
  return {
    servicioId,
    equipo: texto(o, 'equipo'),
    area: texto(o, 'area'),
    rol: texto(o, 'rol'),
    esperadas: entero(o, 'esperadas'),
    presentes: entero(o, 'presentes'),
    justificados: entero(o, 'justificados'),
    ausentes: entero(o, 'ausentes'),
    porcentaje: numero(o, 'porcentaje'),
  }
}

function aPersona(o: Objeto): ConexionesPersona | null {
  const personaId = texto(o, 'persona_id')
  if (!personaId) return null
  const lider = bloque(o.lider)
  const otros = bloque(o.otros)
  const grupo = bloque(otros.grupo)
  const iglesia = bloque(o.iglesia)
  const servicios = objetos(otros.servicios)
    .map(aServicio)
    .filter((s): s is ServicioConexion => s !== null)
  return {
    personaId,
    nombre: [texto(o, 'nombre'), texto(o, 'apellido')].filter(Boolean).join(' ') || 'Sin nombre',
    grupoId: texto(o, 'grupo_id'),
    grupo: texto(o, 'grupo'),
    lider: {
      realizados: entero(lider, 'realizados'),
      porSemana: entero(lider, 'por_semana'),
      ultimo: texto(lider, 'ultimo'),
      ultimoCon: texto(lider, 'ultimo_con'),
      lideres: textos(lider.lideres),
      // Nothing known about their 1:1 reads as "never" (L55).
      desconectado: lider.desconectado !== false,
    },
    otros: {
      grupo: {
        reuniones: entero(grupo, 'reuniones'),
        presentes: entero(grupo, 'presentes'),
        ausentes: entero(grupo, 'ausentes'),
        sinMarcar: entero(grupo, 'sin_marcar'),
        porcentaje: numero(grupo, 'porcentaje'),
      },
      sirve: otros.sirve === true && servicios.length > 0,
      servicios,
    },
    iglesia: {
      talleres: entero(iglesia, 'talleres'),
      lista: objetos(iglesia.lista).map((t) => ({ taller: texto(t, 'taller') ?? 'Taller', fecha: texto(t, 'fecha'), anio: numero(t, 'anio') })),
    },
    jesus: { registrado: bloque(o.jesus).registrado === true },
  }
}

/** estudiantes_reporte_conexiones; `null` when it is not a connections report. */
export function leerReporteConexiones(data: unknown): ReporteConexiones | null {
  if (!esObjeto(data)) return null
  const desde = texto(data, 'desde')
  const hasta = texto(data, 'hasta')
  if (!desde || !hasta || !Array.isArray(data.personas)) return null
  const r = bloque(data.resumen)
  return {
    desde,
    hasta,
    semanas: numero(data, 'semanas'),
    desconectadoSiAntesDe: texto(data, 'desconectado_si_antes_de'),
    resumen: { personas: entero(r, 'personas'), desconectados: entero(r, 'desconectados'), sinServicio: entero(r, 'sin_servicio'), conTalleres: entero(r, 'con_talleres') },
    personas: objetos(data.personas)
      .map(aPersona)
      .filter((p): p is ConexionesPersona => p !== null),
  }
}

/** The one person of a p_persona_id answer; `null` when they are not in it. */
export function leerConexionesPersona(data: unknown, personaId: string): ConexionesPersona | null {
  return leerReporteConexiones(data)?.personas.find((p) => p.personaId === personaId) ?? null
}

// ── The Personas row (A37–A40) ───────────────────────────────────────

export interface ResumenConexion {
  /** 1:1 realizados in the range. */
  readonly unos: number
  /** No 1:1 with their TLR leader in the 2 months up to the end of the range (L55). */
  readonly desconectado: boolean
  /** Every active servicio added up; `null` when they do not serve. */
  readonly servicio: { readonly porcentaje: number | null; readonly presentes: number; readonly esperadas: number } | null
  /** Completed, all time. */
  readonly talleres: number
}

const unDecimal = (valor: number): number => Math.round(valor * 10) / 10

export function resumenConexion(p: ConexionesPersona): ResumenConexion {
  const presentes = p.otros.servicios.reduce((suma, s) => suma + s.presentes, 0)
  const esperadas = p.otros.servicios.reduce((suma, s) => suma + s.esperadas, 0)
  return {
    unos: p.lider.realizados,
    desconectado: p.lider.desconectado,
    servicio: p.otros.sirve ? { porcentaje: esperadas > 0 ? unDecimal((100 * presentes) / esperadas) : null, presentes, esperadas } : null,
    talleres: p.iglesia.talleres,
  }
}

/** The row figures of every person, by persona id. */
export function resumenesConexiones(reporte: ReporteConexiones): ReadonlyMap<string, ResumenConexion> {
  return new Map(reporte.personas.map((p) => [p.personaId, resumenConexion(p)]))
}

// ── The four cards of the drawer (A42–A47) ───────────────────────────

/** GC2: data that does not exist yet, told apart from a real zero. */
export interface SinRegistro {
  readonly titulo: string
  readonly texto: string
}

export interface FilaConexion {
  readonly clave: string
  readonly titulo: string
  readonly subtitulo: string
  readonly valor: string
  readonly detalle: string | null
  /** The GR4 bar; `null` hides it. */
  readonly porcentaje: number | null
}

export interface VistaConexiones {
  /** "8 sep – 2 nov · talleres en total". */
  readonly hint: string
  readonly lider: {
    readonly titulo: string
    readonly cantidad: number
    readonly etiqueta: string
    readonly alerta: string | null
    readonly datos: readonly { readonly etiqueta: string; readonly valor: string }[]
    readonly nota: string
  }
  readonly otros: { readonly titulo: string; readonly filas: readonly FilaConexion[] }
  readonly iglesia: {
    readonly titulo: string
    readonly cantidad: number
    readonly etiqueta: string
    readonly talleres: readonly { readonly clave: string; readonly taller: string; readonly anio: string }[]
    readonly vacio: string | null
    readonly sinRegistro: SinRegistro
  }
  readonly jesus: { readonly titulo: string; readonly sinRegistro: SinRegistro }
}

const plural = (n: number, uno: string, varios: string): string => `${n} ${n === 1 ? uno : varios}`
const decimal = (valor: number): string => valor.toLocaleString('es-VE', { maximumFractionDigits: 1 })

export const ALERTA_SIN_UNO_A_UNO = 'Sin 1:1 en 2 meses'

function filaServicio(s: ServicioConexion): FilaConexion {
  const subtitulo = [s.area, s.equipo].filter(Boolean).join(' · ') || 'Dream Team'
  if (s.esperadas === 0) return { clave: s.servicioId, titulo: 'Su servicio', subtitulo, valor: '—', detalle: 'sin fechas en el rango', porcentaje: null }
  const justificadas = s.justificados ? ` · ${s.justificados} ${s.justificados === 1 ? 'justificada' : 'justificadas'}` : ''
  return {
    clave: s.servicioId,
    titulo: 'Su servicio',
    subtitulo,
    valor: textoPorcentaje(s.porcentaje),
    detalle: `${s.presentes} de ${plural(s.esperadas, 'fecha', 'fechas')}${justificadas}`,
    porcentaje: s.porcentaje,
  }
}

export function vistaConexiones(p: ConexionesPersona, rango: { readonly desde: string; readonly hasta: string; readonly hoy: string }): VistaConexiones {
  const { lider, otros, iglesia } = p
  const ultimo = lider.ultimo ? `${fechaDia(lider.ultimo)} · ${lider.ultimo < rango.desde ? 'antes del rango' : haceCuanto(lider.ultimo, rango.hoy)}` : 'Nunca'
  const grupo = otros.grupo
  const filaGrupo: FilaConexion =
    grupo.porcentaje === null
      ? { clave: 'grupo', titulo: 'Su grupo', subtitulo: p.grupo ?? 'Sin grupo', valor: '—', detalle: 'sin reuniones en el rango', porcentaje: null }
      : { clave: 'grupo', titulo: 'Su grupo', subtitulo: p.grupo ?? 'Sin grupo', valor: textoPorcentaje(grupo.porcentaje), detalle: `${grupo.presentes} de ${plural(grupo.reuniones, 'reunión', 'reuniones')}`, porcentaje: grupo.porcentaje }
  const servicios: FilaConexion[] = otros.sirve
    ? otros.servicios.map(filaServicio)
    : [{ clave: 'sin-servicio', titulo: 'Su servicio', subtitulo: 'No sirve todavía en el Dream Team', valor: '—', detalle: null, porcentaje: null }]

  return {
    hint: `${fechaRango(rango.desde, rango.hasta)} · talleres en total`,
    lider: {
      titulo: 'Con su líder',
      cantidad: lider.realizados,
      etiqueta: lider.realizados === 1 ? '1:1 realizado en el rango' : '1:1 realizados en el rango',
      alerta: lider.desconectado ? ALERTA_SIN_UNO_A_UNO : null,
      datos: [
        { etiqueta: 'Por semana', valor: decimal(lider.porSemana) },
        { etiqueta: 'El último', valor: ultimo },
        // Who did the last one; the group's first leader when there is none (A43).
        { etiqueta: 'Su líder', valor: lider.ultimoCon ?? lider.lideres[0] ?? 'Sin líder' },
      ],
      nota: 'Los temas del 1:1 todavía no se registran.',
    },
    otros: { titulo: 'Con otros', filas: [filaGrupo, ...servicios] },
    iglesia: {
      titulo: 'Con la Iglesia',
      cantidad: iglesia.talleres,
      etiqueta: iglesia.talleres === 1 ? 'taller completado · en total' : 'talleres completados · en total',
      // The RPC lists them oldest first.
      talleres: iglesia.lista.map((t, i) => ({ clave: `${i}|${t.taller}`, taller: t.taller, anio: t.anio === null ? '' : String(t.anio) })),
      vacio: iglesia.lista.length ? null : 'Todavía no completó un taller.',
      sinRegistro: { titulo: 'Retiros, CGL e Irresistibles', texto: 'Aún no se registran.' },
    },
    jesus: {
      titulo: 'Con Jesús',
      sinRegistro: { titulo: 'Aún no se registra', texto: 'Las disciplinas privadas que su líder conversa en el 1:1 todavía no se guardan en la app.' },
    },
  }
}
