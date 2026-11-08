/**
 * Niños › Salones (odd/tasks/ninos-checkin-pco.md, T1d, S5, S8.3, S8.4): the
 * salones of a campus with their rules, the carpeta of each area and «Probar
 * reglas», as /ninos/salones shows them.
 *
 * The rules are the same for every event (S8.4): one row per salón.
 *  - Name, regulars' quota (capacidad), ages and grades: the table itself
 *    (ninos_salones, RLS ninos_puede_configurar on the salón's equipo; no
 *    screen edited them before, the Barquisimeto salones came from a seed).
 *  - Visitor quota, volunteers, open / closed, options, fecha de corte and
 *    promoción: ninos_salon_reglas_guardar, which replaces them all.
 *  - "Mantener a los regulares": ninos_carpeta_guardar per campus and area.
 *    The carpeta "distribución" (en orden / equilibrada) is gone (S9.5, L34:
 *    a child goes to the salones of their age and grade, never balanced):
 *    ninos_carpetas.distribucion stays in the table but is not read, and the
 *    RPC, which still requires the argument, always gets 'en_orden'.
 * The new columns and RPCs are not in database.types.ts yet: rows are read by
 * hand and the calls go through an untyped client (as ./eventos.ts). Errors:
 * the RPC HINT as is (supabase/migrations/20261108100000_ninos_eventos.sql).
 */
import type { SupabaseClient } from '@supabase/supabase-js'

import type { Resultado } from './eventos'
import { edadEnMeses, edadParaSalon, explicarSalon, fechaReferencia, type AreaSalon, type SalonSugerible } from './sugerir-salon'

export const AREAS: readonly AreaSalon[] = ['waumba', 'upstreet']
export const NOMBRE_AREA: Record<AreaSalon, string> = { waumba: 'Waumba Land', upstreet: 'UpStreet' }
/** ninos_carpeta_guardar still requires p_distribucion: always the table default (S9.5). */
export const DISTRIBUCION_FIJA = 'en_orden'

export interface ReglasSalon {
  readonly cupoVisitantes: number
  /** One volunteer every N children; null = no rule. */
  readonly ninosPorVoluntario: number | null
  readonly minVoluntarios: number
  readonly abierto: boolean
  readonly opcionPanal: boolean
  readonly opcionMerienda: boolean
  readonly corteMes: number | null
  readonly corteDia: number | null
  readonly promocionMes: number | null
  readonly promocionDia: number | null
}

/** The data of a salón saved on the table itself. */
export interface DatosSalon {
  readonly nombre: string
  /** Regulars' quota. */
  readonly capacidad: number
  readonly edadMinMeses: number | null
  readonly edadMaxMeses: number | null
  readonly gradoMin: number | null
  readonly gradoMax: number | null
}

export interface SalonAdmin extends DatosSalon, ReglasSalon {
  readonly id: string
  readonly campusId: string
  readonly equipoId: string
  readonly area: AreaSalon
  readonly esNecesidadesEspeciales: boolean
  readonly orden: number
  readonly activo: boolean
}

export interface CarpetaAdmin {
  readonly area: AreaSalon
  readonly mantenerRegulares: boolean
}

export const MAX_NOMBRE_SALON = 80
export const MAX_CUPO = 500
export const MAX_EDAD_MESES = 215

/** The columns the screen reads (untyped select). */
export const COLUMNAS_SALON =
  'id, campus_id, equipo_id, area, nombre, capacidad, edad_min_meses, edad_max_meses, grado_min, grado_max, es_necesidades_especiales, orden, activo, cupo_visitantes, ninos_por_voluntario, min_voluntarios, abierto, opcion_panal, opcion_merienda, corte_mes, corte_dia, promocion_mes, promocion_dia'

// ── reading ──────────────────────────────────────────────────────────

type Fila = Record<string, unknown>

