import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

const NO_VISIBLE_PERSONA_ID = '00000000-0000-0000-0000-000000000000'

type HierarchicalVisibilityClient = SupabaseClient<Database>
type HierarchicalVisibilityRpc = (
  name: string,
  args: Readonly<Record<string, string>>,
) => Promise<{ data: unknown; error: unknown }>

type PersonaUnderMeRow = {
  persona_id: string
}

export type VisibilityFailureReason =
  | 'rpc_error'
  | 'rpc_shape_invalid'
  | 'no_user_session'
  | 'participants_query_error'

export class HierarchicalVisibilityError extends Error {
  public readonly reason: VisibilityFailureReason
  public readonly cause: unknown

  constructor(reason: VisibilityFailureReason, cause: unknown) {
    const message =
      cause instanceof Error && cause.message
        ? cause.message
        : `hierarchical-visibility: ${reason}`
    super(message)
    this.name = 'HierarchicalVisibilityError'
    this.reason = reason
    this.cause = cause
  }
}

function isPersonaUnderMeRow(value: unknown): value is PersonaUnderMeRow {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { persona_id?: unknown }).persona_id === 'string'
  )
}

function normalizePersonaUnderMeRows(
  data: unknown,
  error: unknown,
): readonly string[] {
  if (error) throw new HierarchicalVisibilityError('rpc_error', error)
  if (data === null || data === undefined) return []
  if (!Array.isArray(data)) {
    if (typeof data === 'string') return [data]
    throw new HierarchicalVisibilityError(
      'rpc_shape_invalid',
      new Error(
        `get_personas_under_me returned unexpected shape: ${typeof data}`,
      ),
    )
  }
  const rows: PersonaUnderMeRow[] = []
  for (const item of data) {
    if (typeof item === 'string') {
      rows.push({ persona_id: item })
      continue
    }
    if (isPersonaUnderMeRow(item)) {
      rows.push(item)
      continue
    }
    throw new HierarchicalVisibilityError(
      'rpc_shape_invalid',
      new Error(`get_personas_under_me returned non-row item: ${typeof item}`),
    )
  }
  return rows.map((row) => row.persona_id)
}

export async function getPersonasUnderMe(
  client: HierarchicalVisibilityClient,
): Promise<readonly string[]> {
  const { data: { user }, error: authError } = await client.auth.getUser()
  if (authError || !user) return []

  const rpc = client.rpc as unknown as HierarchicalVisibilityRpc
  const { data, error } = await rpc('get_personas_under_me', {
    p_auth_id: user.id,
  })
  return normalizePersonaUnderMeRows(data, error)
}

export function visiblePersonaIdsOrNone(
  personaIds: readonly string[],
): readonly string[] {
  return personaIds.length > 0 ? personaIds : [NO_VISIBLE_PERSONA_ID]
}

export async function getVisiblePastoralOneOnOneIds(
  client: HierarchicalVisibilityClient,
): Promise<readonly string[]> {
  let personaIds: readonly string[]
  try {
    personaIds = await getPersonasUnderMe(client)
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[pastoral/hierarchical-visibility] getPersonasUnderMe failed', err)
    }
    return []
  }
  if (personaIds.length === 0) return []

  const safePersonaIds = visiblePersonaIdsOrNone(personaIds)
  const { data, error } = await client
    .from('pastoral_one_on_one_participantes')
    .select('one_on_one_id')
    .in('persona_id', safePersonaIds)

  if (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        '[pastoral/hierarchical-visibility] pastoral_one_on_one_participantes query failed',
        error,
      )
    }
    return []
  }
  return [...new Set((data ?? []).map((row) => String(row.one_on_one_id)))]
}
