/**
 * W13 — DT-082 — Field-projection loader for public roadmap (P6, D18).
 *
 * NEVER exposes resumen or notas in the public roadmap.
 * Implements field-projection before serialization.
 *
 * Uses auth.uid() directly — NOT public.current_persona_id().
 */

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { findPlatformSessionPersonaByAuthId, resolveReadOnlyPlatformSession } from '@/lib/auth/platformSessionReadOnly'
import { requirePastoralSession, hasPastoralOneOnOneReadCapability } from '@/lib/platform/pastoral/route-access'
import { suggestNextStep } from './next-step-suggestion'
import type { PublicRoadmap, PublicRoadmapOneOnOne, PublicRoadmapStep } from './types'

// ─── Read guard (P6) ─────────────────────────────────────────────────────────

/**
 * Verifies the actor can read the roadmap of the given assistedPersonaId.
 * Allowed: actor == assisted, mentor author, director, pastor/admin.
 */
async function canAccessRoadmap(actorPersonaId: string, assistedPersonaId: string): Promise<boolean> {
  // Actor is the assisted person
  if (actorPersonaId === assistedPersonaId) return true

  // pastor/admin (pastoral.read.all) can read any roadmap
  const session = await requirePastoralSession()
  if (!session) return false
  if (hasPastoralOneOnOneReadCapability(session)) return true

  // TODO: director check — deferred (requires director relationship query)
  return false
}

// ─── Field projection ─────────────────────────────────────────────────────────

/**
 * Projects a raw 1:1 row into a PublicRoadmapOneOnOne.
 * Strips resumen and notas (never exposed publicly, P6).
 */
function projectOneOnOne(row: {
  id: string
  estado: string
  scheduled_at: string | null
  completed_at: string | null
  pasos_validados?: Array<{ id: string; step_key: string; validated_at: string; is_shared_milestone: boolean }>
}): PublicRoadmapOneOnOne {
  return {
    id: row.id,
    estado: row.estado,
    scheduledAtIso: row.scheduled_at ?? null,
    completedAtIso: row.completed_at ?? null,
    pasosValidados: (row.pasos_validados ?? []).map(
      (p): PublicRoadmapStep => ({
        id: p.id,
        stepKey: p.step_key,
        validatedAtIso: p.validated_at,
        isSharedMilestone: p.is_shared_milestone,
      })
    ),
    resumen: null, // NEVER exposed (P6)
    notas: null,   // NEVER exposed (P6)
  }
}

// ─── Loader ──────────────────────────────────────────────────────────────────

export interface LoadPublicRoadmapOptions {
  readonly assistedPersonaId: string
}

/**
 * Loads the public roadmap for an assisted person.
 * Applies field-projection (D18) — strips resumen and notas.
 * Uses auth.uid() directly.
 *
 * Returns null if actor cannot access the roadmap.
 */
export async function loadPublicRoadmap(
  options: LoadPublicRoadmapOptions
): Promise<PublicRoadmap | null> {
  const supabase = await createSupabaseServerClient()

  // Resolve actor persona from session
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return null

  const session = await resolveReadOnlyPlatformSession({
    subjectAuthId: user.id,
    findPersonaByAuthId: (authId) => findPlatformSessionPersonaByAuthId(supabase, authId),
  })
  if (!session) return null

  const actorPersonaId = session.personaId

  // P6 guard: check access
  const canAccess = await canAccessRoadmap(actorPersonaId, options.assistedPersonaId)
  if (!canAccess) return null

  // Fetch 1:1 sessions where assisted is a participant
  // Only public fields: id, estado, scheduled_at, completed_at, pasos_validados
  const { data: rows, error } = await supabase
    .from('pastoral_one_on_one')
    .select(`
      id,
      estado,
      scheduled_at,
      completed_at,
      pastoral_one_on_one_pasos_validados (
        id,
        step_key,
        validated_at,
        is_shared_milestone
      )
    `)
    .contains('participantes_persona_ids', [options.assistedPersonaId])
    .order('scheduled_at', { ascending: false })

  if (error || !rows) return null

  const sesiones = (rows as unknown[]).map((r) =>
    projectOneOnOne(r as {
      id: string
      estado: string
      scheduled_at: string | null
      completed_at: string | null
      pasos_validados?: Array<{
        id: string
        step_key: string
        validated_at: string
        is_shared_milestone: boolean
      }>
    })
  )

  // Collect all validated steps (for shared milestones only, P9)
  const pasosShared = sesiones.flatMap((s) =>
    s.pasosValidados.filter((p) => p.isSharedMilestone)
  )

  // Next upcoming (non-terminal)
  const terminalStates = new Set(['completed', 'cancelled'])
  const proximo = sesiones.find((s) => !terminalStates.has(s.estado)) ?? null

  // Build roadmap
  const roadmap: PublicRoadmap = {
    assistedPersonaId: options.assistedPersonaId,
    sesiones,
    proximoUnoAuno: proximo,
    pasosValidadosTotal: pasosShared,
    proximoPasoSugerido: null, // filled below
    generatedAtIso: new Date().toISOString(),
  }

  roadmap.proximoPasoSugerido = suggestNextStep(roadmap)

  return roadmap
}
