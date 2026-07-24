/**
 * W06 — DT-043 — GET|POST /api/pastoral/one-on-one/[id]/notes
 *
 * GET: Returns all notes for a 1:1.
 *   Only mentor autor or pastoral.read.all can read notes (D16).
 *   Notes are append-only, never mutable.
 *
 * POST: Adds a note to a 1:1 (append-only per D16).
 *   Only mentor autor or pastoral.one_on_one.write_notes capability.
 *
 * D16: notes are private to the mentor autor.
 * T2: notes never appear in roadmap public view (handled by read-guard).
 */
import { NextRequest, NextResponse } from 'next/server'
import {
  isPastoralRouteEnabled,
  requirePastoralSession,
  hasPastoralOneOnOneReadCapability,
  hasPastoralOneOnOneNotesCapability,
} from '@/lib/platform/pastoral/route-access'
import { createPastoralOneOnOneRepository } from '@/lib/platform/pastoral/one-on-one/factories'
import { createSupabaseServerClient } from '@/lib/supabase/server'

const bad = (message: string) => NextResponse.json({ error: message }, { status: 400 })

interface RouteContext {
  params: Promise<{ id: string }>
}

function parseAddNotaBody(body: unknown): { contenido: string } | { error: string } {
  if (!body || typeof body !== 'object') return { error: 'Body inválido' }
  const b = body as Record<string, unknown>
  const contenido = typeof b.contenido === 'string' ? b.contenido.trim() : ''
  if (!contenido) return { error: 'contenido es requerido' }
  return { contenido }
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    if (!isPastoralRouteEnabled()) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const session = await requirePastoralSession()
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    if (!hasPastoralOneOnOneReadCapability(session)) {
      return NextResponse.json({ error: 'Permiso denegado' }, { status: 403 })
    }

    const { id } = await context.params
    if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })

    const supabase = await createSupabaseServerClient()
    const repo = createPastoralOneOnOneRepository({ useFake: false, client: supabase as any })

    const oneOnOne = await repo.getOneOnOneById(id)
    if (!oneOnOne) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

    // Only mentor autor or pastoral.read.all can read notes
    if (
      oneOnOne.mentorOficialPersonaId !== session.personaId &&
      !hasPastoralOneOnOneReadCapability(session)
    ) {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    const notas = await repo.listNotas(id)
    return NextResponse.json({ notas })
  } catch (error) {
    console.error('[pastoral/one-on-one/[id]/notes GET] error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    if (!isPastoralRouteEnabled()) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const session = await requirePastoralSession()
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    if (!hasPastoralOneOnOneNotesCapability(session)) {
      return NextResponse.json({ error: 'Permiso denegado' }, { status: 403 })
    }

    const { id } = await context.params
    if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })

    let body: unknown
    try { body = await req.json() } catch { return bad('Body inválido') }
    const parsed = parseAddNotaBody(body)
    if ('error' in parsed) return bad(parsed.error)

    const supabase = await createSupabaseServerClient()
    const repo = createPastoralOneOnOneRepository({ useFake: false, client: supabase as any })

    const oneOnOne = await repo.getOneOnOneById(id)
    if (!oneOnOne) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

    // Only mentor autor can add notes
    if (oneOnOne.mentorOficialPersonaId !== session.personaId) {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    const nota = await repo.addNota({
      oneOnOneId: id,
      autorPersonaId: session.personaId,
      contenido: parsed.contenido,
    })

    return NextResponse.json(nota, { status: 201 })
  } catch (error) {
    console.error('[pastoral/one-on-one/[id]/notes POST] error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
