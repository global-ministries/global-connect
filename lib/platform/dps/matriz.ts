/**
 * DPS planning — Matriz de domingos (/dps/matriz, T12 of
 * odd/tasks/dps-asistencia-pco.md; S6, S7, S8; artboard
 * docs/design-system/prototipos/planificacion-dps/03-matriz-domingos.html and
 * docs/design-system/patterns.md#matrix-assign). Several Sundays at once, as
 * the directors saw them in the Excel (L11): 8 Sundays as columns plus every
 * other plan of the range (Cena del Señor, events) as a special column; the
 * series as bands over the columns; rows are teams → puestos, the union of
 * what dps_plan_equipos answers for each plan (so a deactivated puesto shows
 * only while some plan still has someone in it); each cell is the puesto of
 * that plan. The convocados, the automatic directors (S8) and the optimistic
 * changes are the ones of lib/platform/dps/plan.ts. Pure: safe on the client.
 */
import { ETIQUETA_TIPO, horariosTexto } from './planilla'
import { faltaPuesto, type EquiposPlan, type PlanCabecera, type PuestoPlan, type SerieCabecera } from './plan'
import { partesFecha, sumarDias } from './programacion'

export const SEMANAS_MATRIZ = 8
const DIAS_RANGO = SEMANAS_MATRIZ * 7

export interface RangoMatriz {
  /** The first Sunday. */
  readonly desde: string
  /** The Saturday after the last Sunday: the special days of that week belong here. */
  readonly hasta: string
  readonly domingos: readonly string[]
  /** The first Sunday of the previous / next 8 weeks. */
  readonly anterior: string
  readonly siguiente: string
}

export interface ColumnaMatriz {
  /** The plan id, or `domingo-<fecha>` for a Sunday without a plan. */
  readonly clave: string
  readonly fecha: string
  readonly plan: PlanCabecera | null
  /** Any plan that is not the Sunday's ('domingo'): Cena del Señor, events… */
  readonly especial: boolean
}

export interface BandaMatriz {
  readonly clave: string
  /** How many columns it spans. */
  readonly columnas: number
  readonly serie: SerieCabecera | null
  readonly especial: boolean
}

export interface PuestoMatriz {
  readonly puestoId: string
  readonly nombre: string
}

export interface EquipoMatriz {
  readonly equipoId: string
  readonly equipo: string
  readonly ruta: string
  readonly puestos: readonly PuestoMatriz[]
}

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/

