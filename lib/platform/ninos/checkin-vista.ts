/**
 * View model of the check-in at the desk on design-system v2
 * (odd/tasks/ninos-v2.md, N2a, S3–S4; prototypes
 * docs/design-system/prototipos/ninos/01-cola-llegada.html and
 * 04-cola-llegada-tableta.html).
 *
 * - Children come pre-checked: every child with a ficha who has not come in
 *   yet, minus the ones the table unchecked by exception.
 * - Each child keeps its salón: picked by hand › remembered on the ficha ›
 *   suggested by age (the same order as salonParaHijo).
 * - A full salón warns but never blocks (as `sobre_capacidad` of ninos_checkin).
 * - The arrival queue puts whoever told the table first on top.
 */
import { salonParaHijo, type HijoEncontrado, type PadreDeFamilia, type SalonFila } from './familias-vista'
import type { FamiliaLlegando, PreregistroLlegando } from './precheck'
import { edadEnMeses } from './sugerir-salon'

/** A ninos_ocupacion row as the screen reads it. */
export type OcupacionSalon = { salon_id: string; nombre: string; presentes: number; capacidad: number }

/** Child id → pickup code, for the children already checked in to the service. */
export type Ingresados = Readonly<Record<string, string>>

export function hijoMarcable(h: HijoEncontrado, ingresados: Ingresados): boolean {
  return h.tiene_ficha && !ingresados[h.id]
}

/** The children that go in with "Registrar ingreso": all that can, minus the unchecked ones. */
export function hijosMarcados(
  hijos: readonly HijoEncontrado[],
  ingresados: Ingresados,
  desmarcados: ReadonlySet<string>,
): HijoEncontrado[] {
  return hijos.filter((h) => hijoMarcable(h, ingresados) && !desmarcados.has(h.id))
}

export type SalonDeHijo = { salonId: string | null; origen: 'manual' | 'elegido' | 'sugerido' | 'ninguno' }

/** The salón a child goes to; `manual` is the one picked by hand ('' = none). */
export function salonDeHijo(h: HijoEncontrado, salones: readonly SalonFila[], fechaServicio: string, manual?: string): SalonDeHijo {
  if (manual) return { salonId: manual, origen: 'manual' }
  const r = salonParaHijo(h, salones, fechaServicio)
  return r.tipo === 'ninguno' ? { salonId: null, origen: 'ninguno' } : { salonId: r.salon.id, origen: r.tipo }
}

export type EstadoCupo = 'libre' | 'casi' | 'lleno'

/** From this share of the capacity a salón reads "casi lleno". */
export const UMBRAL_CASI_LLENO = 0.8

/** Capacity is always > 0 (ninos_salones CHECK). */
export function estadoCupo(presentes: number, capacidad: number): EstadoCupo {
  if (presentes >= capacidad) return 'lleno'
  if (presentes >= capacidad * UMBRAL_CASI_LLENO) return 'casi'
  return 'libre'
}

export type ResumenCheckin = { adentro: number; llenos: number; enCamino: number }

/** "N niños adentro · N salón lleno · N familias en camino". */
export function resumenCheckin(ocupacion: readonly OcupacionSalon[] | null, enCamino: number): ResumenCheckin {
  const filas = ocupacion ?? []
  return {
    adentro: filas.reduce((total, o) => total + o.presentes, 0),
    llenos: filas.filter((o) => estadoCupo(o.presentes, o.capacidad) === 'lleno').length,
    enCamino,
  }
}

/** The campus of the screen's salones, each named once. */
export function nombreCampus(nombres: readonly string[]): string | null {
  const unicos = [...new Set(nombres.filter(Boolean))]
  return unicos.length ? unicos.join(', ') : null
}

export type ItemCola =
  | { tipo: 'familia'; clave: string; avisadoAt: string; familia: FamiliaLlegando }
  | { tipo: 'preregistro'; clave: string; avisadoAt: string; preregistro: PreregistroLlegando }

function instante(iso: string): number {
  const t = Date.parse(iso)
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t
}