const esFila = (x: unknown): x is Fila => Boolean(x) && typeof x === 'object' && !Array.isArray(x)
const texto = (x: unknown): string | null => (typeof x === 'string' && x ? x : null)
const entero = (x: unknown): number | null => (typeof x === 'number' && Number.isInteger(x) ? x : null)
const esArea = (x: unknown): x is AreaSalon => x === 'waumba' || x === 'upstreet'

function leerSalon(f: unknown): SalonAdmin | null {
  if (!esFila(f)) return null
  const id = texto(f.id)
  const campusId = texto(f.campus_id)
  const equipoId = texto(f.equipo_id)
  const capacidad = entero(f.capacidad)
  if (!id || !campusId || !equipoId || !esArea(f.area) || capacidad === null) return null
  // A row read before the rules existed takes the column defaults.
  return {
    id,
    campusId,
    equipoId,
    area: f.area,
    nombre: typeof f.nombre === 'string' ? f.nombre : '',
    capacidad,
    edadMinMeses: entero(f.edad_min_meses),
    edadMaxMeses: entero(f.edad_max_meses),
    gradoMin: entero(f.grado_min),
    gradoMax: entero(f.grado_max),
    esNecesidadesEspeciales: f.es_necesidades_especiales === true,
    orden: entero(f.orden) ?? 0,
    activo: f.activo !== false,
    cupoVisitantes: entero(f.cupo_visitantes) ?? 0,
    ninosPorVoluntario: entero(f.ninos_por_voluntario),
    minVoluntarios: entero(f.min_voluntarios) ?? 0,
    abierto: f.abierto !== false,
    opcionPanal: f.opcion_panal === true,
    opcionMerienda: f.opcion_merienda === true,
    corteMes: entero(f.corte_mes),
    corteDia: entero(f.corte_dia),
    promocionMes: entero(f.promocion_mes),
    promocionDia: entero(f.promocion_dia),
  }
}

/** The salones of ninos_salones by `orden`; rows that do not fit are dropped. */
export function leerSalones(data: unknown): SalonAdmin[] {
  if (!Array.isArray(data)) return []
  return data
    .map(leerSalon)
    .filter((s): s is SalonAdmin => s !== null)
    .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es'))
}

export function leerCarpetas(data: unknown): CarpetaAdmin[] {
  if (!Array.isArray(data)) return []
  return data.flatMap((f): CarpetaAdmin[] =>
    esFila(f) && esArea(f.area)
      ? [{ area: f.area, mantenerRegulares: f.mantener_regulares !== false }]
      : [],
  )
}

/** The carpeta of an area; without a row, the table default (keep regulars). */
export function carpetaDe(carpetas: readonly CarpetaAdmin[], area: AreaSalon): CarpetaAdmin {
  return carpetas.find((c) => c.area === area) ?? { area, mantenerRegulares: true }
}

export function reglasDe(s: SalonAdmin): ReglasSalon {
  return {
    cupoVisitantes: s.cupoVisitantes,
    ninosPorVoluntario: s.ninosPorVoluntario,
    minVoluntarios: s.minVoluntarios,
    abierto: s.abierto,
    opcionPanal: s.opcionPanal,
    opcionMerienda: s.opcionMerienda,
    corteMes: s.corteMes,
    corteDia: s.corteDia,
    promocionMes: s.promocionMes,
    promocionDia: s.promocionDia,
  }
}

export function datosDe(s: SalonAdmin): DatosSalon {
  return {
    nombre: s.nombre,
    capacidad: s.capacidad,
    edadMinMeses: s.edadMinMeses,
    edadMaxMeses: s.edadMaxMeses,
    gradoMin: s.gradoMin,
    gradoMax: s.gradoMax,
  }
}

// ── errors ───────────────────────────────────────────────────────────

export interface ErrorSalones {
  readonly code?: string | null
  readonly message?: string | null
  readonly hint?: string | null
}

