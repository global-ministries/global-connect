import {
  TIPOS_ASISTENCIA,
  totalesDeMarcas,
  type AsistenciaPersona,
  type GrupoAsistencia,
  type TipoAsistencia,
} from './asistencia-persona'
import { fechaCorta } from './fechas'

/**
 * Pure view model of the ficha's Asistencia tab (S13 of
 * odd/tasks/sistema-diseno-v2.md; prototype
 * docs/design-system/prototipos/usuarios/03-ficha-escritorio.html). No I/O.
 *
 * It is the PERSON's own attendance: a leader's line is their own presence,
 * and the group's attendance lives on the group page ("Ver asistencia del
 * grupo →"). Presente is yes/no: per group and week the person attended or
 * not (present at any of that group's meetings), so a week mixes only when
 * two or more groups met and the person attended some of them.
 */

export const ETIQUETA_TIPO: Readonly<Record<TipoAsistencia, string>> = {
  gdv: 'Grupos de Vida',
  estudiantes: 'Estudiantes',
  talleres: 'Talleres',
}

export type TonoEstado = 'success' | 'info' | 'muted'

export interface Semana {
  /** ISO date, inclusive. */
  readonly inicio: string
  /** ISO date, inclusive. */
  readonly fin: string
}

/** One point per week: 0–100, or null when the person had no meeting. */
export type Serie = readonly (number | null)[]

/** A week of the curve: how many of the selected groups met, and in how many the person was present. */
export interface SemanaAsistencia {
  readonly grupos: number
  readonly asistidos: number
}

/** One entry per week; null when no selected group met. */
export type DetalleSemanal = readonly (SemanaAsistencia | null)[]

export interface Tendencia {
  /** Rolling average now minus 4 points before, in percentage points. */
  readonly puntos: number
  readonly sentido: 'sube' | 'baja' | 'igual'
}

export interface KpisAsistencia {
  readonly porcentaje: number | null
  readonly grupos: number
  readonly reuniones: number
  /** Latest meeting the person attended (GdV / Estudiantes "Última asistencia"). */
  readonly ultimaAsistencia: string | null
  /** Latest meeting with a mark (Talleres "Última sesión"). */
  readonly ultimaReunion: string | null
}

export interface FilaHistorial {
  readonly fecha: string
  readonly grupoId: string
  readonly grupo: string
  readonly presente: boolean
  /** The group is not a current one ("· pasado"). */
  readonly pasado: boolean
  /** "· como visitante" (Estudiantes). */
  readonly comoVisitante: boolean
}

export const TODOS_LOS_GRUPOS = 'todos'

const MS_DIA = 86_400_000

function aDia(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null
}

function aIso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

function media(valores: readonly (number | null)[]): number | null {
  const v = valores.filter((x): x is number => x !== null)
  return v.length === 0 ? null : Math.round(v.reduce((s, x) => s + x, 0) / v.length)
}

/** The kinds that have at least one group, in selector order. */
export function tiposConRegistros(asistencia: AsistenciaPersona): TipoAsistencia[] {
  return TIPOS_ASISTENCIA.filter((tipo) => asistencia.grupos.some((g) => g.tipo === tipo))
}

export function gruposDeTipo(asistencia: AsistenciaPersona, tipo: TipoAsistencia): GrupoAsistencia[] {
  return asistencia.grupos.filter((g) => g.tipo === tipo)
}

/** Every group for "todos" or an unknown id; otherwise the chosen one. */
export function gruposDeSeleccion(grupos: readonly GrupoAsistencia[], seleccion: string): GrupoAsistencia[] {
  const elegido = grupos.filter((g) => g.id === seleccion)
  return elegido.length > 0 ? elegido : [...grupos]
}

/** N seven-day windows, oldest first; the last one ends on `hasta`. */
export function semanasHasta(hasta: string, n = 12): Semana[] {
  const fin = aDia(hasta)
  if (fin === null) return []
  return Array.from({ length: n }, (_, i) => {
    const finSemana = fin - (n - 1 - i) * 7 * MS_DIA
    return { inicio: aIso(finSemana - 6 * MS_DIA), fin: aIso(finSemana) }
  })
}

/**
 * Per week, the selected groups that met and those the person attended. A
 * group with two meetings that week counts once: attended if present at any.
 */
export function detalleSemanal(grupos: readonly GrupoAsistencia[], semanas: readonly Semana[]): (SemanaAsistencia | null)[] {
  return semanas.map(({ inicio, fin }) => {
    const reunidos = grupos
      .map((g) => g.marcas.filter((m) => m.fecha >= inicio && m.fecha <= fin))
      .filter((enSemana) => enSemana.length > 0)
    if (reunidos.length === 0) return null
    return { grupos: reunidos.length, asistidos: reunidos.filter((enSemana) => enSemana.some((m) => m.presente)).length }
  })
}

/** The curve's points: the share of the groups that met that the person attended. */
export function serieDeDetalle(detalle: DetalleSemanal): (number | null)[] {
  return detalle.map((d) => (d === null ? null : Math.round((d.asistidos / d.grupos) * 100)))
}

