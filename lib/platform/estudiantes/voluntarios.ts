/**
 * Estudiantes — the pure view model of /estudiantes/voluntarios, the volunteer
 * attendance of Transit, Inside Out and The Living Room (C5 of
 * odd/tasks/estudiantes-fase-b.md; RPCs of
 * supabase/migrations/20261101130000_estudiantes_voluntarios_asistencia.sql).
 *
 * - The services come from estudiantes_voluntarios_turnos: weekly turnos
 *   (Transit, Inside Out) happen on their weekday; a dated turno (The Living
 *   Room) only on its planned dates, which the RPC lists up to today.
 * - Which service and date open (`?turno&fecha`): the first service on its
 *   last date by default; a weekly date must be past and on its weekday, a
 *   dated one must be planned.
 * - The roster has the shape of the Niños one ('areas' are the ámbitos), so
 *   its row rules are shared from lib/platform/ninos/voluntarios.ts. Here: the
 *   ámbito, the equipo cards, the metrics that filter (Sin marcar, Presentes,
 *   Avisó, Faltó over the expected volunteers) and the search.
 *
 * The server decides who may mark whom, who was expected and the marking
 * window (today or up to 14 days back).
 */
import {
  agruparPorEquipo,
  contarPlanilla,
  filtrarPorEquipo,
  filtrarPorNombre,
  resumirEquipos,
  separarPlanilla,
  TODOS_LOS_EQUIPOS,
  ultimaFechaDeServicio,
  type AreaVoluntarios,
  type Contadores,
  type FilaVoluntario,
  type Planilla,
  type ResumenEquipo,
} from '@/lib/platform/ninos/voluntarios'

import { fechaLarga } from './lista-vista'

export type TipoTurno = 'semanal' | 'fechas'

/** A row of estudiantes_voluntarios_turnos. */
export interface TurnoVoluntariosEstudiantes {
  readonly id: string
  readonly nombre: string
  readonly hora: string
  readonly orden: number
  readonly diaSemana: number
  readonly campusId: string
  readonly campus: string
  readonly tipo: TipoTurno
  /** Planned dates up to today, newest first (dated turnos only). */
  readonly fechas: readonly string[]
}

/** The service on screen; `fecha` is null for a dated turno without planned dates yet. */
export interface ServicioVoluntarios {
  readonly turnoId: string | null
  readonly fecha: string | null
}

export interface OpcionFecha {
  readonly valor: string
  readonly etiqueta: string
}

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/
/** Dates a weekly service offers in the picker. */
const FECHAS_SEMANALES = 8

