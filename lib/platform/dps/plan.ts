/**
 * DPS planning — Plan del domingo · Equipos (/dps/plan,
 * odd/tasks/dps-asistencia-pco.md, T10; S6.2, S6.4, S6.5, S7.1, S7.4). The
 * database decides who sees and who edits, which teams and puestos belong to
 * DPS and who may be convocado where (dps_plan_equipos, dps_candidatos_puesto,
 * dps_convocar / dps_desconvocar / dps_copiar_plan in
 * supabase/migrations/20261108202000_dps_planificacion_convocados.sql); these
 * helpers read its answers, title the plan, pick the plan of the screen and
 * its neighbours, count what is missing and apply the optimistic changes.
 * One convocatoria per person per puesto, for every horario of the day; a
 * person may hold two puestos. Pure: safe on the client.
 */
import { ETIQUETA_TIPO, horariosTexto, type TipoPlan } from './planilla'

export const BUCKET_SERIES = 'dps-series'

export interface SerieCabecera {
  readonly id: string
  readonly nombre: string
  readonly color: string
  readonly imagenPath: string | null
  readonly semanas: number | null
}

/** A plan of dps_plan_json (dps_planes_rango, dps_plan_leer), as the header needs it. */
export interface PlanCabecera {
  readonly id: string
  readonly fecha: string
  readonly tipo: TipoPlan
  readonly titulo: string | null
  readonly semana: number | null
  readonly serie: SerieCabecera | null
  readonly horarios: readonly string[]
  readonly llegada: string
}

export interface ConvocadoPlan {
  readonly convocadoId: string
  readonly personaId: string
  readonly servicioId: string
  readonly nombre: string
}

export interface PuestoPlan {
  readonly puestoId: string
  readonly nombre: string
  readonly cantidad: number
  /** A deactivated puesto shows only while it still has convocados. */
  readonly activo: boolean
  readonly convocados: readonly ConvocadoPlan[]
}

export interface EquipoPlan {
  readonly equipoId: string
  readonly equipo: string
  readonly ruta: string
  readonly puestos: readonly PuestoPlan[]
}

export interface EquiposPlan {
  readonly planId: string
  readonly puedeEditar: boolean
  readonly equipos: readonly EquipoPlan[]
}

export interface PuestoDelDia {
  readonly planId: string
  readonly mismoPlan: boolean
  readonly puestoId: string
  readonly puesto: string
  readonly equipo: string
}

/** A row of dps_candidatos_puesto: an active servicio in the puesto's team subtree. */
export interface CandidatoPuesto {
  readonly servicioId: string
  readonly personaId: string
  readonly nombre: string
  readonly apellido: string
  readonly equipo: string
  readonly rol: string
  readonly yaConvocadoEnPlan: boolean
  readonly enEstePuesto: boolean
  /** Their puestos in every plan of that date (this one included). */
  readonly puestosDelDia: readonly PuestoDelDia[]
}

type Objeto = Record<string, unknown>

const objeto = (v: unknown): Objeto | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Objeto) : null)
const lista = (v: unknown): Objeto[] => (Array.isArray(v) ? v.map(objeto).filter((x): x is Objeto => x !== null) : [])
const texto = (v: unknown): string => (typeof v === 'string' ? v : '')
const textoONulo = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null)
const entero = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) ? v : null)
const textos = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
const tipo = (v: unknown): TipoPlan => (Object.hasOwn(ETIQUETA_TIPO, texto(v)) ? (v as TipoPlan) : 'domingo')

export function leerPlanCabecera(v: unknown): PlanCabecera | null {
  const p = objeto(v)
  if (!p || typeof p.id !== 'string' || typeof p.fecha !== 'string') return null
  const s = objeto(p.serie)
  return {
    id: p.id,
    fecha: p.fecha,
    tipo: tipo(p.tipo),
    titulo: textoONulo(p.titulo),
    semana: entero(p.semana),
    serie:
      s && typeof s.id === 'string'
        ? { id: s.id, nombre: texto(s.nombre), color: texto(s.color), imagenPath: textoONulo(s.imagen_path), semanas: entero(s.semanas) }
        : null,
    horarios: textos(p.horarios),
    llegada: texto(p.llegada),
  }
}

/** By date; on the same date the Sunday plan first, then the RPC's order. */
export function ordenarPlanes(planes: readonly PlanCabecera[]): PlanCabecera[] {
  return [...planes].sort((a, b) => (a.fecha === b.fecha ? Number(b.tipo === 'domingo') - Number(a.tipo === 'domingo') : a.fecha < b.fecha ? -1 : 1))
}

/** Reads dps_planes_rango, ordered; rows without an id or a fecha are dropped. */
export function leerPlanesCabecera(data: unknown): PlanCabecera[] {
  return ordenarPlanes(lista(data).map(leerPlanCabecera).filter((p): p is PlanCabecera => p !== null))
}

