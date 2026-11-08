/**
 * DPS planning — the Sunday attendance sheet on the phone
 * (odd/tasks/dps-asistencia-pco.md, T9; S6.1, S7.4, S2). The database decides
 * who may mark whom, the 14-day window and who is in each team
 * (dps_asistencia_planilla / dps_asistencia_marcar in
 * supabase/migrations/20261108202000_dps_planificacion_convocados.sql); these
 * helpers read its answers, pick the plan of the window, count and filter
 * the rows and apply the optimistic changes. One mark per person per plan,
 * for every horario of the day, whatever their puestos: a person in two teams
 * shows in both with the same mark. Pure: safe on the client.
 */

export type TipoPlan = 'domingo' | 'cena_del_senor' | 'noche_adoracion' | 'especial' | 'libre'
export type EstadoDps = 'llego' | 'aviso_no_viene'
export type FiltroDps = 'por_llegar' | 'llegaron' | 'todos'

export const ETIQUETA_TIPO: Record<TipoPlan, string> = {
  domingo: 'Domingo',
  cena_del_senor: 'Cena del Señor',
  noche_adoracion: 'Noche de adoración',
  especial: 'Servicio especial',
  libre: 'Domingo libre',
}

const TIPOS = Object.keys(ETIQUETA_TIPO) as TipoPlan[]
const ESTADOS: readonly EstadoDps[] = ['llego', 'aviso_no_viene']

/** A plan of dps_planes_rango, as the attendance screen needs it. */
export interface PlanDps {
  readonly id: string
  readonly fecha: string
  readonly tipo: TipoPlan
  readonly titulo: string | null
  readonly semana: number | null
  readonly serie: { readonly nombre: string; readonly color: string } | null
  readonly horarios: readonly string[]
  readonly llegada: string
}

export interface PersonaPlanilla {
  readonly personaId: string
  readonly nombre: string
  readonly apellido: string
  readonly iniciales: string
  /** Convocado in a puesto of the plan; false = "vino sin estar convocado". */
  readonly convocado: boolean
  /** null = no mark yet. */
  readonly estado: EstadoDps | null
  /** Their puestos in this team. */
  readonly puestos: readonly string[]
  /** Their puestos in other teams of the same plan. */
  readonly otrosPuestos: readonly string[]
}

/** Someone with an active servicio in the team, neither convocado nor marked. */
export interface OtroPlanilla {
  readonly personaId: string
  readonly nombre: string
  readonly apellido: string
  readonly iniciales: string
}

export interface EquipoPlanilla {
  readonly equipoId: string
  readonly equipo: string
  readonly ruta: string
  readonly personas: readonly PersonaPlanilla[]
  readonly otros: readonly OtroPlanilla[]
}

export interface PlanillaDps {
  readonly planId: string
  readonly fecha: string
  readonly tipo: TipoPlan
  readonly titulo: string | null
  readonly hoy: string
  /** The plan's fecha is today or up to 14 days back. */
  readonly editable: boolean
  readonly equipos: readonly EquipoPlanilla[]
}

export interface TotalesPlanilla {
  /** Everyone on the sheet, once. */
  readonly total: number
  readonly llegaron: number
  /** Convocados without a mark. */
  readonly porLlegar: number
  readonly avisos: number
  readonly sinConvocar: number
}

type Objeto = Record<string, unknown>

function lista(v: unknown): Objeto[] {
  return Array.isArray(v) ? v.filter((x): x is Objeto => Boolean(x) && typeof x === 'object') : []
}

const texto = (v: unknown): string => (typeof v === 'string' ? v : '')
const textoONulo = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null)
const entero = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) ? v : null)
const estado = (v: unknown): EstadoDps | null => (ESTADOS.includes(v as EstadoDps) ? (v as EstadoDps) : null)
const tipo = (v: unknown): TipoPlan => (TIPOS.includes(v as TipoPlan) ? (v as TipoPlan) : 'domingo')
const textos = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