function esFecha(valor: unknown): valor is string {
  if (typeof valor !== 'string' || !FECHA_RE.test(valor)) return false
  const d = new Date(`${valor}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === valor
}

function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

const diaDeSemana = (fecha: string): number => new Date(`${fecha}T00:00:00Z`).getUTCDay()

const texto = (v: unknown): string => (typeof v === 'string' ? v : '')

/** Reads estudiantes_voluntarios_turnos; with several campuses the campus prefixes each name. */
export function leerTurnosVoluntariosEstudiantes(data: unknown): TurnoVoluntariosEstudiantes[] {
  const filas = (Array.isArray(data) ? data : [])
    .filter((t): t is Record<string, unknown> => Boolean(t) && typeof t === 'object')
    .map((t) => ({
      id: texto(t.id),
      nombre: texto(t.nombre),
      hora: texto(t.hora),
      orden: Number(t.orden) || 0,
      diaSemana: Number(t.dia_semana) || 0,
      campusId: texto(t.campus_id),
      campus: texto(t.campus),
      tipo: (t.tipo === 'fechas' ? 'fechas' : 'semanal') as TipoTurno,
      fechas: Array.isArray(t.fechas) ? t.fechas.filter(esFecha) : [],
    }))
  if (new Set(filas.map((t) => t.campusId)).size < 2) return filas
  return filas.map((t) => ({ ...t, nombre: `${t.campus} · ${t.nombre}` }))
}

/** The service from the query: the first one by default, on its last date. */
export function resolverServicioVoluntariosEstudiantes(
  query: { readonly turno?: string; readonly fecha?: string },
  turnos: readonly TurnoVoluntariosEstudiantes[],
  hoy: string,
): ServicioVoluntarios {
  const turno = turnos.find((t) => t.id === query.turno) ?? turnos[0]
  if (!turno) return { turnoId: null, fecha: null }
  if (turno.tipo === 'fechas') {
    const fecha = query.fecha && turno.fechas.includes(query.fecha) ? query.fecha : (turno.fechas[0] ?? null)
    return { turnoId: turno.id, fecha }
  }
  const valida = esFecha(query.fecha) && query.fecha <= hoy && diaDeSemana(query.fecha) === turno.diaSemana
  return { turnoId: turno.id, fecha: valida ? (query.fecha as string) : ultimaFechaDeServicio(hoy, turno.diaSemana) }
}

/** The dates of the picker, newest first: a dated service's planned dates, a weekly one's last eight days. */
export function opcionesFechaVoluntarios(
  turno: TurnoVoluntariosEstudiantes | undefined,
  fecha: string | null,
  hoy: string,
): OpcionFecha[] {
  if (!turno) return []
  let fechas: string[]
  if (turno.tipo === 'fechas') {
    fechas = [...turno.fechas]
  } else {
    const ultima = ultimaFechaDeServicio(hoy, turno.diaSemana)
    fechas = Array.from({ length: FECHAS_SEMANALES }, (_, i) => sumarDias(ultima, -7 * i))
  }
  if (fecha && !fechas.includes(fecha)) fechas.push(fecha)
  return fechas.map((valor) => ({ valor, etiqueta: fechaLarga(valor) }))
}

export function urlVoluntariosEstudiantes(servicio: ServicioVoluntarios, ambitoId: string | null): string {
  const q = new URLSearchParams()
  if (servicio.turnoId) q.set('turno', servicio.turnoId)
  if (servicio.fecha) q.set('fecha', servicio.fecha)
  if (ambitoId) q.set('ambito', ambitoId)
  return `/estudiantes/voluntarios?${q.toString()}`
}

// ── the roster view ──────────────────────────────────────────────────

export type MetricaVoluntarios = 'sin-marcar' | 'presentes' | 'avisos' | 'faltas'

export interface FiltrosVoluntarios {
  /** The ámbito; null = the first one. */
  readonly ambito: string | null
  /** An equipo id or `TODOS_LOS_EQUIPOS`. */
  readonly equipo: string
  readonly metrica: MetricaVoluntarios | null
  readonly q: string
}

export const FILTROS_VOLUNTARIOS_INICIALES: FiltrosVoluntarios = { ambito: null, equipo: TODOS_LOS_EQUIPOS, metrica: null, q: '' }

export interface MetricaVistaVoluntarios {
  readonly id: MetricaVoluntarios
  readonly etiqueta: string
  readonly valor: number
  /** The expected volunteers of the ámbito. */
  readonly total: number
  readonly pista: string
  readonly tono: 'success' | 'warning' | 'info' | 'danger'
  readonly activa: boolean
}

/** The expected volunteers of one equipo on screen, with the equipo's totals. */
export interface GrupoVistaVoluntarios {
  readonly equipoId: string
  readonly equipo: string
  readonly filas: readonly FilaVoluntario[]
  /** Expected volunteers of the equipo already marked, and all of them (filters aside). */
  readonly marcados: number
  readonly total: number
  /** Expected and unmarked servicio ids of the equipo: what "Marcar el resto como Faltó" sends. */
  readonly pendientes: readonly string[]
}

export interface VistaVoluntarios {
  readonly ambitos: readonly AreaVoluntarios[]
  readonly ambitoId: string | null
  readonly contadores: Contadores
  readonly equipos: readonly ResumenEquipo[]
  readonly equipoId: string
  /** Every volunteer of the ámbito. */
  readonly totalAmbito: number
  readonly metricas: readonly MetricaVistaVoluntarios[]
  readonly esperados: readonly GrupoVistaVoluntarios[]
  /** Assigned to another turno or not due that day. */
  readonly otros: readonly FilaVoluntario[]
  /** No turno assigned at all. */
  readonly sinTurno: readonly FilaVoluntario[]
  /** Rows on screen after the filters. */
  readonly visibles: number
}

const palabra = (n: number, uno: string, varios: string): string => (n === 1 ? uno : varios)

export function coincideMetrica(fila: FilaVoluntario, metrica: MetricaVoluntarios | null): boolean {
  switch (metrica) {
    case null:
      return true
    case 'sin-marcar':
      return fila.esperado && fila.estado === null
    case 'presentes':
      return fila.estado === 'presente'
    case 'avisos':
      return fila.estado === 'justificado'
    case 'faltas':
      return fila.estado === 'ausente'
  }
}

export function calcularVistaVoluntarios(planilla: Planilla, filtros: FiltrosVoluntarios): VistaVoluntarios {
  const ambitos = planilla.areas
  const ambitoId = ambitos.some((a) => a.id === filtros.ambito) ? filtros.ambito : (ambitos[0]?.id ?? null)
  const filasAmbito = planilla.voluntarios.filter((f) => f.area_id === ambitoId)
  const contadores = contarPlanilla(filasAmbito)
  const equipos = resumirEquipos(filasAmbito)
  const equipoId = equipos.some((e) => e.equipoId === filtros.equipo) ? filtros.equipo : TODOS_LOS_EQUIPOS
  const filasEquipo = filtrarPorEquipo(filasAmbito, equipoId)
  const filtradas = filtrarPorNombre(filasEquipo, filtros.q).filter((f) => coincideMetrica(f, filtros.metrica))
  const { esperados, otros, sinTurno } = separarPlanilla(filtradas)

  const de = `de ${contadores.esperados} ${palabra(contadores.esperados, 'esperado', 'esperados')}`
  const metrica = (id: MetricaVoluntarios, etiqueta: string, valor: number, tono: MetricaVistaVoluntarios['tono'], pista = de) => ({
    id,
    etiqueta,
    valor,
    total: contadores.esperados,
    pista,
    tono,
    activa: filtros.metrica === id,
  })

  return {
    ambitos,
    ambitoId,
    contadores,
    equipos,
    equipoId,
    totalAmbito: filasAmbito.length,
    metricas: [
      metrica('sin-marcar', 'Sin marcar', contadores.sinMarcar, 'warning'),
      metrica('presentes', 'Presentes', contadores.presentes, 'success', contadores.extras > 0 ? `${contadores.extras} sin turno ese día` : de),
      metrica('avisos', 'Avisó', contadores.avisos, 'info'),
      metrica('faltas', 'Faltó', contadores.faltas, 'danger'),
    ],
    esperados: agruparPorEquipo(esperados).map((g) => {
      const delEquipo = filasAmbito.filter((f) => f.equipo_id === g.equipoId && f.esperado)
      return {
        equipoId: g.equipoId,
        equipo: g.equipo,
        filas: g.filas,
        marcados: delEquipo.filter((f) => f.estado !== null).length,
        total: delEquipo.length,
        pendientes: delEquipo.filter((f) => f.estado === null).map((f) => f.servicio_id),
      }
    }),
    otros: agruparPorEquipo(otros).flatMap((g) => g.filas),
    sinTurno: agruparPorEquipo(sinTurno).flatMap((g) => g.filas),
    visibles: filtradas.length,
  }
}
