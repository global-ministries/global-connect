/**
 * W06 — DT-042 — POST /api/pastoral/one-on-one/[id]/cancel
 *
 * Closes a pastoral 1:1 as cancelled with a motivo from the closed catalog.
 * 400 if no motivo (ESC-03).
 *
 * Transitions:
 * - pending_participant → cancelled (with motivo)
 * - scheduled → cancelled (with motivo)
 * - in_progress → cancelled (with motivo)
 */
import { NextRequest, NextResponse } from 'next/server'
import { transition } from '@/lib/platform/pastoral/state'
import {
  isPastoralRouteEnabled,
  requirePastoralSession,
  hasPastoralOneOnOneWriteCapability,
} from '@/lib/platform/pastoral/route-access'
import { createPastoralOneOnOneRepository } from '@/lib/platform/pastoral/one-on-one/factories'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { ConcurrencyConflictError } from '@/lib/platform/pastoral/one-on-one/repository-supabase'

const bad = (message: string) => NextResponse.json({ error: message }, { status: 400 })

interface RouteContext {
  params: Promise<{ id: string }>
}

function parseCancelBody(body: unknown): {
  motivoCancelacion: string
  expectedVersion: number
} | { error: string } {
  if (!body || typeof body !== 'object') return { error: 'Body inválido' }
  const b = body as Record<string, unknown>
  const motivoCancelacion = typeof b.motivoCancelacion === 'string' ? b.motivoCancelacion.trim() : ''
  if (!motivoCancelacion) return { error: 'motivoCancelacion es requerido' }
  const expectedVersion = typeof b.expectedVersion === 'number' ? b.expectedVersion : NaN
  if (Number.isNaN(expectedVersion)) return { error: 'expectedVersion es requerido' }
  return { motivoCancelacion, expectedVersion }
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    if (!isPastoralRouteEnabled()) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const session = await requirePastoralSession()
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    if (!hasPastoralOneOnOneWriteCapability(session)) {
      return NextResponse.json({ error: 'Permiso denegado' }, { status: 403 })
    }

    const { id } = await context.params
    if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })

    let body: unknown
    try { body = await req.json() } catch { return bad('Body inválido') }
    const parsed = parseCancelBody(body)
    if ('error' in parsed) return bad(parsed.error)

    const supabase = await createSupabaseServerClient()
    const repo = createPastoralOneOnOneRepository({ useFake: false, client: supabase as any })

    const current = await repo.getOneOnOneById(id)
    if (!current) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

    // Only mentor autor can cancel
    if (current.mentorOficialPersonaId !== session.personaId) {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    const transitionResult = transition({
      oneOnOne: current,
      accion: 'cancel',
      version: parsed.expectedVersion,
      motivoCancelacion: parsed.motivoCancelacion,
    })

    if (!transitionResult.ok) {
      if (transitionResult.error.code === 'CONCURRENCY_CONFLICT') {
        return NextResponse.json({ error: 'Versión obsoleta' }, { status: 409 })
      }
      if (transitionResult.error.code === 'MISSING_MOTIVO') {
        return NextResponse.json({ error: 'motivoCancelacion es requerido' }, { status: 400 })
      }
      return NextResponse.json({ error: transitionResult.error.message }, { status: 400 })
    }

    const updated = await repo.updateOneOnOne(id, {
      estado: transitionResult.oneOnOneNuevo.estado,
      motivoCancelacion: parsed.motivoCancelacion,
      expectedVersion: parsed.expectedVersion,
    })

    return NextResponse.json(updated)
  } catch (error) {
    if (error instanceof ConcurrencyConflictError) {
      return NextResponse.json({ error: 'Versión obsoleta' }, { status: 409 })
    }
    console.error('[pastoral/one-on-one/[id]/cancel POST] error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