const ERROR_GENERICO = 'No se pudo guardar. Inténtalo de nuevo.'
export const SIN_PERMISO_SALON = 'No tienes permiso para configurar este salón.'

const MENSAJES: Record<string, string> = {
  sin_autoridad: SIN_PERMISO_SALON,
  salon_no_encontrado: 'El salón no existe.',
}

/** The Spanish sentence of an error: the RPC HINT as is, else a known code of the RPC or the table. */
export function mensajeErrorSalones(error: ErrorSalones | null | undefined): string {
  const hint = error?.hint?.trim()
  if (hint) return hint
  if (error?.code === '23505') return 'Ya hay un salón con ese nombre en este campus.'
  if (error?.code === '42501') return SIN_PERMISO_SALON
  return MENSAJES[error?.message ?? ''] ?? ERROR_GENERICO
}

// ── checks (the same sentences as the RPC HINTs) ─────────────────────

const enteroEntre = (n: number | null, min: number, max: number): boolean => n !== null && Number.isInteger(n) && n >= min && n <= max

/** Days of a month in a leap year (29 Feb is a valid day of the year). */
const diasDelMes = (mes: number): number => new Date(Date.UTC(2000, mes, 0)).getUTCDate()

function diaMesValido(mes: number | null, dia: number | null): boolean {
  if (mes === null && dia === null) return true
  return enteroEntre(mes, 1, 12) && enteroEntre(dia, 1, diasDelMes(mes as number))
}

/** Null when the rules can be saved, else what to fix. */
export function validarReglas(r: ReglasSalon): string | null {
  if (!enteroEntre(r.cupoVisitantes, 0, MAX_CUPO)) return 'El cupo de visitantes va de 0 a 500.'
  if ((r.ninosPorVoluntario !== null && !enteroEntre(r.ninosPorVoluntario, 1, 100)) || !enteroEntre(r.minVoluntarios, 0, 50)) {
    return 'Niños por voluntario va de 1 a 100 y el mínimo de voluntarios de 0 a 50.'
  }
  if (!diaMesValido(r.corteMes, r.corteDia)) return 'La fecha de corte necesita un día y un mes válidos.'
  if (!diaMesValido(r.promocionMes, r.promocionDia)) return 'La fecha de promoción necesita un día y un mes válidos.'
  return null
}

const opcional = (n: number | null, min: number, max: number) => n === null || enteroEntre(n, min, max)

/** Null when the name, quota and ranges can be saved. An open end of a range is null. */
export function validarDatosSalon(d: DatosSalon): string | null {
  const nombre = d.nombre.trim()
  if (!nombre || nombre.length > MAX_NOMBRE_SALON) return 'El salón necesita un nombre de hasta 80 caracteres.'
  if (!enteroEntre(d.capacidad, 1, MAX_CUPO)) return 'El cupo de regulares va de 1 a 500.'
  if (!opcional(d.edadMinMeses, 0, MAX_EDAD_MESES) || !opcional(d.edadMaxMeses, 0, MAX_EDAD_MESES)) {
    return 'Escribe la edad en meses, de 0 a 215: 5 años son 60 meses.'
  }
  if (d.edadMinMeses !== null && d.edadMaxMeses !== null && d.edadMinMeses > d.edadMaxMeses) return 'La edad «desde» no puede ser mayor que «hasta».'
  if (!opcional(d.gradoMin, 0, 12) || !opcional(d.gradoMax, 0, 12)) return 'El grado va de 0 (preescolar) a 12.'
  if (d.gradoMin !== null && d.gradoMax !== null && d.gradoMin > d.gradoMax) return 'El grado «desde» no puede ser mayor que «hasta».'
  return null
}

// ── texts ────────────────────────────────────────────────────────────

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'] as const

/** "4 años 2 meses", "1 año", "18 meses" below a year. */
export function textoEdad(meses: number): string {
  const anios = Math.floor(meses / 12)
  const resto = meses % 12
  const textoMeses = `${resto} ${resto === 1 ? 'mes' : 'meses'}`
  if (!anios) return textoMeses
  return `${anios} ${anios === 1 ? 'año' : 'años'}${resto ? ` ${textoMeses}` : ''}`
}

