/**
 * W08 — DT-049 — GET|POST /api/pastoral/triada/[id]/notes
 *
 * GET: Returns all notes for a triada, filtered by P7 exception.
 *   P7 Exception (ESC-07 of pastoral-triada-notes):
 *   When contexto='simultaneidad' AND actor.rolEnTriada='coordinador_area'
 *   AND note.autor_persona_id != actor.persona_id → deny.
 *   This protects GDV leader notes from being seen by the coordinador_area
 *   when the triada was formed in simultaneidad context.
 *
 * POST: Adds a note to a triada (append-only per D16).
 *   Only mentor oficial, member of triada, or pastoral.read.all can add notes.
 *
 * Four circles for triada read (applied here for notes):
 * 1. Mentor oficial → full access
 * 2. pastoral.read.all → full access
 * 3. Member of triada → full access (subject to P7 exception)
 * 4. Otherwise → denied
 */
import { NextRequest, NextResponse } from 'next/server'
import {
  isPastoralRouteEnabled,
  requirePastoralSession,
  hasPastoralTriadaNotesCapability,
  hasPastoralReadAllCapability,
} from '@/lib/platform/pastoral/route-access'
import { createPastoralTriadaRepository } from '@/lib/platform/pastoral/triad/factories'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  filterTriadaNotesForActor,
  type PastoralTriadaReadActor,
} from '@/lib/platform/pastoral/triad/read-guard'

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

    if (!hasPastoralTriadaNotesCapability(session) && !hasPastoralReadAllCapability(session)) {
      return NextResponse.json({ error: 'Permiso denegado' }, { status: 403 })
    }

    const { id } = await context.params
    if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })

    const supabase = await createSupabaseServerClient()
    const repo = createPastoralTriadaRepository({ useFake: false, client: supabase as any })

    const triada = await repo.getTriadaById(id)
    if (!triada) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

    const miembros = await repo.listMiembros(id)
    const allNotas = await repo.listNotas(id)

    // Four circles check:
    const isMentorOficial = triada.mentorOficialPersonaId === session.personaId
    const hasReadAll = hasPastoralReadAllCapability(session)
    const isMember = miembros.some((m) => m.personaId === session.personaId)

    if (!isMentorOficial && !hasReadAll && !isMember) {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    // Build actor for P7 filtering
    const actorMiembro = miembros.find((m) => m.personaId === session.personaId)
    const actor: PastoralTriadaReadActor = {
      personaId: session.personaId,
      rolEnTriada: actorMiembro?.rolEnTriada,
      capabilities: session.capabilities.map((c) => ({ key: c.key })),
    }

    // Apply P7 exception filter (coordinador_area in simultaneidad can only see own notes)
    const filteredNotas = filterTriadaNotesForActor(allNotas, actor, triada)

    return NextResponse.json({ notas: filteredNotas })
  } catch (error) {
    console.error('[pastoral/triada/[id]/notes GET] error:', error)
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

    if (!hasPastoralTriadaNotesCapability(session)) {
      return NextResponse.json({ error: 'Permiso denegado' }, { status: 403 })
    }

    const { id } = await context.params
    if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })

    let body: unknown
    try { body = await req.json() } catch { return bad('Body inválido') }
    const parsed = parseAddNotaBody(body)
    if ('error' in parsed) return bad(parsed.error)

    const supabase = await createSupabaseServerClient()
    const repo = createPastoralTriadaRepository({ useFake: false, client: supabase as any })

    const triada = await repo.getTriadaById(id)
    if (!triada) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

    const miembros = await repo.listMiembros(id)

    // Four circles: only mentor oficial, member of triada, or pastoral.read.all can add notes
    const isMentorOficial = triada.mentorOficialPersonaId === session.personaId
    const hasReadAll = hasPastoralReadAllCapability(session)
    const isMember = miembros.some((m) => m.personaId === session.personaId)

    if (!isMentorOficial && !hasReadAll && !isMember) {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    }

    const nota = await repo.addNota({
      triadaId: id,
      autorPersonaId: session.personaId,
      contenido: parsed.contenido,
    })

    return NextResponse.json(nota, { status: 201 })
  } catch (error) {
    console.error('[pastoral/triada/[id]/notes POST] error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
