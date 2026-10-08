/**
 * Suggests the room (ninos_salones) for a child at check-in.
 *
 * Rules (odd/tasks/ninos-checkin.md, N2):
 *  - A child with special needs whose age falls in a Waumba range goes to the
 *    special-needs room (Waumba Land Plus).
 *  - Otherwise the school grade picks the UpStreet room when one matches.
 *  - Otherwise the age in months on the service date picks the Waumba room.
 * Ties go to the lowest `orden`. Inactive rooms are never suggested.
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
}

export type SugerirSalonInput<S extends SalonSugerible> = {
  /** YYYY-MM-DD */
  fechaNacimiento: string | null
  /** PreK = 0, 1st–6th = 1..6 */
  grado: number | null
  necesidadesEspeciales: boolean
  /** YYYY-MM-DD */
  fechaServicio: string
  salones: readonly S[]
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

function enRango(valor: number, min: number | null, max: number | null): boolean {
  return (min ?? Number.NEGATIVE_INFINITY) <= valor && valor <= (max ?? Number.POSITIVE_INFINITY)
}

function primero<S extends SalonSugerible>(salones: readonly S[], cumple: (s: S) => boolean): S | null {
  return [...salones].filter(cumple).sort((a, b) => a.orden - b.orden)[0] ?? null
}

export function sugerirSalon<S extends SalonSugerible>(input: SugerirSalonInput<S>): S | null {
  const activos = input.salones.filter((s) => s.activo)
  const edad = edadEnMeses(input.fechaNacimiento, input.fechaServicio)

  const salonPorEdad = (s: S) =>
    s.area === 'waumba' &&
    !s.esNecesidadesEspeciales &&
    edad !== null &&
    (s.edadMinMeses !== null || s.edadMaxMeses !== null) &&
    enRango(edad, s.edadMinMeses, s.edadMaxMeses)

  if (input.necesidadesEspeciales && activos.some(salonPorEdad)) {
    const plus = primero(activos, (s) => s.area === 'waumba' && s.esNecesidadesEspeciales)
    if (plus) return plus
  }

  if (input.grado !== null) {
    const grado = input.grado
    const porGrado = primero(
      activos,
      (s) => s.area === 'upstreet' && (s.gradoMin !== null || s.gradoMax !== null) && enRango(grado, s.gradoMin, s.gradoMax),
    )
    if (porGrado) return porGrado
  }

  return primero(activos, salonPorEdad)
}