/** "1 dic"; empty without a date. */
export function textoDiaMes(mes: number | null, dia: number | null): string {
  return mes && dia ? `${dia} ${MESES[mes - 1]}` : ''
}

/** "1 dic" or "15 ago" → { mes, dia }; null when it is not a day of the year. */
export function leerDiaMes(valor: string): { mes: number; dia: number } | null {
  const m = /^(\d{1,2}) ([a-zñ]{3})$/.exec(valor.trim().toLowerCase())
  if (!m) return null
  const mes = MESES.indexOf(m[2] as (typeof MESES)[number]) + 1
  const dia = Number(m[1])
  return mes && diaMesValido(mes, dia) ? { mes, dia } : null
}

/** "1 dic 2026" of a YYYY-MM-DD date. */
function fechaLarga(fecha: string): string {
  return `${Number(fecha.slice(8, 10))} ${MESES[Number(fecha.slice(5, 7)) - 1]} ${fecha.slice(0, 4)}`
}

/** "Preescolar", "1º grado", "5º a 6º grado". */
export function textoGrado(min: number | null, max: number | null = min): string {
  const g = (n: number) => (n === 0 ? 'preescolar' : `${n}º`)
  if (min === null && max === null) return ''
  if (min === null || max === null || min === max) {
    const n = (min ?? max) as number
    return n === 0 ? 'Preescolar' : `${n}º grado`
  }
  return `${g(min).replace(/^p/, 'P')} a ${g(max)} grado`
}

function textoRangoEdad(min: number | null, max: number | null): string {
  if (min !== null && max !== null) return `${min}–${max} meses`
  if (min !== null) return `Desde ${min} meses`
  return `Hasta ${max} meses`
}

/** Who the salón takes: "36–47 meses · corte 1 dic", "1º grado", "Por asignación · necesidades especiales". */
export function textoQuienEntra(s: SalonAdmin): string {
  if (s.esNecesidadesEspeciales) return 'Por asignación · necesidades especiales'
  const partes: string[] = []
  if (s.edadMinMeses !== null || s.edadMaxMeses !== null) partes.push(textoRangoEdad(s.edadMinMeses, s.edadMaxMeses))
  if (s.gradoMin !== null || s.gradoMax !== null) partes.push(textoGrado(s.gradoMin, s.gradoMax))
  if (!partes.length) return 'Sin edad ni grado: no se sugiere a nadie'
  if (s.corteMes && s.corteDia) partes.push(`corte ${textoDiaMes(s.corteMes, s.corteDia)}`)
  return partes.join(' · ')
}

/** Volunteers that `ninos` children need: one every N, never fewer than the minimum. */
export function voluntariosNecesarios(s: Pick<ReglasSalon, 'ninosPorVoluntario' | 'minVoluntarios'>, ninos: number): number {
  const porNinos = s.ninosPorVoluntario ? Math.ceil(ninos / s.ninosPorVoluntario) : 0
  return Math.max(s.minVoluntarios, porNinos)
}

/** "1 cada 5 · mín 2", "Mínimo 3", "Sin regla". */
export function textoVoluntarios(s: Pick<ReglasSalon, 'ninosPorVoluntario' | 'minVoluntarios'>): string {
  if (s.ninosPorVoluntario) return `1 cada ${s.ninosPorVoluntario} · mín ${s.minVoluntarios}`
  return s.minVoluntarios ? `Mínimo ${s.minVoluntarios}` : 'Sin regla'
}

export interface ResumenSalones {
  readonly salones: number
  readonly carpetas: number
  /** Quotas of the open salones. */
  readonly regulares: number
  readonly visitantes: number
  readonly cerrados: number
}

