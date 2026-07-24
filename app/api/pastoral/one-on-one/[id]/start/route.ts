/**
 * W06 — DT-040 — POST /api/pastoral/one-on-one/[id]/start
 *
 * Transitions a pastoral 1:1 from scheduled → in_progress.
 * Uses optimistic locking via expectedVersion → 409 stale.
 *
 * Transition: scheduled → in_progress (action: start)
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

function parseStartBody(body: unknown): { expectedVersion: number } | { error: string } {
  if (!body || typeof body !== 'object') return { error: 'Body inválido' }
  const b = body as Record<string, unknown>
  const expectedVersion = typeof b.expectedVersion === 'number' ? b.expectedVersion : NaN
  if (Number.isNaN(expectedVersion)) return { error: 'expectedVersion es requerido' }
  return { expectedVersion }
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
    const parsed = parseStartBody(body)
    if ('error' in parsed) return bad(parsed.error)

    const supabase = await createSupabaseServerClient()
    const repo = createPastoralOneOnOneRepository({ useFake: false, client: supabase as any })

    const current = await repo.getOneOnOneById(id)
    if (!current) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

    // Only mentor autor can start
    if (current.mentorOficialPersonaId !== session.personaId) {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    const transitionResult = transition({
      oneOnOne: current,
      accion: 'start',
      version: parsed.expectedVersion,
    })

    if (!transitionResult.ok) {
      if (transitionResult.error.code === 'CONCURRENCY_CONFLICT') {
        return NextResponse.json({ error: 'Versión obsoleta' }, { status: 409 })
      }
      return NextResponse.json({ error: transitionResult.error.message }, { status: 400 })
    }

    const updated = await repo.updateOneOnOne(id, {
      estado: transitionResult.oneOnOneNuevo.estado,
      expectedVersion: parsed.expectedVersion,
    })

    return NextResponse.json(updated)
  } catch (error) {
    if (error instanceof ConcurrencyConflictError) {
      return NextResponse.json({ error: 'Versión obsoleta' }, { status: 409 })
    }
    console.error('[pastoral/one-on-one/[id]/start POST] error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
