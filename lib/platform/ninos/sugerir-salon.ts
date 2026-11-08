/**
 * Suggests the room (ninos_salones) for a child at check-in.
 *
 * Rules (odd/tasks/ninos-checkin.md, N2):
 *  - A child with special needs whose age falls in a Waumba range goes to the
 *    special-needs room (Waumba Land Plus).
 *  - Otherwise the school grade picks the UpStreet room when one matches.
 *  - Otherwise the age in months on the service date picks the Waumba room.
 * Ties go to the lowest `orden`. Inactive rooms are never suggested.
 *
 * Salón rules (odd/tasks/ninos-checkin-pco.md, T1d, S5, S8.3, S8.4), all
 * optional so a caller without them gets the suggestion above unchanged:
 *  - `abierto: false`: the room is closed; it is never suggested.
 *  - Fecha de corte / promoción: the age is taken on the room's reference
 *    date (`fechaReferencia`) instead of the service date, so a child moves
 *    up once per cycle and not on their birthday.
 *  - Capacity, only when `ocupados` says how many children are inside: a
 *    regular fits while there are fewer than `capacidad`; a visitor (S8.3)
 *    may also take the `cupoVisitantes` places on top.
 *  - Distribution per area (the carpeta): `en_orden` takes the lowest
 *    `orden` with room; `equilibrada` the one with fewest children.
 * The first step with rooms that fit the child decides: when all of them are
 * closed or full there is no suggestion (`explicarSalon` says why).
 */

export type SalonSugerible = {
  id: string
  area: 'waumba' | 'upstreet'
  edadMinMeses: number | null
  edadMaxMeses: number | null
  gradoMin: number | null
  gradoMax: number | null
  esNecesidadesEspeciales: boolean
  activo: boolean
  orden: number
  /** Default true. */
  abierto?: boolean
  /** Regulars' quota (ninos_salones.capacidad). */
  capacidad?: number
  /** Places kept for visitors on top of `capacidad`. Default 0. */
  cupoVisitantes?: number
  corteMes?: number | null
  corteDia?: number | null
  promocionMes?: number | null
  promocionDia?: number | null
}

export type AreaSalon = SalonSugerible['area']
export type Distribucion = 'en_orden' | 'equilibrada'

export type SugerirSalonInput<S extends SalonSugerible> = {
  /** YYYY-MM-DD */
  fechaNacimiento: string | null
  /** PreK = 0, 1st–6th = 1..6 */
  grado: number | null
  necesidadesEspeciales: boolean
  /** YYYY-MM-DD */
  fechaServicio: string
  salones: readonly S[]
  /** Visitor (S8.3: before their 4th visit): may use the visitor places. */
  visitante?: boolean
  /** Children inside each room (by id); without it the capacity is not checked. */
  ocupados?: Readonly<Record<string, number>>
  /** The carpeta's distribution per area; default `en_orden`. */
  distribucion?: Partial<Record<AreaSalon, Distribucion>>
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

function parseFecha(value: string | null): { y: number; m: number; d: number } | null {
  const match = value ? ISO_DATE.exec(value) : null
  if (!match) return null
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])]
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  return { y, m, d }
}

/** Completed months between the birth date and the service date; null if unknown or in the future. */
export function edadEnMeses(fechaNacimiento: string | null, fechaServicio: string): number | null {
  const nacimiento = parseFecha(fechaNacimiento)
  const servicio = parseFecha(fechaServicio)
  if (!nacimiento || !servicio) return null
  let meses = (servicio.y - nacimiento.y) * 12 + (servicio.m - nacimiento.m)
  if (servicio.d < nacimiento.d) meses -= 1
  return meses < 0 ? null : meses
}

/** YYYY-MM-DD of a calendar day; a day past the end of the month becomes its last day (29 Feb → 28 Feb). */
function diaDelAnio(anio: number, mes: number, dia: number): string {
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate()
  return `${anio}-${String(mes).padStart(2, '0')}-${String(Math.min(dia, ultimo)).padStart(2, '0')}`
}

/** The last date on (month, day) that is not after `fecha`. */
function ultimaFecha(mes: number, dia: number, fecha: string): string {
  const anio = Number(fecha.slice(0, 4))
  const esteAnio = diaDelAnio(anio, mes, dia)
  return esteAnio <= fecha ? esteAnio : diaDelAnio(anio - 1, mes, dia)
}

/** The first date on (month, day) that is not before `fecha`. */
function primeraFecha(mes: number, dia: number, fecha: string): string {
  const anio = Number(fecha.slice(0, 4))
  const esteAnio = diaDelAnio(anio, mes, dia)
  return esteAnio >= fecha ? esteAnio : diaDelAnio(anio + 1, mes, dia)
}

/**
 * The date the room measures the age on (YYYY-MM-DD):
 *  - no rule: the service date;
 *  - corte and promoción: the corte of the cycle that started on the last
 *    promoción (corte 1 dic, promoción 1 ago: from 1 ago 2026 every service
 *    uses 1 dic 2026, so a child who turns 4 before 1 dic is 4 all the cycle);
 *  - only a corte: the last corte; only a promoción: the last promoción.
 */