export function resumenSalones(salones: readonly SalonAdmin[]): ResumenSalones {
  const abiertos = salones.filter((s) => s.abierto)
  return {
    salones: salones.length,
    carpetas: new Set(salones.map((s) => s.area)).size,
    regulares: abiertos.reduce((t, s) => t + s.capacidad, 0),
    visitantes: abiertos.reduce((t, s) => t + s.cupoVisitantes, 0),
    cerrados: salones.length - abiertos.length,
  }
}

// ── Probar reglas ────────────────────────────────────────────────────

export interface ProbarReglasInput {
  readonly fechaNacimiento: string | null
  /** 0 = preescolar, 1..6; null = sin grado. */
  readonly grado: number | null
  readonly necesidadesEspeciales: boolean
  readonly visitante: boolean
  readonly fechaServicio: string
  readonly salones: readonly SalonAdmin[]
  /** Children inside each salón; without it the salones are empty. */
  readonly ocupados?: Readonly<Record<string, number>>
}

export interface ResultadoPrueba {
  readonly estado: 'asignado' | 'cerrado' | 'lleno' | 'ninguno' | 'faltan_datos'
  readonly salon: SalonAdmin | null
  readonly titulo: string
  /** The child's age on the service date ("3 años 11 meses"), when known. */
  readonly edad: string | null
  /** Why this salón: one sentence per rule that held. */
  readonly porque: readonly string[]
  /** The other salones of the carpeta and why not (at most 4). */
  readonly descartados: readonly string[]
  readonly queHacer: string | null
}

const sugerible = (s: SalonAdmin): SalonSugerible => s

/**
 * Where the desk would send a child and why: the rules of sugerirSalon
 * (age on the fecha de corte, grade, special needs, open, quota for regulars
 * or visitors, in order among the salones that fit) in plain Spanish. Pure:
 * the simulator never writes.
 */