function fechaValida(fecha: string): boolean {
  if (!FECHA_RE.test(fecha)) return false
  const d = new Date(`${fecha}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === fecha
}

/** The Sunday on or before the date. */
export function domingoAnterior(fecha: string): string {
  return sumarDias(fecha, -new Date(`${fecha}T00:00:00Z`).getUTCDay())
}

export function rangoMatriz(desde: string): RangoMatriz {
  return {
    desde,
    hasta: sumarDias(desde, DIAS_RANGO - 1),
    domingos: Array.from({ length: SEMANAS_MATRIZ }, (_, i) => sumarDias(desde, i * 7)),
    anterior: sumarDias(desde, -DIAS_RANGO),
    siguiente: sumarDias(desde, DIAS_RANGO),
  }
}

/** `?desde=` as the Sunday of that week (2000–2100); anything else is the Sunday of today («Hoy»). */
export function leerDesdeMatriz(valor: string | null | undefined, hoy: string): string {
  if (valor && fechaValida(valor)) {
    const anio = Number(valor.slice(0, 4))
    if (anio >= 2000 && anio <= 2100) return domingoAnterior(valor)
  }
  return domingoAnterior(hoy)
}

export const hrefMatriz = (desde: string): string => `/dps/matriz?desde=${desde}`

const fechaCortaAnio = (fecha: string, conAnio: boolean): string => {
  const { numero, mes } = partesFecha(fecha)
  return `${numero} ${mes}${conAnio ? ` ${fecha.slice(0, 4)}` : ''}`
}

/** "1 nov – 20 dic 2026", or "27 dic 2026 – 14 feb 2027" across a new year. */
export function etiquetaRango(rango: RangoMatriz): string {
  const ultimo = rango.domingos[rango.domingos.length - 1] ?? rango.desde
  const mismoAnio = rango.desde.slice(0, 4) === ultimo.slice(0, 4)
  return `${fechaCortaAnio(rango.desde, !mismoAnio)} – ${fechaCortaAnio(ultimo, true)}`
}

/** The 8 Sundays (with their plan or none) and every other plan of the range, by date; on a date the Sunday first. */
export function columnasMatriz(planes: readonly PlanCabecera[], rango: RangoMatriz): ColumnaMatriz[] {
  const enRango = planes.filter((p) => p.fecha >= rango.desde && p.fecha <= rango.hasta)
  const domingos: ColumnaMatriz[] = rango.domingos.map((fecha) => {
    const plan = enRango.find((p) => p.fecha === fecha && p.tipo === 'domingo') ?? null
    return { clave: plan?.id ?? `domingo-${fecha}`, fecha, plan, especial: false }
  })
  const especiales: ColumnaMatriz[] = enRango
    .filter((p) => !domingos.some((d) => d.plan?.id === p.id))
    .map((plan) => ({ clave: plan.id, fecha: plan.fecha, plan, especial: true }))
  // Stable: the Sundays come first, so on the same date the Sunday leads.
  return [...domingos, ...especiales].sort((a, b) => (a.fecha === b.fecha ? 0 : a.fecha < b.fecha ? -1 : 1))
}

export function resumenColumnas(columnas: readonly ColumnaMatriz[]): { domingos: number; especiales: number } {
  const especiales = columnas.filter((c) => c.especial).length
  return { domingos: columnas.length - especiales, especiales }
}

/** Consecutive Sundays of one series (or of none) share a band; each special day is its own. */
export function bandasMatriz(columnas: readonly ColumnaMatriz[]): BandaMatriz[] {
  const bandas: BandaMatriz[] = []
  for (const c of columnas) {
    const serie = c.especial ? null : (c.plan?.serie ?? null)
    const ultima = bandas[bandas.length - 1]
    if (ultima && !ultima.especial && !c.especial && (ultima.serie?.id ?? null) === (serie?.id ?? null)) {
      bandas[bandas.length - 1] = { ...ultima, columnas: ultima.columnas + 1 }
    } else {
      bandas.push({ clave: c.clave, columnas: 1, serie, especial: c.especial })
    }
  }
  return bandas
}

/** The date head: "dom 8 nov" · "Semana 3" for a Sunday; the name and "mar 1 dic · 18:45" for a special day. */
export function etiquetaColumna(columna: ColumnaMatriz): { titulo: string; detalle: string } {
  const { dia, numero, mes } = partesFecha(columna.fecha)
  const fecha = `${dia} ${numero} ${mes}`
  const plan = columna.plan
  if (columna.especial && plan) {
    return { titulo: plan.titulo ?? ETIQUETA_TIPO[plan.tipo], detalle: [fecha, horariosTexto(plan.horarios)].filter(Boolean).join(' · ') }
  }
  if (!plan) return { titulo: fecha, detalle: 'Sin plan' }
  return { titulo: fecha, detalle: plan.semana ? `Semana ${plan.semana}` : '' }
}

/** The clave of the first Sunday plan from today on (today's included), for «Próximo». */
export function proximaColumna(columnas: readonly ColumnaMatriz[], hoy: string): string | null {
  return columnas.find((c) => !c.especial && c.plan && c.fecha >= hoy)?.clave ?? null
}

/** Teams by ruta, each with the union of its puestos over the plans, in the order they first appear. */
export function filasMatriz(equiposPorPlan: Readonly<Record<string, EquiposPlan>>, columnas: readonly ColumnaMatriz[]): EquipoMatriz[] {
  const equipos = new Map<string, { equipo: string; ruta: string; puestos: Map<string, PuestoMatriz> }>()
  for (const c of columnas) {
    const plan = c.plan ? equiposPorPlan[c.plan.id] : undefined
    for (const e of plan?.equipos ?? []) {
      const fila = equipos.get(e.equipoId) ?? { equipo: e.equipo, ruta: e.ruta, puestos: new Map<string, PuestoMatriz>() }
      for (const p of e.puestos) if (!fila.puestos.has(p.puestoId)) fila.puestos.set(p.puestoId, { puestoId: p.puestoId, nombre: p.nombre })
      equipos.set(e.equipoId, fila)
    }
  }
  return [...equipos.entries()]
    .map(([equipoId, e]) => ({ equipoId, equipo: e.equipo, ruta: e.ruta, puestos: [...e.puestos.values()] }))
    .sort((a, b) => (a.ruta === b.ruta ? 0 : a.ruta < b.ruta ? -1 : 1))
}

/** The puesto in that column's plan; null without a plan, without its teams or when the puesto is not in it. */
export function celdaMatriz(equiposPorPlan: Readonly<Record<string, EquiposPlan>>, columna: ColumnaMatriz, puestoId: string): PuestoPlan | null {
  const plan = columna.plan ? equiposPorPlan[columna.plan.id] : undefined
  for (const e of plan?.equipos ?? []) {
    const p = e.puestos.find((x) => x.puestoId === puestoId)
    if (p) return p
  }
  return null
}

export function faltaEquipoMatriz(equipo: EquipoMatriz, columnas: readonly ColumnaMatriz[], equiposPorPlan: Readonly<Record<string, EquiposPlan>>): number {
  return columnas.reduce((n, c) => n + equipo.puestos.reduce((m, p) => {
    const celda = celdaMatriz(equiposPorPlan, c, p.puestoId)
    return m + (celda ? faltaPuesto(celda) : 0)
  }, 0), 0)
}

export function faltaTotalMatriz(equipos: readonly EquipoMatriz[], columnas: readonly ColumnaMatriz[], equiposPorPlan: Readonly<Record<string, EquiposPlan>>): number {
  return equipos.reduce((n, e) => n + faltaEquipoMatriz(e, columnas, equiposPorPlan), 0)
}

/** On how many of the Sundays shown the person serves (any puesto): the highlight's "3 de 8 domingos". */
export function domingosConPersona(personaId: string, columnas: readonly ColumnaMatriz[], equiposPorPlan: Readonly<Record<string, EquiposPlan>>): number {
  return columnas.filter((c) => {
    if (c.especial || !c.plan) return false
    return (equiposPorPlan[c.plan.id]?.equipos ?? []).some((e) => e.puestos.some((p) => p.convocados.some((x) => x.personaId === personaId)))
  }).length
}

/** The condensed density: "Lorena I." (a leading "Ps." is dropped). */
export function nombreCorto(nombre: string): string {
  const palabras = nombre.replace(/^Ps\.\s+/i, '').trim().split(/\s+/)
  if (palabras.length < 2) return palabras[0] ?? ''
  return `${palabras[0]} ${palabras[1].charAt(0)}.`
}
