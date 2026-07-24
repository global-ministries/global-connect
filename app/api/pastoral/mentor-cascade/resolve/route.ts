/**
 * W10 — DT-060 — GET /api/pastoral/mentor-cascade/resolve
 *
 * Resolves the official mentor for a persona using the cascade.
 *
 * Capability required: pastoral.mentor.cascade.resolve or pastoral.read.all
 *
 * Returns:
 * 200: { mentor: MentorAssignment } or { mentor: null, reason: 'no_active_membership' }
 * 400: invalid input
 * 401: no session
 * 403: missing capability
 */
import { NextRequest, NextResponse } from 'next/server'
import { requirePastoralSession, hasPastoralReadAllCapability } from '@/lib/platform/pastoral/route-access'
import { resolveMentorOficial, type ResolveMentorOficialContext } from '@/lib/platform/pastoral/mentor-cascade'
import { createGdvMentorSupabaseAdapter } from '@/lib/platform/pastoral/adapters/gdv-mentor-supabase-adapter'
import { createGrupoCortoPlazoMentorAdapter as createGrupoCortoPlazoSupabaseAdapter } from '@/lib/platform/pastoral/adapters/grupo-corto-plazo-supabase-adapter'
import { createServicioMentorAdapter as createServicioMentorSupabaseAdapter } from '@/lib/platform/pastoral/adapters/servicio-mentor-supabase-adapter'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// GET ?persona_id=...
export async function GET(request: NextRequest) {
  // 1. Auth check
  const session = await requirePastoralSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Capability check (pastoral.mentor.cascade.resolve or pastoral.read.all)
  const hasCapability = hasPastoralReadAllCapability(session)
  if (!hasCapability) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // 3. Parse query param
  const { searchParams } = new URL(request.url)
  const personaId = searchParams.get('persona_id')

  if (!personaId?.trim()) {
    return NextResponse.json(
      { error: 'Missing required query param: persona_id' },
      { status: 400 },
    )
  }

  // 4. Build adapters (read-only Supabase adapters)
  const supabase = await createSupabaseServerClient()

  const gdvAdapter = createGdvMentorSupabaseAdapter(supabase)
  const tallerAdapter = createGrupoCortoPlazoSupabaseAdapter(supabase)
  const servicioAdapter = createServicioMentorSupabaseAdapter(supabase)

  const ctx: ResolveMentorOficialContext = {
    gdvAdapter,
    tallerAdapter,
    servicioAdapter,
  }

  // 5. Resolve mentor
  const result = await resolveMentorOficial(personaId, ctx)

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  if (result.assignment === null) {
    return NextResponse.json(
      { mentor: null, reason: 'no_active_membership' },
      { status: 200 },
    )
  }

  return NextResponse.json(
    { mentor: result.assignment },
    { status: 200 },
  )
}