/** The screen without ?plan=: the next plan from today (today's included), else the most recent one. */
export function elegirProximoPlan(planes: readonly PlanCabecera[], hoy: string): PlanCabecera | null {
  const ordenados = ordenarPlanes(planes)
  return ordenados.find((p) => p.fecha >= hoy) ?? ordenados[ordenados.length - 1] ?? null
}

/** The date pill steps between the plans that exist, whatever their tipo. */
export function vecinosPlan(planes: readonly PlanCabecera[], planId: string): { anterior: PlanCabecera | null; siguiente: PlanCabecera | null } {
  const ordenados = ordenarPlanes(planes)
  const i = ordenados.findIndex((p) => p.id === planId)
  if (i === -1) return { anterior: null, siguiente: null }
  return { anterior: ordenados[i - 1] ?? null, siguiente: ordenados[i + 1] ?? null }
}

/** "Tu casa tiene influencers · Semana 3 de 4", else the plan's title, else its tipo ("Cena del Señor"). */
export function tituloCabecera(plan: PlanCabecera): string {
  if (plan.serie?.nombre) {
    if (!plan.semana) return plan.serie.nombre
    return plan.serie.semanas ? `${plan.serie.nombre} · Semana ${plan.semana} de ${plan.serie.semanas}` : `${plan.serie.nombre} · Semana ${plan.semana}`
  }
  return plan.titulo ?? ETIQUETA_TIPO[plan.tipo]
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'] as const
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'] as const

function partes(fecha: string): { dow: number; dia: number; mes: number; anio: number } {
  const d = new Date(`${fecha}T00:00:00Z`)
  return { dow: d.getUTCDay(), dia: d.getUTCDate(), mes: d.getUTCMonth(), anio: d.getUTCFullYear() }
}

/** The date pill: "Domingo 8 nov 2026". */
export function etiquetaFechaPlan(fecha: string): string {
  const { dow, dia, mes, anio } = partes(fecha)
  const nombre = DIAS[dow] ?? ''
  return `${nombre.charAt(0).toLocaleUpperCase('es')}${nombre.slice(1)} ${dia} ${MESES[mes]?.slice(0, 3) ?? ''} ${anio}`
}

/** For the pill's buttons and the copy dialog: "domingo 1 de noviembre". */
export function fechaHablada(fecha: string): string {
  const { dow, dia, mes } = partes(fecha)
  return `${DIAS[dow] ?? ''} ${dia} de ${MESES[mes] ?? ''}`
}

const horaCorta = (hora: string): string => hora.replace(/^0(\d)/, '$1')

/** "9:15 y 11:15 · llegada 7:00": one call for every horario of the day. */
export function metaHorarios(plan: PlanCabecera): string {
  return [horariosTexto(plan.horarios), plan.llegada ? `llegada ${horaCorta(plan.llegada)}` : ''].filter(Boolean).join(' · ')
}

/** The public URL of a cover of the dps-series bucket (public bucket), or null. */
export function urlPortada(path: string | null | undefined, baseSupabase: string | null | undefined): string | null {
  if (!path || !baseSupabase) return null
  return `${baseSupabase.replace(/\/+$/, '')}/storage/v1/object/public/${BUCKET_SERIES}/${path.split('/').map(encodeURIComponent).join('/')}`
}

function leerConvocado(c: Objeto): ConvocadoPlan {
  return { convocadoId: texto(c.convocado_id), personaId: texto(c.persona_id), servicioId: texto(c.servicio_id), nombre: texto(c.nombre) }
}

/** Reads dps_plan_equipos. The counts are recomputed on the client. */
export function leerEquiposPlan(data: unknown): EquiposPlan {
  const d = objeto(data) ?? {}
  return {
    planId: texto(d.plan_id),
    puedeEditar: d.puede_editar === true,
    equipos: lista(d.equipos).map((e) => ({
      equipoId: texto(e.equipo_id),
      equipo: texto(e.equipo),
      ruta: texto(e.ruta),
      puestos: lista(e.puestos).map((p) => ({
        puestoId: texto(p.puesto_id),
        nombre: texto(p.nombre),
        cantidad: entero(p.cantidad) ?? 1,
        activo: p.activo !== false,
        convocados: lista(p.convocados).map(leerConvocado).filter((c) => c.personaId),
      })),
    })),
  }
}

/** Unfilled places of a puesto; a deactivated puesto asks for nobody. */
export function faltaPuesto(puesto: PuestoPlan): number {
  return puesto.activo ? Math.max(puesto.cantidad - puesto.convocados.length, 0) : 0
}

/** Each person once in the team, whatever puestos they hold. */
export function contarEquipoPlan(equipo: EquipoPlan): { convocados: number; falta: number } {
  const personas = new Set(equipo.puestos.flatMap((p) => p.convocados.map((c) => c.personaId)))
  return { convocados: personas.size, falta: equipo.puestos.reduce((n, p) => n + faltaPuesto(p), 0) }
}

export function totalesPlan(plan: EquiposPlan): { convocados: number; equipos: number; falta: number } {
  const personas = new Set(plan.equipos.flatMap((e) => e.puestos.flatMap((p) => p.convocados.map((c) => c.personaId))))
  return { convocados: personas.size, equipos: plan.equipos.length, falta: plan.equipos.reduce((n, e) => n + contarEquipoPlan(e).falta, 0) }
}

/** The column head: "3 convocados · 1 falta", "… · 2 faltan" or "… · completo". */
export function lineaEquipo({ convocados, falta }: { convocados: number; falta: number }): string {
  const quienes = `${convocados} ${convocados === 1 ? 'convocado' : 'convocados'}`
  return `${quienes} · ${falta === 0 ? 'completo' : `${falta} ${falta === 1 ? 'falta' : 'faltan'}`}`
}

const porNombre = (a: ConvocadoPlan, b: ConvocadoPlan): number => a.nombre.localeCompare(b.nombre, 'es')

function cambiarPuesto(plan: EquiposPlan, puestoId: string, cambio: (p: PuestoPlan) => PuestoPlan): EquiposPlan {
  return {
    ...plan,
    equipos: plan.equipos.map((e) =>
      e.puestos.some((p) => p.puestoId === puestoId) ? { ...e, puestos: e.puestos.map((p) => (p.puestoId === puestoId ? cambio(p) : p)) } : e,
    ),
  }
}

/** Adds the person to the puesto (once, in name order); the same plan when they were already there. */
export function convocarEnPlan(plan: EquiposPlan, puestoId: string, convocado: ConvocadoPlan): EquiposPlan {
  const ya = plan.equipos.some((e) => e.puestos.some((p) => p.puestoId === puestoId && p.convocados.some((c) => c.personaId === convocado.personaId)))
  if (ya) return plan
  return cambiarPuesto(plan, puestoId, (p) => ({ ...p, convocados: [...p.convocados, convocado].sort(porNombre) }))
}

/** Removes the person from that puesto only (their other puestos stay). */
export function quitarDePlan(plan: EquiposPlan, puestoId: string, personaId: string): EquiposPlan {
  return cambiarPuesto(plan, puestoId, (p) => ({ ...p, convocados: p.convocados.filter((c) => c.personaId !== personaId) }))
}

/** Replaces the temporary id of an optimistic convocado with the stored one. */
export function confirmarConvocado(plan: EquiposPlan, puestoId: string, personaId: string, convocadoId: string): EquiposPlan {
  return cambiarPuesto(plan, puestoId, (p) => ({
    ...p,
    convocados: p.convocados.map((c) => (c.personaId === personaId ? { ...c, convocadoId } : c)),
  }))
}

/** Reads dps_candidatos_puesto: people not convocado in the plan first, then the RPC's order. */
export function leerCandidatos(data: unknown): CandidatoPuesto[] {
  const candidatos = lista(data)
    .filter((c) => typeof c.servicio_id === 'string' && typeof c.persona_id === 'string')
    .map((c) => ({
      servicioId: texto(c.servicio_id),
      personaId: texto(c.persona_id),
      nombre: texto(c.nombre),
      apellido: texto(c.apellido),
      equipo: texto(c.equipo),
      rol: texto(c.rol),
      yaConvocadoEnPlan: c.ya_convocado_en_plan === true,
      enEstePuesto: c.en_este_puesto === true,
      puestosDelDia: lista(c.puestos_del_dia).map((x) => ({
        planId: texto(x.plan_id),
        mismoPlan: x.mismo_plan === true,
        puestoId: texto(x.puesto_id),
        puesto: texto(x.puesto),
        equipo: texto(x.equipo),
      })),
    }))
  return candidatos.sort((a, b) => Number(a.yaConvocadoEnPlan) - Number(b.yaConvocadoEnPlan))
}

/** The warning line of a candidate: already in this puesto, or serving elsewhere that day. */
export function avisoCandidato(candidato: CandidatoPuesto, puestoId: string): string | null {
  if (candidato.enEstePuesto) return 'Ya está en este puesto'
  const otros = candidato.puestosDelDia.filter((x) => !(x.mismoPlan && x.puestoId === puestoId)).map((x) => x.puesto)
  return otros.length > 0 ? `Ya sirve ese día en ${[...new Set(otros)].join(', ')}` : null
}

/** The result of dps_copiar_plan. */
export function textoCopia({ copiados, omitidos }: { readonly copiados: number; readonly omitidos: number }): string {
  if (copiados === 0 && omitidos === 0) return 'El plan anterior no tiene convocados para copiar'
  const base = copiados === 1 ? 'Se copió 1' : `Se copiaron ${copiados}`
  if (omitidos === 0) return base
  return `${base} (${omitidos} ${omitidos === 1 ? 'omitido' : 'omitidos'}: servicio inactivo o puesto desactivado)`
}
