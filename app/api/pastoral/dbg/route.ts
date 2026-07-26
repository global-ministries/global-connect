import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { findPlatformSessionPersonaByAuthId, resolveReadOnlyPlatformSession } from '@/lib/auth/platformSessionReadOnly'
import { isPastoralEnabled } from '@/lib/platform/pastoral/flags'
import { requirePastoralSession, hasPastoralOneOnOneReadCapability } from '@/lib/platform/pastoral/route-access'

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
  const session = u?.user?.id ? await requirePastoralSession() : null
  const cap = session ? hasPastoralOneOnOneReadCapability(session) : null

  return NextResponse.json({
    user: u?.user ? { id: u.user.id, email: u.user.email } : null,
    userError: ue?.message ?? null,
    cookies: cs.getAll().map(c => c.name),
    gate1_isPastoralEnabled: flag,
    gate2_requirePastoralSession: session ? { personaId: session.personaId, capCount: session.capabilities.length } : null,
    gate3_hasPastoralOneOnOneRead: cap,
    diagnosis: !flag 
      ? 'GATE 1 FAILED: isPastoralEnabled() = false'
      : !session 
        ? 'GATE 2 FAILED: requirePastoralSession() = null' 
        : !cap 
          ? 'GATE 3 FAILED: hasPastoralOneOnOneReadCapability() = false'
          : 'ALL GATES PASSED — should not redirect',
  })
}
