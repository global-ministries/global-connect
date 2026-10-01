/**
 * Grupos de Vida — couples of stage directors.
 *
 * Two spouses who are both `director_etapa` of the same segment are ONE director:
 * assigning or removing a group for one of them does it for the other. The rule
 * lives in the SQL helper `conyuge_director_etapa_id` (executable by service_role
 * only), so these helpers take the admin client for the lookup.
 *
 * `director_etapa_grupos` has UNIQUE (director_etapa_id, grupo_id) (migration 20261001170000),
 * so links are written with a single atomic `ON CONFLICT DO NOTHING` upsert. The table has RLS
 * enabled and no policies, so callers pass the ADMIN client, after their own checks.
 * Server-side only.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cliente = SupabaseClient<any, any, any>

export type ErrorEnlaces = { message: string; code?: string }

/** PostgREST "function not found" and Postgres "undefined function". */
const CODIGOS_RPC_AUSENTE = new Set(['PGRST202', '42883'])
const TABLA = 'director_etapa_grupos'

let avisoRpcAusenteEmitido = false

/**
 * Id of the spouse's `segmento_lideres` row when both are director_etapa of the same
 * segment, else null. If the SQL helper is not deployed yet it also returns null (the
 * director is treated as single), so the deploy order is safe.
 */
export async function obtenerConyugeDirectorEtapa(
  adminClient: Cliente,
  segmentoLiderId: string,
): Promise<string | null> {
  const { data, error } = await adminClient.rpc('conyuge_director_etapa_id', {
    p_segmento_lider_id: segmentoLiderId,
  })
  if (error) {
    if (error.code && CODIGOS_RPC_AUSENTE.has(error.code)) {
      if (!avisoRpcAusenteEmitido) {
        avisoRpcAusenteEmitido = true
        console.warn('[directores-pareja] conyuge_director_etapa_id no existe; se trata al director como individual')
      }
      return null
    }
    throw new Error(error.message)
  }
  return typeof data === 'string' ? data : null
}

/** `[directorId]`, or `[directorId, conyugeId]` for a couple. */
export async function idsDirectorConPareja(adminClient: Cliente, segmentoLiderId: string): Promise<string[]> {
  const conyugeId = await obtenerConyugeDirectorEtapa(adminClient, segmentoLiderId)
  return conyugeId ? [segmentoLiderId, conyugeId] : [segmentoLiderId]
}

/**
 * Links every director in `directorIds` to every group in `grupoIds`, in ONE atomic statement
 * (`INSERT ... ON CONFLICT (director_etapa_id, grupo_id) DO NOTHING`): all the missing links are
 * written or none, so a couple is never left half-linked, and links that already exist (or that a
 * concurrent request just created) are skipped. Needs UNIQUE (director_etapa_id, grupo_id), which
 * migration 20261001170000 adds; deploy it before this code.
 */
export async function asegurarEnlacesDirectorGrupo(
  adminClient: Cliente,
  directorIds: string[],
  grupoIds: string[],
): Promise<ErrorEnlaces | null> {
  if (directorIds.length === 0 || grupoIds.length === 0) return null

  const filas = directorIds.flatMap((directorId) =>
    grupoIds.map((grupoId) => ({ director_etapa_id: directorId, grupo_id: grupoId })),
  )
  const { error } = await adminClient
    .from(TABLA)
    .upsert(filas, { onConflict: 'director_etapa_id,grupo_id', ignoreDuplicates: true })
  return error ?? null
}

/** Removes the links of every director in `directorIds` to the groups in `grupoIds`. */
export async function quitarEnlacesDirectorGrupo(
  adminClient: Cliente,
  directorIds: string[],
  grupoIds: string[],
): Promise<ErrorEnlaces | null> {
  if (directorIds.length === 0 || grupoIds.length === 0) return null
  const { error } = await adminClient.from(TABLA).delete().in('director_etapa_id', directorIds).in('grupo_id', grupoIds)
  return error ?? null
}
