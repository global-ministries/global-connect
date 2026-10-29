import {
  TIPOS_ASISTENCIA,
  totalesDeMarcas,
  type AsistenciaPersona,
  type GrupoAsistencia,
  type TipoAsistencia,
} from './asistencia-persona'

/**
 * Pure view model of the ficha's Asistencia tab (S13 of
 * odd/tasks/sistema-diseno-v2.md; prototype
 * docs/design-system/prototipos/usuarios/03-ficha-escritorio.html). No I/O.
 *
 * It is the PERSON's own attendance: a leader's line is their own presence,
 * and the group's attendance lives on the group page ("Ver asistencia del
 * grupo →"). Presente is yes/no; a week mixes only when the person had
 * meetings in two groups and attended one of them.
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
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'] as const

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

/** "1 sep 2026"; '' for an invalid date. */
export function fechaCorta(iso: string): string {
  const dia = aDia(iso)
  if (dia === null) return ''
  const d = new Date(dia)
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()}`
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

/** Per week, the share of the selected groups' meetings the person attended. */
export function serieSemanal(grupos: readonly GrupoAsistencia[], semanas: readonly Semana[]): Serie {
  const marcas = grupos.flatMap((g) => g.marcas)
  return semanas.map(({ inicio, fin }) => {
    const enSemana = marcas.filter((m) => m.fecha >= inicio && m.fecha <= fin)
    return totalesDeMarcas(enSemana).porcentaje
  })
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
