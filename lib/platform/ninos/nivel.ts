/**
 * The child's level (odd/tasks/ninos-checkin.md, N12): one "Nivel" select
 * grouped by area. A Waumba Land option is a room and is stored as
 * ninos_fichas.salon_preferido_id (grado null); an UpStreet option is a
 * school grade stored as ninos_fichas.grado. "Sin indicar" ('') lets the
 * rules suggest the room by age.
 */
import type { HijoForm } from './familia'
import { sugerirSalon, type SalonSugerible } from './sugerir-salon'

export type SalonNivel = SalonSugerible & { nombre: string }

export type OpcionNivel = { valor: string; etiqueta: string }
export type GrupoNivel = { grupo: string; opciones: OpcionNivel[] }

const SALON = 'salon:'
const GRADO = 'grado:'

const GRADOS_UPSTREET: readonly OpcionNivel[] = [
  { valor: `${GRADO}0`, etiqueta: 'PreK' },
  ...[1, 2, 3, 4, 5, 6].map((g) => ({ valor: `${GRADO}${g}`, etiqueta: `${g}º grado` })),
]

function salonesWaumba(salones: readonly SalonNivel[]): SalonNivel[] {
  const nombres = new Set<string>()
  return [...salones]
    .filter((s) => s.activo && s.area === 'waumba')
    .sort((a, b) => a.orden - b.orden)
    .filter((s) => (nombres.has(s.nombre) ? false : (nombres.add(s.nombre), true)))
}

/** The options of the select, without the leading "Sin indicar". */
export function gruposNivel(salones: readonly SalonNivel[]): GrupoNivel[] {
  return [
    { grupo: 'Waumba Land', opciones: salonesWaumba(salones).map((s) => ({ valor: `${SALON}${s.id}`, etiqueta: s.nombre })) },
    { grupo: 'UpStreet', opciones: [...GRADOS_UPSTREET] },
  ]
}

/** The select value for a child: a Waumba preferred room first, then the grade, else ''. */
export function valorNivel(h: Pick<HijoForm, 'grado' | 'salonPreferidoId'>, salones: readonly SalonNivel[]): string {
  if (h.salonPreferidoId && salonesWaumba(salones).some((s) => s.id === h.salonPreferidoId)) return `${SALON}${h.salonPreferidoId}`
  if (/^[0-6]$/.test(h.grado.trim())) return `${GRADO}${h.grado.trim()}`
  return ''
}

/** Applies a select value: a room clears the grade, a grade clears the room, '' clears both. */
export function aplicarNivel(h: HijoForm, valor: string): HijoForm {
  if (valor.startsWith(SALON)) return { ...h, grado: '', salonPreferidoId: valor.slice(SALON.length) }
  if (valor.startsWith(GRADO)) return { ...h, grado: valor.slice(GRADO.length), salonPreferidoId: '' }
  return { ...h, grado: '', salonPreferidoId: '' }
}

/** The level the rules suggest from the birth date on `hoy` (YYYY-MM-DD); '' when no room fits (D4). */
export function nivelSugerido(
  h: Pick<HijoForm, 'fechaNacimiento' | 'necesidadesEspeciales'>,
  salones: readonly SalonNivel[],
  hoy: string,
): string {
  if (!h.fechaNacimiento) return ''
  const s = sugerirSalon({
    fechaNacimiento: h.fechaNacimiento,
    grado: null,
    necesidadesEspeciales: h.necesidadesEspeciales.trim() !== '',
    fechaServicio: hoy,
    salones,
  })
  if (!s) return ''
  if (s.area === 'waumba') return `${SALON}${s.id}`
  return s.gradoMin !== null ? `${GRADO}${s.gradoMin}` : ''
}
