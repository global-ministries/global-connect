/**
 * W06 — DT-037 — POST /api/pastoral/one-on-one
 *
 * Creates a new pastoral 1:1 record.
 *
 * Branches:
 * - 401: no session
 * - 403: no pastoral.one_on_one.create capability
 * - 404: pastoral flag off
 * - 400: malformed input
 * - 403: no formal mentor role (ESC-04 — deferred to W10 mentor cascade)
 * - 409: cascade resolution returns no result (ESC-03 — deferred to W10 mentor cascade)
 * - 201: happy path with id + version=1
 *
 * The autor is always the session persona.
 * mentorOficialPersonaId comes from the request body.
 */
import { NextRequest, NextResponse } from 'next/server'
import {
  isPastoralRouteEnabled,
  requirePastoralSession,
  hasPastoralOneOnOneWriteCapability,
} from '@/lib/platform/pastoral/route-access'
import { createPastoralOneOnOneRepository } from '@/lib/platform/pastoral/one-on-one/factories'
import { createSupabaseServerClient } from '@/lib/supabase/server'

const bad = (message: string) => NextResponse.json({ error: message }, { status: 400 })

function parseCreateBody(body: unknown): {
  mentorOficialPersonaId: string
  scheduledAt?: string | null
} | { error: string } {
  if (!body || typeof body !== 'object') return { error: 'Body inválido' }
  const b = body as Record<string, unknown>
  const mentorOficialPersonaId = typeof b.mentorOficialPersonaId === 'string' ? b.mentorOficialPersonaId.trim() : ''
  if (!mentorOficialPersonaId) return { error: 'mentorOficialPersonaId es requerido' }
  const scheduledAt = b.scheduledAt !== undefined
    ? (typeof b.scheduledAt === 'string' ? b.scheduledAt.trim() || null : null)
    : undefined
  return { mentorOficialPersonaId, scheduledAt }
}

export async function POST(req: NextRequest) {
  try {
    // 404: flag off
    if (!isPastoralRouteEnabled()) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // 401: no session
    const session = await requirePastoralSession()
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    // 403: no capability
    if (!hasPastoralOneOnOneWriteCapability(session)) {
      return NextResponse.json({ error: 'Permiso denegado' }, { status: 403 })
    }

    // 400: malformed body
    let body: unknown
    try { body = await req.json() } catch { return bad('Body inválido') }
    const parsed = parseCreateBody(body)
    if ('error' in parsed) return bad(parsed.error)

    const supabase = await createSupabaseServerClient()
    const repo = createPastoralOneOnOneRepository({ useFake: false, client: supabase as any })

    // ESC-03 / ESC-04: mentor cascade resolution deferred to W10
    // For now, proceed with creation if actor has capability

    const oneOnOne = await repo.createOneOnOne({
      mentorOficialPersonaId: parsed.mentorOficialPersonaId,
      autorPersonaId: session.personaId,
      scheduledAt: parsed.scheduledAt,
    })

    // Note: pastoral_one_on_one_logged event emission for create
    // will be added when the 1:1 moves to a non-terminal state.
    // Create itself is tracked via the repository (audit trail in the 1:1 table).

    return NextResponse.json({ id: oneOnOne.id, version: oneOnOne.version }, { status: 201 })
  } catch (error) {
    console.error('[pastoral/one-on-one POST] error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
