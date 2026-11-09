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
 * Among the rooms that fit, the lowest `orden` with room is taken. There is
 * no balancing across rooms (S9.5, L34: the room goes by age and grade, it is
 * not shared out evenly), so the carpeta "distribución" is not read.
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
    const abiertos = candidatos.filter((s) => s.abierto !== false)
    const ocupados = (s: S) => (input.ocupados ? (input.ocupados[s.id] ?? 0) : undefined)
    const disponibles = abiertos.filter((s) => tieneLugar(s, ocupados(s), input.visitante === true))
    const elegido = disponibles[0]
    const estado: EstadoSugerencia = elegido ? 'asignado' : abiertos.length ? 'lleno' : 'cerrado'
    return { salon: elegido ?? null, estado, criterio, candidatos, disponibles }
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

  return { salon: null, estado: 'ninguno', criterio: null, candidatos: [], disponibles: [] }
}

export function sugerirSalon<S extends SalonSugerible>(input: SugerirSalonInput<S>): S | null {
  return explicarSalon(input).salon
}

/**
 * What keeps a child out of every room (S9.6, L38: "Pide completar el dato
 * que falta"), only when no room fits (estado 'ninguno'):
 *  - grado: the age is known, the child is older than every Waumba room and
 *    there are grade rooms, so the grade is what is missing;
 *  - fecha_o_grado: neither the birth date nor the grade is known;
 *  - revisar: the data is there but no room admits it (an age outside every
 *    range, a grade without a room).
 * Null when some room fits, even if all of them are closed or full.
 */
export type DatoFaltante = 'grado' | 'fecha_o_grado' | 'revisar'

export function datoFaltante<S extends SalonSugerible>(
  input: Pick<SugerirSalonInput<S>, 'fechaNacimiento' | 'grado' | 'necesidadesEspeciales' | 'fechaServicio' | 'salones'>,
): DatoFaltante | null {
  if (explicarSalon(input).estado !== 'ninguno') return null
  const edadConocida = edadEnMeses(input.fechaNacimiento, input.fechaServicio) !== null
  if (!edadConocida && input.grado === null) return 'fecha_o_grado'
  if (!edadConocida || input.grado !== null) return 'revisar'
  const activos = input.salones.filter((s) => s.activo)
  const hayGrados = activos.some((s) => s.area === 'upstreet' && (s.gradoMin !== null || s.gradoMax !== null))
  const mayorQueWaumba = activos
    .filter((s) => s.area === 'waumba' && !s.esNecesidadesEspeciales && (s.edadMinMeses !== null || s.edadMaxMeses !== null))
    .every((s) => s.edadMaxMeses !== null && (edadParaSalon(input.fechaNacimiento, input.fechaServicio, s) ?? 0) > s.edadMaxMeses)
  return hayGrados && mayorQueWaumba ? 'grado' : 'revisar'
}

/** reglas: the rooms that admit the child; sin_datos: no age and no grade; ninguno: age or grade known but no room admits them. */
export type MotivoSalones = 'reglas' | 'sin_datos' | 'ninguno'

export interface SalonesDelNino<S extends SalonSugerible> {
  /** Active rooms by `orden`; closed and full ones included (the caller marks them). */
  readonly salones: readonly S[]
  readonly motivo: MotivoSalones
}

/**
 * The rooms a child may be placed in by hand (S9.5, L34: "no se puede colocar
 * a alguien de maternal en un salon que no corresponda y viceversa"): the
 * candidates of explicarSalon, by the same steps (necesidades › grado › edad).
 * A child without age and grade cannot be checked against the rules, and a
 * child no room admits gets none: both get every active room here with
 * their motivo, for the ficha's «Nivel»; the desk and Familias ask for the
 * missing data instead (salonesDelHijo, S9.6).
 */
export function salonesQueCorresponden<S extends SalonSugerible>(
  input: Pick<SugerirSalonInput<S>, 'fechaNacimiento' | 'grado' | 'necesidadesEspeciales' | 'fechaServicio' | 'salones'>,
): SalonesDelNino<S> {
  const activos = porOrden(input.salones.filter((s) => s.activo))
  if (edadEnMeses(input.fechaNacimiento, input.fechaServicio) === null && input.grado === null) return { salones: activos, motivo: 'sin_datos' }
  const { candidatos } = explicarSalon(input)
  return candidatos.length ? { salones: candidatos, motivo: 'reglas' } : { salones: activos, motivo: 'ninguno' }
}