export function fechaReferencia(
  salon: Pick<SalonSugerible, 'corteMes' | 'corteDia' | 'promocionMes' | 'promocionDia'>,
  fechaServicio: string,
): string {
  const corte = salon.corteMes && salon.corteDia ? { mes: salon.corteMes, dia: salon.corteDia } : null
  const promocion = salon.promocionMes && salon.promocionDia ? { mes: salon.promocionMes, dia: salon.promocionDia } : null
  if (corte && promocion) return primeraFecha(corte.mes, corte.dia, ultimaFecha(promocion.mes, promocion.dia, fechaServicio))
  if (corte) return ultimaFecha(corte.mes, corte.dia, fechaServicio)
  if (promocion) return ultimaFecha(promocion.mes, promocion.dia, fechaServicio)
  return fechaServicio
}

/**
 * The child's age in months for this room: on its reference date. Null when
 * the birth date is unknown or after the service; a child born after the
 * reference date (a baby after the last corte) counts as 0.
 */
export function edadParaSalon(
  fechaNacimiento: string | null,
  fechaServicio: string,
  salon: Pick<SalonSugerible, 'corteMes' | 'corteDia' | 'promocionMes' | 'promocionDia'>,
): number | null {
  if (edadEnMeses(fechaNacimiento, fechaServicio) === null) return null
  return edadEnMeses(fechaNacimiento, fechaReferencia(salon, fechaServicio)) ?? 0
}

function enRango(valor: number, min: number | null, max: number | null): boolean {
  return (min ?? Number.NEGATIVE_INFINITY) <= valor && valor <= (max ?? Number.POSITIVE_INFINITY)
}

const porOrden = <S extends SalonSugerible>(salones: readonly S[]): S[] => [...salones].sort((a, b) => a.orden - b.orden)

/** How the room was found: special needs, school grade or age. */
export type CriterioSalon = 'necesidades' | 'grado' | 'edad'

/** asignado: `salon` is the suggestion; cerrado / lleno: rooms fit but none is open / has room; ninguno: no room fits. */
export type EstadoSugerencia = 'asignado' | 'cerrado' | 'lleno' | 'ninguno'

export interface ExplicacionSalon<S extends SalonSugerible> {
  readonly salon: S | null
  readonly estado: EstadoSugerencia
  readonly criterio: CriterioSalon | null
  /** Active rooms that fit the child by `criterio`, by `orden`. */
  readonly candidatos: readonly S[]
  /** The open candidates with room for this child. */
  readonly disponibles: readonly S[]
  readonly distribucion: Distribucion
}

/** Whether the room has a place for this child (always, when the occupancy is unknown). */
export function tieneLugar(salon: SalonSugerible, ocupados: number | undefined, visitante: boolean): boolean {
  if (ocupados === undefined || salon.capacidad === undefined) return true
  return ocupados < salon.capacidad + (visitante ? (salon.cupoVisitantes ?? 0) : 0)
}

/** The suggestion with the reason: which step decided, which rooms fit and why none was taken. */
export function explicarSalon<S extends SalonSugerible>(input: SugerirSalonInput<S>): ExplicacionSalon<S> {
  const activos = input.salones.filter((s) => s.activo)

  const salonPorEdad = (s: S) => {
    if (s.area !== 'waumba' || s.esNecesidadesEspeciales || (s.edadMinMeses === null && s.edadMaxMeses === null)) return false
    const edad = edadParaSalon(input.fechaNacimiento, input.fechaServicio, s)
    return edad !== null && enRango(edad, s.edadMinMeses, s.edadMaxMeses)
  }

  const decidir = (criterio: CriterioSalon, encajan: readonly S[]): ExplicacionSalon<S> => {
    const candidatos = porOrden(encajan)
    const distribucion = input.distribucion?.[candidatos[0].area] ?? 'en_orden'
    const abiertos = candidatos.filter((s) => s.abierto !== false)
    const ocupados = (s: S) => (input.ocupados ? (input.ocupados[s.id] ?? 0) : undefined)
    const disponibles = abiertos.filter((s) => tieneLugar(s, ocupados(s), input.visitante === true))
    // Array.prototype.sort is stable: equal counts keep the `orden`.
    const elegido =
      distribucion === 'equilibrada' ? [...disponibles].sort((a, b) => (ocupados(a) ?? 0) - (ocupados(b) ?? 0))[0] : disponibles[0]
    const estado: EstadoSugerencia = elegido ? 'asignado' : abiertos.length ? 'lleno' : 'cerrado'
    return { salon: elegido ?? null, estado, criterio, candidatos, disponibles, distribucion }
  }

  if (input.necesidadesEspeciales && activos.some(salonPorEdad)) {
    const plus = activos.filter((s) => s.area === 'waumba' && s.esNecesidadesEspeciales)
    if (plus.length) return decidir('necesidades', plus)
  }

  if (input.grado !== null) {
    const grado = input.grado
    const porGrado = activos.filter(
      (s) => s.area === 'upstreet' && (s.gradoMin !== null || s.gradoMax !== null) && enRango(grado, s.gradoMin, s.gradoMax),
    )
    if (porGrado.length) return decidir('grado', porGrado)
  }

  const porEdad = activos.filter(salonPorEdad)
  if (porEdad.length) return decidir('edad', porEdad)

  return { salon: null, estado: 'ninguno', criterio: null, candidatos: [], disponibles: [], distribucion: 'en_orden' }
}

export function sugerirSalon<S extends SalonSugerible>(input: SugerirSalonInput<S>): S | null {
  return explicarSalon(input).salon
}