export function serieSemanal(grupos: readonly GrupoAsistencia[], semanas: readonly Semana[]): Serie {
  return serieDeDetalle(detalleSemanal(grupos, semanas))
}

/** The week's line ("asistió", "asistió en 2 de 3 grupos", …), for the tooltip and screen readers. */
export function textoSemana(d: SemanaAsistencia | null): string {
  if (d === null) return 'sin reunión'
  if (d.asistidos === d.grupos) return 'asistió'
  if (d.asistidos === 0) return 'no asistió'
  return d.grupos === 2 ? 'asistió a una de sus reuniones' : `asistió en ${d.asistidos} de ${d.grupos} grupos`
}

/** The legend item of the mixed (amber) weeks; null when no week mixes. */
export function leyendaMixta(detalle: DetalleSemanal): string | null {
  const mixtas = detalle.filter((d): d is SemanaAsistencia => d !== null && d.asistidos > 0 && d.asistidos < d.grupos)
  if (mixtas.length === 0) return null
  return mixtas.some((d) => d.grupos > 2) ? 'Asistió en parte de sus grupos' : 'Asistió a una de sus reuniones'
}

/** Rolling average of the last 4 weeks with a value; null where the week has none. */
export function promedioMovil4(serie: Serie): (number | null)[] {
  return serie.map((v, i) => (v === null ? null : media(serie.slice(Math.max(0, i - 3), i + 1))))
}

/** The rolling average now versus 4 values before; null with fewer than 5. */
export function tendencia4(serie: Serie): Tendencia | null {
  const r = promedioMovil4(serie).filter((v): v is number => v !== null)
  if (r.length < 5) return null
  const puntos = r[r.length - 1] - r[r.length - 5]
  return { puntos, sentido: puntos > 0 ? 'sube' : puntos < 0 ? 'baja' : 'igual' }
}

export function kpisAsistencia(grupos: readonly GrupoAsistencia[]): KpisAsistencia {
  const marcas = grupos.flatMap((g) => g.marcas)
  const ultima = (lista: typeof marcas) => lista.reduce<string | null>((max, m) => (max === null || m.fecha > max ? m.fecha : max), null)
  return {
    porcentaje: totalesDeMarcas(marcas).porcentaje,
    grupos: grupos.length,
    reuniones: marcas.length,
    ultimaAsistencia: ultima(marcas.filter((m) => m.presente)),
    ultimaReunion: ultima(marcas),
  }
}

/** The latest marks first, across the given groups. */
export function historialAsistencia(grupos: readonly GrupoAsistencia[], limite = Number.POSITIVE_INFINITY): FilaHistorial[] {
  return grupos
    .flatMap((g) =>
      g.marcas.map((m) => ({
        fecha: m.fecha,
        grupoId: g.id,
        grupo: g.nombre,
        presente: m.presente,
        pasado: !g.actual,
        comoVisitante: m.eraVisitante,
      })),
    )
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || a.grupo.localeCompare(b.grupo, 'es'))
    .slice(0, limite)
}

/** Current groups the person leads (the "Ver asistencia del grupo →" callout). */
export function gruposQueLidera(grupos: readonly GrupoAsistencia[]): GrupoAsistencia[] {
  return grupos.filter((g) => g.rol === 'Líder' && g.actual)
}

export interface ResumenTaller {
  /** "2 de 8" or "2". */
  readonly valor: string
  readonly detalle: string
  /** 0–100, the card's bar. */
  readonly porcentaje: number
}

/**
 * A taller card: "N de M sesiones", the sesiones attended over the sesiones
 * of the taller that were not cancelled (the approved prototype). The marks
 * come from the selected range, so a range that cuts the taller counts only
 * the sesiones inside it. Without a known total the card counts the sesiones
 * attended in the period.
 */
export function resumenTaller(taller: GrupoAsistencia): ResumenTaller {
  const { presentes, reuniones } = taller.totales
  const total = taller.totalSesiones
  if (total !== null && total > 0) {
    return { valor: `${presentes} de ${total}`, detalle: 'sesiones', porcentaje: Math.min(100, (presentes / total) * 100) }
  }
  return {
    valor: String(presentes),
    detalle: presentes === 1 ? 'sesión asistida en el período' : 'sesiones asistidas en el período',
    porcentaje: reuniones ? (presentes / reuniones) * 100 : 0,
  }
}

/** The status line of a group card. */
export function estadoDeGrupo(grupo: GrupoAsistencia): { texto: string; tono: TonoEstado } {
  if (grupo.tipo === 'talleres') {
    return grupo.completado ? { texto: 'Completado', tono: 'success' } : { texto: 'En curso', tono: 'info' }
  }
  if (grupo.actual) {
    return { texto: grupo.desde ? `Desde ${fechaCorta(grupo.desde)}` : 'Actual', tono: 'success' }
  }
  return { texto: grupo.salio ? `Salió el ${fechaCorta(grupo.salio)}` : 'Pasado', tono: 'muted' }
}
