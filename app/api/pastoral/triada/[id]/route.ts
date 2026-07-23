/**
 * W08 — DT-046 — GET /api/pastoral/triada/[id]
 *
 * Reads a pastoral triada applying four-circle access:
 * 1. Mentor oficial → full read
 * 2. pastoral.read.all → full read
 * 3. Member of triada → full read
 * 4. Otherwise → denied (403)
 *
 * ESC-01/02/03/04/05/06/07 from pastoral-triada-read.
 *
 * Four circles for triada read:
 * 1. Mentor oficial → full read
 * 2. pastoral.read.all capability → full read
 * 3. Member of triada → full read
 * 4. Otherwise → denied
 *
 * T6: When contexto='simultaneidad', coordinador_area cannot see
 * notes from the GDV leader (P7 — handled at notes route level, not here).
 */
import { NextRequest, NextResponse } from 'next/server'
import {
  isPastoralRouteEnabled,
  requirePastoralSession,
  hasPastoralTriadaReadCapability,
  hasPastoralReadAllCapability,
} from '@/lib/platform/pastoral/route-access'
import { createPastoralTriadaRepository } from '@/lib/platform/pastoral/triad/factories'
import { createSupabaseServerClient } from '@/lib/supabase/server'

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
    const repo = createPastoralTriadaRepository({ useFake: false, client: supabase as any })

    const triada = await repo.getTriadaById(id)
    if (!triada) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

    const miembros = await repo.listMiembros(id)

    // Four circles check:
    // 1. Mentor oficial
    const isMentorOficial = triada.mentorOficialPersonaId === session.personaId

    // 2. pastoral.read.all
    const hasReadAll = hasPastoralReadAllCapability(session)

    // 3. Member of triada
    const isMember = miembros.some((m) => m.personaId === session.personaId)

    if (!isMentorOficial && !hasReadAll && !isMember) {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    // Return full triada record with members
    return NextResponse.json({ triada, miembros })
  } catch (error) {
    console.error('[pastoral/triada/[id] GET] error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