export function probarReglas(input: ProbarReglasInput): ResultadoPrueba {
  const edadHoy = edadEnMeses(input.fechaNacimiento, input.fechaServicio)
  const edad = edadHoy === null ? null : textoEdad(edadHoy)
  if (edadHoy === null && input.grado === null) {
    return { estado: 'faltan_datos', salon: null, titulo: 'Escribe la fecha de nacimiento o elige el grado.', edad, porque: [], descartados: [], queHacer: null }
  }

  const activos = input.salones.filter((s) => s.activo)
  const r = explicarSalon({
    fechaNacimiento: edadHoy === null ? null : input.fechaNacimiento,
    grado: input.grado,
    necesidadesEspeciales: input.necesidadesEspeciales,
    fechaServicio: input.fechaServicio,
    salones: activos.map(sugerible),
    visitante: input.visitante,
    ocupados: input.ocupados,
  })
  const porId = new Map(activos.map((s) => [s.id, s]))
  const salon = r.salon ? (porId.get(r.salon.id) ?? null) : null
  const ocupados = (s: SalonAdmin) => input.ocupados?.[s.id] ?? 0
  const limite = (s: SalonAdmin) => s.capacidad + (input.visitante ? s.cupoVisitantes : 0)
  const candidatos = new Set(r.candidatos.map((s) => s.id))
  const disponibles = new Set(r.disponibles.map((s) => s.id))

  const edadDe = (s: SalonAdmin) => edadParaSalon(input.fechaNacimiento, input.fechaServicio, s)
  const porQueNo = (s: SalonAdmin): string => {
    if (candidatos.has(s.id)) {
      if (!s.abierto) return 'cerrado'
      if (!disponibles.has(s.id)) return `lleno, ${ocupados(s)} de ${limite(s)}`
      return 'va después en el orden'
    }
    if (s.esNecesidadesEspeciales) return 'solo por asignación del coordinador'
    if (s.edadMinMeses !== null || s.edadMaxMeses !== null) {
      const e = edadDe(s)
      return e === null ? 'falta la fecha de nacimiento' : `${e} meses no está entre ${s.edadMinMeses ?? 0} y ${s.edadMaxMeses ?? MAX_EDAD_MESES}`
    }
    if (s.gradoMin !== null || s.gradoMax !== null) {
      return input.grado === null ? 'falta el grado' : `${textoGrado(input.grado)} no es ${textoGrado(s.gradoMin, s.gradoMax).toLowerCase()}`
    }
    return 'no recibe por edad ni grado'
  }

  // The carpeta of the decision; without one, the area of the data given.
  const area: AreaSalon = r.candidatos[0]?.area ?? (input.grado !== null && input.grado > 0 ? 'upstreet' : 'waumba')
  const descartados = activos
    .filter((s) => s.area === area && s.id !== salon?.id)
    .map((s) => `${s.nombre}: ${porQueNo(s)}`)
    .slice(0, 4)
  const base = { edad, descartados }

  if (r.estado === 'ninguno') {
    return { ...base, estado: 'ninguno', salon: null, titulo: 'Ningún salón recibe a este niño', porque: [], queHacer: 'Revisa las edades y grados o crea un salón para esa edad.' }
  }
  const primero = porId.get(r.candidatos[0].id) as SalonAdmin
  if (r.estado === 'cerrado') {
    return { ...base, estado: 'cerrado', salon: null, titulo: `Le toca ${primero.nombre}, pero está cerrado`, porque: [], queHacer: 'Abre el salón o, en la mesa, elige otro a mano.' }
  }
  if (r.estado === 'lleno') {
    return {
      ...base,
      estado: 'lleno',
      salon: null,
      titulo: r.candidatos.length === 1 ? `${primero.nombre} está lleno` : 'Los salones que le sirven están llenos',
      porque: [],
      queHacer: 'En la mesa se avisa que está lleno; un coordinador decide si pasa del cupo.',
    }
  }

  const elegido = salon as SalonAdmin
  const porque: string[] = []
  if (r.criterio === 'necesidades') porque.push('Necesidades especiales: va al salón de asignación')
  if (r.criterio === 'grado') porque.push(`${textoGrado(input.grado)} coincide`)
  if (r.criterio === 'edad') {
    const referencia = fechaReferencia(elegido, input.fechaServicio)
    if (referencia !== input.fechaServicio) porque.push(`Fecha de corte: cuenta su edad al ${fechaLarga(referencia)}`)
    porque.push(`${edadDe(elegido)} meses está entre ${elegido.edadMinMeses ?? 0} y ${elegido.edadMaxMeses ?? MAX_EDAD_MESES}`)
  }
  if (input.ocupados) {
    porque.push(
      `Hay ${ocupados(elegido)} niños de ${elegido.capacidad} regulares${input.visitante && elegido.cupoVisitantes ? ` + ${elegido.cupoVisitantes} visitantes` : ''}`,
    )
  } else if (input.visitante) {
    porque.push(
      elegido.cupoVisitantes
        ? `Visitante: puede usar los ${elegido.cupoVisitantes} puestos de visitantes además del cupo de ${elegido.capacidad}`
        : `Visitante: cupo de ${elegido.capacidad}, sin puestos solo para visitantes`,
    )
  } else {
    porque.push(`Regular: cupo de ${elegido.capacidad}`)
  }
  const n = r.disponibles.length
  porque.push(
    r.candidatos.length === 1 ? 'Es el único salón que le sirve' : `En orden: es el primero con cupo de ${n} que le sirven`,
  )
  return { ...base, estado: 'asignado', salon: elegido, titulo: `Va a ${elegido.nombre}`, porque, queHacer: null }
}

// ── writes (untyped: the rule columns and RPCs are not in database.types.ts yet) ──

type Cliente = Pick<SupabaseClient, 'rpc' | 'from'>

const fallo = (error: ErrorSalones): { ok: false; message: string } => ({ ok: false, message: mensajeErrorSalones(error) })

