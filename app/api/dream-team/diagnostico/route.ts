/**
 * TEMPORARY diagnostic endpoint — remove before merging to main.
 *
 * The three Dream Team screens return notFound() and we cannot tell which of
 * the two gates is closing from the outside: the feature flag, or the read
 * capability. Both render the same "Página no encontrada" page.
 *
 * This route is deliberately NOT behind the feature flag — that is the whole
 * point: if the flag is off, every other Dream Team route is invisible and
 * there is nothing left to measure. Reaching this route at all also proves the
 * deployment actually contains this branch's code.
 *
 * It requires an authenticated session and reports only the caller's own
 * session, plus whether a NEXT_PUBLIC_* variable is set. Nothing here is
 * information the caller does not already hold about themselves.
 */

import { NextResponse } from 'next/server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  findPlatformSessionPersonaByAuthId,
  resolveReadOnlyPlatformSession,
} from '@/lib/auth/platformSessionReadOnly'
import {
  hasDreamTeamReadCapability,
  hasDreamTeamWriteCapability,
  isDreamTeamEnabled,
} from '@/lib/platform/dream-team/route-access'

export const dynamic = 'force-dynamic'

export async function GET() {
  const flagRaw = process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED ?? null
  const flagEnabled = isDreamTeamEnabled()

  const supabase = await createSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const { data: { user } } = await (supabase as any).auth.getUser()

  if (!user) {
    return NextResponse.json(
      {
        deploymentIncludesThisBranch: true,
        flagRaw,
        flagEnabled,
        session: null,
        diagnostico: 'Sin sesión. Iniciá sesión y volvé a abrir esta URL.',
      },
      { status: 200 },
    )
  }

  const session = await resolveReadOnlyPlatformSession({
    subjectAuthId: user.id,
    findPersonaByAuthId: (authId) => findPlatformSessionPersonaByAuthId(supabase, authId),
    capabilitySupabase: supabase,
  })

  if (!session) {
    return NextResponse.json(
      {
        deploymentIncludesThisBranch: true,
        flagRaw,
        flagEnabled,
        session: 'auth user sin persona vinculada',
        diagnostico: 'El usuario de auth no resuelve a una persona. Revisá usuarios.auth_id.',
      },
      { status: 200 },
    )
  }

  const dreamTeamCapabilities = session.capabilities
    .filter((c) => c.key.startsWith('dream_team.'))
    .map((c) => ({ key: c.key, scopeType: c.scopeType, scopeId: c.scopeId ?? null }))

  const readGate = hasDreamTeamReadCapability(session)
  const writeGate = hasDreamTeamWriteCapability(session)

  const diagnostico = !flagEnabled
    ? 'La bandera está apagada. Definí NEXT_PUBLIC_DREAM_TEAM_ENABLED=true en Vercel (alcance Preview) y volvé a construir.'
    : !readGate
      ? 'La bandera está encendida pero esta sesión no pasa el gate de lectura. Mirá dreamTeamCapabilities.'
      : 'Bandera y gate de lectura OK. Las pantallas deberían abrir.'

  return NextResponse.json(
    {
      deploymentIncludesThisBranch: true,
      flagRaw,
      flagEnabled,
      personaId: session.personaId,
      totalCapabilities: session.capabilities.length,
      dreamTeamCapabilities,
      readGate,
      writeGate,
      diagnostico,
    },
    { status: 200 },
  )
}
