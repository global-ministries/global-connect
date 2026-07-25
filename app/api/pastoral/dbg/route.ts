import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { findPlatformSessionPersonaByAuthId, resolveReadOnlyPlatformSession } from '@/lib/auth/platformSessionReadOnly'
import { isPastoralEnabled } from '@/lib/platform/pastoral/flags'
import { hasPastoralOneOnOneReadCapability } from '@/lib/platform/pastoral/route-access'

export const dynamic = 'force-dynamic'

export async function GET() {
  const cs = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cs.getAll() } }
  )
  const { data: u, error: ue } = await supabase.auth.getUser()
  const flag = isPastoralEnabled()
  let session: unknown = null
  let sessionErr: unknown = null
  if (u?.user?.id) {
    try {
      session = await resolveReadOnlyPlatformSession({
        subjectAuthId: u.user.id,
        findPersonaByAuthId: (id) => findPlatformSessionPersonaByAuthId(supabase, id),
        capabilitySupabase: supabase,
      })
    } catch (e) { sessionErr = String(e) }
  }
  const s = session && typeof session === 'object' ? session as { personaId: string; capabilities: { key: string }[] } : null
  const capCheck = s ? hasPastoralOneOnOneReadCapability(s as never) : null
  return NextResponse.json({
    user: u?.user ? { id: u.user.id, email: u.user.email } : null,
    userError: ue ? { message: ue.message } : null,
    cookies: cs.getAll().map(c => c.name),
    flag_isPastoralEnabled: flag,
    session: s ? { personaId: s.personaId, capabilitiesCount: s.capabilities.length, capabilitiesKeys: s.capabilities.map(c => c.key) } : null,
    sessionError: sessionErr,
    capCheck_hasPastoralOneOnOneRead: capCheck,
    diagnosis: flag ? 'flag OK' : 'FLAG IS OFF',
  })
}
