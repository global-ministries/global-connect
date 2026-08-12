/**
 * W10 — DT-059 — Taller (short-term group) mentor adapter (Supabase implementation).
 *
 * PR13 — DT-049 — Body completed for Fase 5. The resolver walks the canonical
 * Fase 5 tables (taller_inscripciones → taller_cohortes → taller_grupos →
 * taller_grupo_asignaciones) to find the líder of the first active group
 * the persona is enrolled in.
 *
 * F4's mentor-cascade.ts (line 81-90) consumes this adapter; the
 * signature `resolverLiderDeTaller(personaId): Promise<string | null>`
 * is preserved.
 *
 * Fallback behavior: if no Fase 5 path resolves, fall back to the
 * dream_team_servicios join (Fase 2) — personas can still be linked
 * to a "talleres_crecimiento" team via a Dream Team role. This dual-path
 * behavior is what makes the adapter forward-compatible with the team's
 * organizational structure.
 *
 * Self-mentor guard: never returns personaId (a persona cannot mentor
 * themselves; this would short-circuit the cascade).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import type { GrupoCortoPlazoMentorAdapter } from '@/lib/platform/pastoral/mentor-cascade/types'

type DbClient = SupabaseClient<Database, 'public'>

interface InscripcionRow {
  readonly id: string
  readonly taller_id: string
  readonly cohorte_id: string | null
}

interface GrupoRow {
  readonly id: string
}

interface LiderRow {
  readonly persona_id: string
}

/**
 * Pure helper: walks the canonical Fase 5 chain to find a lider de
 * taller for the given persona. Returns the first non-self lider persona_id
 * found, or null. Split out as a pure helper for unit testing.
 */
export async function resolverLiderDeTallerFase5(
  supabase: DbClient,
  personaId: string,
): Promise<string | null> {
  if (!personaId?.trim()) return null

  // 1) Find the persona's active inscripciones (aprobado or completado).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase server client; column projection
  const { data: inscripciones, error: inscErr } = await (supabase as any)
    .from('taller_inscripciones')
    .select('id, taller_id, cohorte_id')
    .eq('persona_principal_id', personaId)
    .in('estado', ['aprobado', 'completado'])

  if (inscErr || !inscripciones || inscripciones.length === 0) return null

  // 2) For each inscripcion, walk cohorts → grupos → lideres.
  for (const insc of inscripciones as InscripcionRow[]) {
    if (!insc.cohorte_id) continue

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase server client
    const { data: grupos } = await (supabase as any)
      .from('taller_grupos')
      .select('id')
      .eq('cohorte_id', insc.cohorte_id)
      .in('estado', ['activo', 'completado'])

    if (!grupos || (grupos as GrupoRow[]).length === 0) continue

    for (const g of grupos as GrupoRow[]) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase server client
      const { data: lideres } = await (supabase as any)
        .from('taller_grupo_asignaciones')
        .select('persona_id')
        .eq('grupo_id', g.id)
        .eq('rol', 'lider')
        .eq('activo', true)
        .limit(1)

      for (const l of (lideres ?? []) as LiderRow[]) {
        if (l.persona_id && l.persona_id !== personaId) {
          return l.persona_id
        }
      }
    }
  }

  return null
}

/**
 * Fallback helper (Fase 2 path): queries dream_team_servicios +
 * dream_team_equipos for an active talleres_crecimiento servicio.
 * Returns the líder (Líder/Coordinador role) persona_id, or null.
 */
export async function resolverLiderDeTallerFase2(
  supabase: DbClient,
  personaId: string,
): Promise<string | null> {
  if (!personaId?.trim()) return null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase server client
  const { data: servicios, error } = await (supabase as any)
    .from('dream_team_servicios')
    .select('equipo_id, rol_id')
    .eq('persona_id', personaId)
    .eq('estado', 'activo')
    .eq('dream_team_equipos!inner(experiencia)', 'talleres_crecimiento')

  if (error || !servicios || servicios.length === 0) return null

  const servicio = servicios[0] as { equipo_id: string; rol_id: string }
  const equipoId = servicio.equipo_id

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase server client
  const { data: roles } = await (supabase as any)
    .from('dream_team_roles')
    .select('id')
    .eq('equipo_id', equipoId)
    .eq('activo', true)
    .or('label.ilike.%Líder%,label.ilike.%Coordinador%')
    .limit(1)

  if (!roles || roles.length === 0) return null

  const liderRolId = (roles[0] as { id: string }).id

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase server client
  const { data: liderServicios } = await (supabase as any)
    .from('dream_team_servicios')
    .select('persona_id')
    .eq('equipo_id', equipoId)
    .eq('rol_id', liderRolId)
    .eq('estado', 'activo')
    .limit(1)

  if (!liderServicios || liderServicios.length === 0) return null
  const liderPersonaId = (liderServicios[0] as { persona_id: string }).persona_id

  if (liderPersonaId === personaId) return null
  return liderPersonaId
}

export function createGrupoCortoPlazoMentorAdapter(
  supabase: DbClient,
): GrupoCortoPlazoMentorAdapter {
  return {
    async resolverLiderDeTaller(personaId: string): Promise<string | null> {
      // Try the canonical Fase 5 path first (inscripciones → cohortes → grupos).
      const fase5 = await resolverLiderDeTallerFase5(supabase, personaId)
      if (fase5) return fase5

      // Fallback: Fase 2 dream_team_servicios (org-chart linked team).
      return resolverLiderDeTallerFase2(supabase, personaId)
    },
  }
}