/** Reads dps_planes_rango; rows without an id or a fecha are dropped. */
export function leerPlanes(data: unknown): PlanDps[] {
  return lista(data)
    .filter((p) => typeof p.id === 'string' && typeof p.fecha === 'string')
    .map((p) => {
      const serie = p.serie && typeof p.serie === 'object' ? (p.serie as Objeto) : null
      return {
        id: texto(p.id),
        fecha: texto(p.fecha),
        tipo: tipo(p.tipo),
        titulo: textoONulo(p.titulo),
        semana: entero(p.semana),
        serie: serie ? { nombre: texto(serie.nombre), color: texto(serie.color) } : null,
        horarios: textos(p.horarios),
        llegada: texto(p.llegada),
      }
    })
}

function masReciente(planes: readonly PlanDps[]): PlanDps | null {
  // On the same date the Sunday plan goes first, then the RPC's order.
  return [...planes].sort((a, b) => (a.fecha === b.fecha ? Number(b.tipo === 'domingo') - Number(a.tipo === 'domingo') : a.fecha < b.fecha ? 1 : -1))[0] ?? null
}

/**
 * The plan of the screen: the one of the URL when it is in the window,
 * otherwise today's (the Sunday one first) or the most recent before today.
 * Never a future plan: attendance is passed on the day or after.
 */
export function elegirPlan(planes: readonly PlanDps[], hoy: string, planId: string | null | undefined): PlanDps | null {
  const pasados = planes.filter((p) => p.fecha <= hoy)
  return (planId ? pasados.find((p) => p.id === planId) : undefined) ?? masReciente(pasados)
}

/** "Tu casa tiene influencers · Semana 3", "Bautizos" or "Cena del Señor". */
export function tituloPlan(plan: PlanDps): string {
  if (plan.titulo) return plan.titulo
  if (plan.serie?.nombre) return plan.semana ? `${plan.serie.nombre} · Semana ${plan.semana}` : plan.serie.nombre
  return ETIQUETA_TIPO[plan.tipo]
}

const horaCorta = (hora: string): string => hora.replace(/^0(\d)/, '$1')

/** ['09:15', '11:15'] → "9:15 y 11:15". */
export function horariosTexto(horarios: readonly string[]): string {
  const horas = horarios.map(horaCorta)
  if (horas.length < 2) return horas[0] ?? ''
  return `${horas.slice(0, -1).join(', ')} y ${horas[horas.length - 1]}`
}

function leerPersona(p: Objeto): PersonaPlanilla {
  return {
    personaId: texto(p.persona_id),
    nombre: texto(p.nombre),
    apellido: texto(p.apellido),
    iniciales: texto(p.iniciales),
    convocado: p.convocado === true,
    estado: estado(p.estado),
    puestos: lista(p.puestos).map((x) => texto(x.nombre)).filter(Boolean),
    otrosPuestos: textos(p.otros_puestos),
  }
}

function leerOtro(o: Objeto): OtroPlanilla {
  return { personaId: texto(o.persona_id), nombre: texto(o.nombre), apellido: texto(o.apellido), iniciales: texto(o.iniciales) }
}

/** Reads dps_asistencia_planilla. The counts are recomputed on the client. */
export function leerPlanilla(data: unknown): PlanillaDps {
  const d = data && typeof data === 'object' ? (data as Objeto) : {}
  return {
    planId: texto(d.plan_id),
    fecha: texto(d.fecha),
    tipo: tipo(d.tipo),
    titulo: textoONulo(d.titulo),
    hoy: texto(d.hoy),
    editable: d.editable === true,
    equipos: lista(d.equipos).map((e) => ({
      equipoId: texto(e.equipo_id),
      equipo: texto(e.equipo),
      ruta: texto(e.ruta),
      personas: lista(e.personas).map(leerPersona).filter((p) => p.personaId),
      otros: lista(e.otros).map(leerOtro).filter((o) => o.personaId),
    })),
  }
}

export const nombreCompleto = (p: { readonly nombre: string; readonly apellido: string }): string => `${p.nombre} ${p.apellido}`.trim()

