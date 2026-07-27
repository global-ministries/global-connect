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

export async function getPersonasUnderMe(
  client: HierarchicalVisibilityClient,
): Promise<readonly string[]> {
  const { data: { user }, error: authError } = await client.auth.getUser()
  if (authError || !user) return []

  const rpc = client.rpc as unknown as HierarchicalVisibilityRpc
  const { data, error } = await rpc('get_personas_under_me', {
    p_auth_id: user.id,
  })
  if (error) throw error

  return ((data ?? []) as PersonaUnderMeRow[]).map((row) => row.persona_id)
}

export function visiblePersonaIdsOrNone(
  personaIds: readonly string[],
): readonly string[] {
  return personaIds.length > 0 ? personaIds : [NO_VISIBLE_PERSONA_ID]
}

export async function getVisiblePastoralOneOnOneIds(
  client: HierarchicalVisibilityClient,
): Promise<readonly string[]> {
  const personaIds = visiblePersonaIdsOrNone(await getPersonasUnderMe(client))
  const { data, error } = await client
    .from('pastoral_one_on_one_participantes')
    .select('one_on_one_id')
    .in('persona_id', personaIds)

  if (error) throw error
  return [...new Set((data ?? []).map((row) => String(row.one_on_one_id)))]
}