/** ninos_salon_reglas_guardar: replaces every rule of the salón. */
export async function rpcGuardarReglas(cliente: Cliente, salonId: string, r: ReglasSalon): Promise<Resultado<null>> {
  const { error } = await (cliente as SupabaseClient).rpc('ninos_salon_reglas_guardar', {
    p_salon_id: salonId,
    p_cupo_visitantes: r.cupoVisitantes,
    p_ninos_por_voluntario: r.ninosPorVoluntario,
    p_min_voluntarios: r.minVoluntarios,
    p_abierto: r.abierto,
    p_opcion_panal: r.opcionPanal,
    p_opcion_merienda: r.opcionMerienda,
    p_corte_mes: r.corteMes,
    p_corte_dia: r.corteDia,
    p_promocion_mes: r.promocionMes,
    p_promocion_dia: r.promocionDia,
  })
  return error ? fallo(error) : { ok: true, data: null }
}

/** ninos_carpeta_guardar: "mantener a los regulares" of an area in a campus (the distribution is fixed, S9.5). */
export async function rpcGuardarCarpeta(cliente: Cliente, campusId: string, c: CarpetaAdmin): Promise<Resultado<null>> {
  const { error } = await (cliente as SupabaseClient).rpc('ninos_carpeta_guardar', {
    p_campus_id: campusId,
    p_area: c.area,
    p_distribucion: DISTRIBUCION_FIJA,
    p_mantener_regulares: c.mantenerRegulares,
  })
  return error ? fallo(error) : { ok: true, data: null }
}

/**
 * Name, regulars' quota and ranges, on the table (RLS: ninos_puede_configurar
 * on the salón's equipo). RLS skips a row it does not allow without an error,
 * so no row back means no permission.
 */
export async function actualizarDatosSalon(cliente: Cliente, salonId: string, d: DatosSalon): Promise<Resultado<null>> {
  const { data, error } = await (cliente as SupabaseClient)
    .from('ninos_salones')
    .update({
      nombre: d.nombre.trim(),
      capacidad: d.capacidad,
      edad_min_meses: d.edadMinMeses,
      edad_max_meses: d.edadMaxMeses,
      grado_min: d.gradoMin,
      grado_max: d.gradoMax,
    })
    .eq('id', salonId)
    .select('id')
  if (error) return fallo(error)
  return Array.isArray(data) && data.length ? { ok: true, data: null } : { ok: false, message: SIN_PERMISO_SALON }
}

/**
 * A new salón of an area, after its last one. It belongs to the Dream Team
 * equipo of the area's salones in the campus (Waumba Land / Upstreet); the
 * first salón of an area is not created here. The rules take their defaults.
 */
export async function insertarSalon(
  cliente: Cliente,
  a: { campusId: string; area: AreaSalon; nombre: string },
): Promise<Resultado<{ id: string }>> {
  const db = cliente as SupabaseClient
  const { data: ultimos, error: errorLectura } = await db
    .from('ninos_salones')
    .select('equipo_id, orden')
    .eq('campus_id', a.campusId)
    .eq('area', a.area)
    .order('orden', { ascending: false })
    .limit(1)
  if (errorLectura) return fallo(errorLectura)
  const ultimo = Array.isArray(ultimos) ? (ultimos[0] as Fila | undefined) : undefined
  const equipoId = texto(ultimo?.equipo_id)
  if (!ultimo || !equipoId) {
    return { ok: false, message: 'Esta área todavía no tiene salones en el campus: pide a soporte que cree el primero.' }
  }
  const { data, error } = await db
    .from('ninos_salones')
    .insert({ campus_id: a.campusId, equipo_id: equipoId, area: a.area, nombre: a.nombre.trim(), orden: (entero(ultimo.orden) ?? 0) + 10 })
    .select('id')
    .single()
  if (error) return fallo(error)
  return { ok: true, data: { id: String((data as Fila | null)?.id ?? '') } }
}