/** Each person once, whatever teams they show in. */
export function totalesPlanilla(planilla: PlanillaDps): TotalesPlanilla {
  const personas = new Map<string, { convocado: boolean; estado: EstadoDps | null }>()
  for (const e of planilla.equipos) {
    for (const p of e.personas) {
      const previa = personas.get(p.personaId)
      personas.set(p.personaId, { convocado: (previa?.convocado ?? false) || p.convocado, estado: p.estado ?? previa?.estado ?? null })
    }
  }
  const filas = [...personas.values()]
  return {
    total: filas.length,
    llegaron: filas.filter((p) => p.estado === 'llego').length,
    porLlegar: filas.filter((p) => p.convocado && p.estado === null).length,
    avisos: filas.filter((p) => p.estado === 'aviso_no_viene').length,
    sinConvocar: filas.filter((p) => !p.convocado).length,
  }
}

export function contarEquipo(equipo: EquipoPlanilla): { llegaron: number; total: number; porLlegar: number } {
  return {
    llegaron: equipo.personas.filter((p) => p.estado === 'llego').length,
    total: equipo.personas.length,
    porLlegar: equipo.personas.filter((p) => p.convocado && p.estado === null).length,
  }
}

export function visibleEnFiltro(persona: PersonaPlanilla, filtro: FiltroDps): boolean {
  if (filtro === 'por_llegar') return persona.convocado && persona.estado === null
  if (filtro === 'llegaron') return persona.estado === 'llego'
  return true
}

/**
 * Who "Marcar todo el equipo" marks (dps_asistencia_marcar_equipo): the
 * convocados of the team without a mark; an "avisó que no viene" stays.
 */
export function pendientesEquipo(equipo: EquipoPlanilla): PersonaPlanilla[] {
  return equipo.personas.filter((p) => p.convocado && p.estado === null)
}

/** The marks applied to each person in every team they show in. */
export function aplicarEstados(planilla: PlanillaDps, cambios: ReadonlyMap<string, EstadoDps | null>): PlanillaDps {
  if (cambios.size === 0) return planilla
  return {
    ...planilla,
    equipos: planilla.equipos.map((e) => ({
      ...e,
      personas: e.personas.map((p) => (cambios.has(p.personaId) ? { ...p, estado: cambios.get(p.personaId) ?? null } : p)),
    })),
  }
}

const porNombre = (a: { nombre: string; apellido: string }, b: { nombre: string; apellido: string }): number =>
  nombreCompleto(a).localeCompare(nombreCompleto(b), 'es')

/**
 * "Agregar a alguien que vino sin estar convocado": arrived in the team
 * where they served today, and out of every team's `otros`.
 */
export function agregarLlegada(planilla: PlanillaDps, equipoId: string, otro: OtroPlanilla): PlanillaDps {
  const fila: PersonaPlanilla = { ...otro, convocado: false, estado: 'llego', puestos: [], otrosPuestos: [] }
  return {
    ...planilla,
    equipos: planilla.equipos.map((e) => ({
      ...e,
      personas: e.equipoId === equipoId ? [...e.personas, fila].sort(porNombre) : e.personas,
      otros: e.otros.filter((o) => o.personaId !== otro.personaId),
    })),
  }
}

/** Undoes agregarLlegada with the sheet as it was before. */
export function deshacerAgregar(planilla: PlanillaDps, personaId: string, antes: PlanillaDps): PlanillaDps {
  return {
    ...planilla,
    equipos: planilla.equipos.map((e) => {
      const previo = antes.equipos.find((x) => x.equipoId === e.equipoId)
      const otro = previo?.otros.find((o) => o.personaId === personaId)
      return {
        ...e,
        personas: e.personas.filter((p) => p.convocado || p.personaId !== personaId),
        otros: otro && !e.otros.some((o) => o.personaId === personaId) ? [...e.otros, otro].sort(porNombre) : e.otros,
      }
    }),
  }
}
