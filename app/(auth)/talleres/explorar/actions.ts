'use server'

/**
 * PR18 — DT-072 — Server actions for participante surface.
 *
 * Currently exposes one action:
 *   - `inscribirseATaller({ tallerId, cohorteId, companeroId?, linkType? })`
 *
 * Capability gate: NONE beyond an authenticated session (finding #1,
 * Option B). Self-enroll is how a user becomes a participant, so gating
 * it on `participation.read` was a chicken-and-egg trap. The gate is
 * `requireTalleresApiAuthenticated` (kill switch + auth only); the RLS
 * `WITH CHECK` term is the security wall — it forces `estado='pendiente'`
 * + persona=self + pareja validation. Approval still needs a write cap.
 *
 * Revalidates /talleres/explorar and /talleres/mis-talleres after
 * success so the participant's view reflects the new inscription.
 */

import { revalidatePath } from 'next/cache'

import { requireTalleresApiAuthenticated } from '@/lib/platform/talleres/api-helpers'
import { isTalleresEnabled } from '@/lib/platform/talleres/flags'

export interface InscribirseInput {
  readonly tallerId: string
  readonly cohorteId: string
  readonly companeroId?: string | null
  readonly linkType?: 'matrimonio' | 'novios' | null
}

export type InscribirseResult =
  | { readonly ok: true; readonly inscripcionId: string }
  | { readonly ok: false; readonly error: 'not-found' | 'invalid-input' | 'unauthorized' | 'forbidden' | 'internal'; readonly message?: string }

export async function inscribirseATaller(input: InscribirseInput): Promise<InscribirseResult> {
  if (!isTalleresEnabled()) return { ok: false, error: 'not-found' }
  if (!input?.tallerId || !input?.cohorteId) {
    return { ok: false, error: 'invalid-input' }
  }

  const gate = await requireTalleresApiAuthenticated()
  if (!gate.ok) {
    // Map the gate's response status to our domain error code.
    if (gate.response.status === 404) return { ok: false, error: 'not-found' }
    if (gate.response.status === 401) return { ok: false, error: 'unauthorized' }
    if (gate.response.status === 403) return { ok: false, error: 'forbidden' }
    return { ok: false, error: 'internal' }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = gate.supabase

  // Resolve auth_id → internal usuarios.id (FK target).
  // gate.userId is the auth.users.id (auth.uid); the FK
  // taller_inscripciones.persona_principal_id points to public.usuarios.id,
  // so we MUST resolve before insert. Canonical pattern matches
  // lib/actions/support.actions.ts:311, lib/actions/solicitudes-grupo.actions.ts:167,
  // lib/actions/support-capabilities.actions.ts:46.
  const { data: usuario, error: usuarioError } = await client
    .from('usuarios')
    .select('id')
    .eq('auth_id', gate.userId)
    .maybeSingle()

  if (usuarioError) {
    return { ok: false, error: 'internal', message: `resolve usuario: ${usuarioError.message}` }
  }
  if (!usuario?.id) {
    return { ok: false, error: 'internal', message: 'usuario interno no encontrado para auth.uid' }
  }

  const { data, error } = await client
    .from('taller_inscripciones')
    .insert({
      taller_id: input.tallerId,
      cohorte_id: input.cohorteId,
      persona_principal_id: usuario.id,
      companero_id: input.companeroId ?? null,
      link_type: input.linkType ?? null,
      estado: 'pendiente',
    })
    .select('id')
    .single()

  if (error || !data) {
    return {
      ok: false,
      error: 'internal',
      message: error?.message ?? 'insert failed',
    }
  }

  revalidatePath('/talleres/explorar')
  revalidatePath('/talleres/mis-talleres')
  return { ok: true, inscripcionId: data.id as string }
}
