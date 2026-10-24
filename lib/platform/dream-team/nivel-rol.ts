/**
 * Dream Team — the authority level of a rol (odd/tasks/uno-a-uno.md, T1).
 *
 * A rol keeps its display label ("Entrenador", "Operador de cámara") and carries
 * a separate level. The classifier below suggests a level from a label with the
 * same label sets grants.ts uses, and the migration
 * 20261015100000_dream_team_nivel_rol.sql backfilled the existing roles with
 * this exact order: director, then coordinador, then the lead labels, else
 * voluntario. Coordinador is checked before the lead set because that set also
 * contains it.
 */
import { DIRECTOR_ROLE_LABELS, LEAD_ROLE_LABELS, normalizeLabel } from '@/lib/platform/dream-team/grants'
import type { DreamTeamNivelRol } from '@/lib/platform/dream-team/types'

export interface NivelRolOpcion {
  readonly nivel: DreamTeamNivelRol
  readonly label: string
}

/** The four levels, highest first, with their Spanish names. */
export const NIVELES_ROL: readonly NivelRolOpcion[] = [
  { nivel: 'director', label: 'Director' },
  { nivel: 'coordinador', label: 'Coordinador' },
  { nivel: 'lider', label: 'Líder' },
  { nivel: 'voluntario', label: 'Voluntario' },
]

const COORDINADOR_LABEL = normalizeLabel('Coordinador')

/** The level a rol label suggests; an unknown label is voluntario, which leads nobody. */
export function nivelDesdeLabel(label: string): DreamTeamNivelRol {
  const normalized = normalizeLabel(label)
  if (DIRECTOR_ROLE_LABELS.has(normalized)) return 'director'
  if (normalized === COORDINADOR_LABEL) return 'coordinador'
  if (LEAD_ROLE_LABELS.has(normalized)) return 'lider'
  return 'voluntario'
}

export function esNivelRol(value: unknown): value is DreamTeamNivelRol {
  return NIVELES_ROL.some((opcion) => opcion.nivel === value)
}

export function nivelRolLabel(nivel: DreamTeamNivelRol): string {
  return NIVELES_ROL.find((opcion) => opcion.nivel === nivel)?.label ?? nivel
}
