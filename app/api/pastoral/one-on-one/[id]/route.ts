/**
 * W06 — DT-038 — GET /api/pastoral/one-on-one/[id]
 *
 * Reads a pastoral 1:1 record applying three-circle access (P6):
 * 1. Mentor autor → full read
 * 2. pastoral.read.all → full read
 * 3. Participated person → roadmap only (estado, scheduledAt, completedAt, motivoCancelacion)
 *
 * ESC-01: mentor autor → full
 * ESC-02: pastoral.read.all → full
 * ESC-03: participated person → roadmap only
 * ESC-04: actor is participated person AND mentor or admin → full
 * ESC-05: no actor → denied (401)
 * ESC-06: null oneOnOne → denied (404)
 */
import { NextRequest, NextResponse } from 'next/server'
import {
  isPastoralRouteEnabled,
  requirePastoralSession,
} from '@/lib/platform/pastoral/route-access'
import { createPastoralOneOnOneRepository } from '@/lib/platform/pastoral/one-on-one/factories'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  canReadPastoralOneOnOne,
  applyReadResult,
  projectToRoadmap,
  type PastoralOneOnOneReadActor,
} from '@/lib/platform/pastoral/one-on-one/read-guard'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    if (!isPastoralRouteEnabled()) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const session = await requirePastoralSession()
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { id } = await context.params
    if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })

    const supabase = await createSupabaseServerClient()
    const repo = createPastoralOneOnOneRepository({ useFake: false, client: supabase as any })

    const oneOnOne = await repo.getOneOnOneById(id)
    if (!oneOnOne) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

    const participantes = await repo.listParticipantes(id)

    const actor: PastoralOneOnOneReadActor = {
      personaId: session.personaId,
      capabilities: session.capabilities.map((c) => ({ key: c.key })),
    }

    const readResult = canReadPastoralOneOnOne(actor, oneOnOne, participantes)

    if (!readResult.allowed) {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    if (readResult.mode === 'roadmap') {
      return NextResponse.json(projectToRoadmap(oneOnOne))
    }

    return NextResponse.json(oneOnOne)
  } catch (error) {
    console.error('[pastoral/one-on-one/[id] GET] error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
