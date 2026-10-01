/**
 * Grupos de Vida — couples of stage directors.
 *
 * Two spouses who are both `director_etapa` of the same segment are ONE director:
 * assigning or removing a group for one of them does it for the other. The rule
 * lives in the SQL helper `conyuge_director_etapa_id` (executable by service_role
 * only), so these helpers take the admin client for the lookup.
 *
 * `director_etapa_grupos` has UNIQUE (director_etapa_id, grupo_id) from migration
 * 20261001170000. Links are still inserted only after checking they do not exist, and a
 * unique violation (a concurrent request won the race) counts as success, so the code is
 * correct before and after that migration. The table has RLS enabled and no policies, so
 * callers pass the ADMIN client, after their own checks.
 * Server-side only.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cliente = SupabaseClient<any, any, any>

export type ErrorEnlaces = { message: string; code?: string }

/** Postgres unique_violation: the link already exists (created by a concurrent request). */
const CODIGO_UNIQUE_VIOLATION = '23505'

/** PostgREST "function not found" and Postgres "undefined function". */
const CODIGOS_RPC_AUSENTE = new Set(['PGRST202', '42883'])
const TABLA = 'director_etapa_grupos'
const GRUPOS_POR_CONSULTA = 200

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
 * Links every director in `directorIds` to every group in `grupoIds`, skipping the
 * links that already exist.
 */
export async function asegurarEnlacesDirectorGrupo(
  adminClient: Cliente,
  directorIds: string[],
  grupoIds: string[],
): Promise<ErrorEnlaces | null> {
  if (directorIds.length === 0 || grupoIds.length === 0) return null

  const existentes = new Set<string>()
  for (let i = 0; i < grupoIds.length; i += GRUPOS_POR_CONSULTA) {
    const { data, error } = await adminClient
      .from(TABLA)
      .select('director_etapa_id, grupo_id')
      .in('director_etapa_id', directorIds)
      .in('grupo_id', grupoIds.slice(i, i + GRUPOS_POR_CONSULTA))
    if (error) return error
    for (const fila of (data ?? []) as Array<{ director_etapa_id: string; grupo_id: string }>) {
      existentes.add(`${fila.director_etapa_id}|${fila.grupo_id}`)
    }
  }

  const faltantes = directorIds.flatMap((directorId) =>
    grupoIds
      .filter((grupoId) => !existentes.has(`${directorId}|${grupoId}`))
      .map((grupoId) => ({ director_etapa_id: directorId, grupo_id: grupoId })),
  )
  if (faltantes.length === 0) return null

  const { error } = await adminClient.from(TABLA).insert(faltantes)
  if (!error) return null
  if (error.code !== CODIGO_UNIQUE_VIOLATION) return error

  // A concurrent request created some of these links between the pre-check and the insert, and
  // the unique violation rolled back the whole batch. Retry row by row: a row that now exists
  // is a success, anything else is a real error.
  for (const fila of faltantes) {
    const { error: errorFila } = await adminClient.from(TABLA).insert(fila)
    if (errorFila && errorFila.code !== CODIGO_UNIQUE_VIOLATION) return errorFila
  }
  return null
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
