/**
 * W15 — DT-081 — GET /api/pastoral/roadmap/[persona_id]
 *
 * Returns the public roadmap for an assisted person (P6).
 * Only returns validated milestones, dates, and suggested next steps.
 *
 * Auth: actor can be:
 * - The assisted person themselves
 * - Their official mentor (has pastoral.one_on_one.read capability)
 * - Anyone with pastoral.read.all capability
 *
 * Uses loadPublicRoadmap (W13) which applies field-projection:
 * - resumen is always null (P6)
 * - notas are always null (P6)
 *
 * P6 guard is enforced in loadPublicRoadmap.
 */
import { NextRequest, NextResponse } from 'next/server'
import {
  isPastoralRouteEnabled,
  requirePastoralSession,
  hasPastoralOneOnOneReadCapability,
  hasPastoralReadAllCapability,
} from '@/lib/platform/pastoral/route-access'
import { loadPublicRoadmap } from '@/lib/platform/pastoral/public-roadmap/load-public-roadmap'

interface RouteContext {
  params: Promise<{ persona_id: string }>
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    // Kill switch check
    if (!isPastoralRouteEnabled()) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // Auth check
    const session = await requirePastoralSession()
    if (!session) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const { persona_id: assistedPersonaId } = await context.params
    if (!assistedPersonaId) {
      return NextResponse.json({ error: 'persona_id requerido' }, { status: 400 })
    }

    // P6: Actor must be the assisted, their mentor, or have pastoral.read.all
    const isAssisted = session.personaId === assistedPersonaId
    const isMentor = hasPastoralOneOnOneReadCapability(session)
    const isAdmin = hasPastoralReadAllCapability(session)

    if (!isAssisted && !isMentor && !isAdmin) {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    // Load the public roadmap (applies field-projection - P6)
    const roadmap = await loadPublicRoadmap({ assistedPersonaId })

    if (!roadmap) {
      return NextResponse.json({ error: 'Roadmap no encontrado' }, { status: 404 })
    }

    return NextResponse.json(roadmap)
  } catch (error) {
    console.error('[pastoral/roadmap/[persona_id] GET] error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