/** Families on their way and QR pre-registrations that said "¿Vienen hoy?", first notice on top. */
export function ordenarCola(familias: readonly FamiliaLlegando[], preregistros: readonly PreregistroLlegando[]): ItemCola[] {
  const items: ItemCola[] = [
    ...familias.map((familia): ItemCola => ({ tipo: 'familia', clave: familia.padre.id, avisadoAt: familia.avisadoAt, familia })),
    ...preregistros.map((preregistro): ItemCola => ({
      tipo: 'preregistro',
      clave: preregistro.preregistroId,
      avisadoAt: preregistro.avisadoAt,
      preregistro,
    })),
  ]
  // Array.prototype.sort is stable: entries without a time keep their order at the end.
  return items.sort((a, b) => {
    const ta = instante(a.avisadoAt)
    const tb = instante(b.avisadoAt)
    return ta === tb ? 0 : ta < tb ? -1 : 1
  })
}

export type PersonaRetiro = { nombre: string; relacion: string | null }

/** "Pueden retirar": the parents, then each authorised person of the children once (by name). */
export function quienesRetiran(padres: readonly PadreDeFamilia[], hijos: readonly HijoEncontrado[]): PersonaRetiro[] {
  const lista: PersonaRetiro[] = padres.map((p) => ({ nombre: `${p.nombre} ${p.apellido}`.trim(), relacion: 'representante' }))
  const vistos = new Set(lista.map((p) => p.nombre.toLowerCase()))
  for (const a of hijos.flatMap((h) => h.autorizados)) {
    const clave = a.nombre.trim().toLowerCase()
    if (!clave || vistos.has(clave)) continue
    vistos.add(clave)
    lista.push({ nombre: a.nombre.trim(), relacion: a.relacion })
  }
  return lista
}

export function iniciales(nombre: string, apellido: string): string {
  return [nombre, apellido]
    .map((p) => p.trim().charAt(0).toUpperCase())
    .join('')
}

/** "5 años", "1 año", "8 meses" on the service date; null without a birth date. */
export function edadCorta(fechaNacimiento: string | null, fechaServicio: string): string | null {
  const meses = edadEnMeses(fechaNacimiento, fechaServicio)
  if (meses === null) return null
  if (meses < 12) return `${meses} ${meses === 1 ? 'mes' : 'meses'}`
  const anos = Math.floor(meses / 12)
  return `${anos} ${anos === 1 ? 'año' : 'años'}`
}

/** Width of the occupancy bar, in percent of the capacity (100 when full or over). */
export function porcentajeCupo(presentes: number, capacidad: number): number {
  return Math.min(100, Math.round((presentes / capacidad) * 100))
}

const rango = (min: number, max: number, unidad: string): string => (min === max ? `${min} ${unidad}` : `${min} a ${max} ${unidad}`)

/** Who a salón is for, in the "Cambiar salón" panel: "0 a 11 meses", "1 a 2 años", "1.º a 3.º grado". */
export function rangoSalon(s: SalonFila): string | null {
  if (s.es_necesidades_especiales) return 'Necesidades especiales'
  if (s.grado_min !== null && s.grado_max !== null) {
    return s.grado_min === s.grado_max ? `${s.grado_min}.º grado` : `${s.grado_min}.º a ${s.grado_max}.º grado`
  }
  if (s.edad_min_meses !== null && s.edad_max_meses !== null) {
    if (s.edad_max_meses < 24) return rango(s.edad_min_meses, s.edad_max_meses, 'meses')
    const desde = Math.floor(s.edad_min_meses / 12)
    const hasta = Math.floor(s.edad_max_meses / 12)
    return rango(desde, hasta, 'años')
  }
  return null
}

export type TeclaAtajo = { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean }

/** Desktop "/" shortcut: focus the family search unless the user is typing or a panel is open. */
export function atajoBuscar(e: TeclaAtajo, contexto: { enCampo: boolean; panelAbierto: boolean }): boolean {
  return e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !contexto.enCampo && !contexto.panelAbierto
}
