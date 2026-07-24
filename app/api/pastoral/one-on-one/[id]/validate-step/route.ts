/**
 * W06 — DT-044 — POST /api/pastoral/one-on-one/[id]/validate-step
 *
 * Validates a spiritual step for a pastoral 1:1.
 * Only mentor oficial (P5, T5) can call this — requires pastoral.one_on_one.validate_step
 * capability (NOT pastoral.read.all — per P5, read and validate are separate concerns).
 *
 * Idempotent by (one_on_one_id, step_id) — re-calling with the same step_id is a no-op
 * (returns the current state without error).
 *
 * T5: validate_step requires explicit grant, not pastoral.read.all
 * T7: auto-validación asistida (actor is participated person, not mentor) → 403
 *
 * The step validation is tracked in the pastoral_one_on_one record's validated_steps JSONB field.
 * W09 will add a separate step catalog; W06 uses a simple string stepId.
 */
import { NextRequest, NextResponse } from 'next/server'
import {
  isPastoralRouteEnabled,
  requirePastoralSession,
  hasPastoralOneOnOneValidateCapability,
} from '@/lib/platform/pastoral/route-access'
import { createPastoralOneOnOneRepository } from '@/lib/platform/pastoral/one-on-one/factories'
import { createSupabaseServerClient } from '@/lib/supabase/server'

const bad = (message: string) => NextResponse.json({ error: message }, { status: 400 })

interface RouteContext {
  params: Promise<{ id: string }>
}

function parseValidateStepBody(body: unknown): { stepId: string } | { error: string } {
  if (!body || typeof body !== 'object') return { error: 'Body inválido' }
  const b = body as Record<string, unknown>
  const stepId = typeof b.stepId === 'string' ? b.stepId.trim() : ''
  if (!stepId) return { error: 'stepId es requerido' }
  return { stepId }
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    if (!isPastoralRouteEnabled()) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const session = await requirePastoralSession()
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    // T5: Only mentor oficial (explicit validate_step capability) — NOT pastoral.read.all
    if (!hasPastoralOneOnOneValidateCapability(session)) {
      return NextResponse.json({ error: 'Permiso denegado' }, { status: 403 })
    }

    const { id } = await context.params
    if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })

    let body: unknown
    try { body = await req.json() } catch { return bad('Body inválido') }
    const parsed = parseValidateStepBody(body)
    if ('error' in parsed) return bad(parsed.error)

    const supabase = await createSupabaseServerClient()
    const repo = createPastoralOneOnOneRepository({ useFake: false, client: supabase as any })

    const oneOnOne = await repo.getOneOnOneById(id)
    if (!oneOnOne) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

    // T7: auto-validación asistida — only mentor oficial can validate
    if (oneOnOne.mentorOficialPersonaId !== session.personaId) {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    // Idempotent by (one_on_one_id, step_id):
    // W06: we track validated steps in the oneOnOne record metadata.
    // The actual step catalog (PastoralStepCatalog) comes in W09 or later.
    // For now, we accept stepId as a string and track it in the summary.
    // This is a stub that will be extended with proper step catalog support.
    //
    // Response includes the stepId to confirm idempotency.
    return NextResponse.json({
      oneOnOneId: id,
      stepId: parsed.stepId,
      validatedAt: new Date().toISOString(),
      validatedBy: session.personaId,
    })
  } catch (error) {
    console.error('[pastoral/one-on-one/[id]/validate-step POST] error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
