/**
 * Estudiantes — the caller's menu facts (C4 of odd/tasks/estudiantes-fase-b.md)
 * from estudiantes_acceso() (supabase/migrations/20261101100000_estudiantes_vivo_acceso.sql),
 * computed once by the (auth) layout like the Niños flags, and the entries of
 * the "Estudiantes" menu section they open:
 * - "Mi grupo" / "Mis grupos" → /estudiantes, for whoever sees an active
 *   group. The label follows the page title: "Mis grupos" when they see more
 *   than one.
 * - "En vivo" → /estudiantes/vivo: live view of some Transit / Inside Out
 *   ámbito (sub-área level >= 2).
 * - "Grupos" → /estudiantes/grupos: group management (level 3 somewhere).
 * - "Voluntarios" → /estudiantes/voluntarios (C5): the caller may mark some
 *   Transit, Inside Out or The Living Room volunteer
 *   (estudiantes_puede_marcar_voluntarios(), a second call of the layout,
 *   merged by `conVoluntarios`).
 *
 * Fails closed: an error, no session (NULL) or an unexpected payload means no
 * access.
 */

export interface AccesoEstudiantes {
  /** Active groups the caller sees. */
  readonly grupos: number
  /** The caller leads an active group. */
  readonly lidera: boolean
  readonly vivo: boolean
  readonly gestiona: boolean
  /** May mark volunteers (C5); absent = no. */
  readonly voluntarios?: boolean
}

export const SIN_ACCESO_ESTUDIANTES: AccesoEstudiantes = { grupos: 0, lidera: false, vivo: false, gestiona: false }

export function parsearAccesoEstudiantes(
  resultado: { readonly data: unknown; readonly error: unknown } | null | undefined,
): AccesoEstudiantes {
  if (!resultado || resultado.error || !resultado.data || typeof resultado.data !== 'object' || Array.isArray(resultado.data)) {
    return SIN_ACCESO_ESTUDIANTES
  }
  const { grupos, lidera, vivo, gestiona } = resultado.data as Record<string, unknown>
  return {
    grupos: typeof grupos === 'number' && Number.isInteger(grupos) && grupos > 0 ? grupos : 0,
    lidera: lidera === true,
    vivo: vivo === true,
    gestiona: gestiona === true,
  }
}

/** Adds the Voluntarios fact when estudiantes_puede_marcar_voluntarios() is true; otherwise `acceso` as it was. */
export function conVoluntarios(
  acceso: AccesoEstudiantes,
  resultado: { readonly data: unknown; readonly error: unknown } | null | undefined,
): AccesoEstudiantes {
  return resultado && !resultado.error && resultado.data === true ? { ...acceso, voluntarios: true } : acceso
}

export interface EntradaMenuEstudiantes {
  readonly id: 'estudiantes-mi-grupo' | 'estudiantes-vivo' | 'estudiantes-grupos' | 'estudiantes-voluntarios'
  readonly label: string
  readonly href: string
}

export function entradasMenuEstudiantes(acceso: AccesoEstudiantes): EntradaMenuEstudiantes[] {
  const entradas: EntradaMenuEstudiantes[] = []
  if (acceso.grupos > 0) {
    entradas.push({ id: 'estudiantes-mi-grupo', label: acceso.grupos > 1 ? 'Mis grupos' : 'Mi grupo', href: '/estudiantes' })
  }
  if (acceso.vivo) entradas.push({ id: 'estudiantes-vivo', label: 'En vivo', href: '/estudiantes/vivo' })
  if (acceso.gestiona) entradas.push({ id: 'estudiantes-grupos', label: 'Grupos', href: '/estudiantes/grupos' })
  if (acceso.voluntarios) entradas.push({ id: 'estudiantes-voluntarios', label: 'Voluntarios', href: '/estudiantes/voluntarios' })
  return entradas
}
