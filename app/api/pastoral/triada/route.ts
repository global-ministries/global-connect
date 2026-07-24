/**
 * W08 — DT-045 — POST /api/pastoral/triada
 *
 * Creates a new pastoral triada manually in 'simultaneidad' context.
 *
 * Branches:
 * - 404: pastoral flag off
 * - 401: no session
 * - 403: no pastoral.triada.create capability
 * - 400: malformed input
 * - 400: cardinality != 3 distinct humans (D25)
 * - 400: missing contexto
 * - 403: no formal mentor role (ESC-05 — deferred to W10 mentor cascade)
 * - 201: happy path with id + version=1
 *
 * For manual creation in 'simultaneidad' context, the actor provides
 * exactly 3 distinct members with their roles.
 */
import { NextRequest, NextResponse } from 'next/server'
import {
  isPastoralRouteEnabled,
  requirePastoralSession,
  hasPastoralTriadaCreateCapability,
} from '@/lib/platform/pastoral/route-access'
import { createPastoralTriadaRepository } from '@/lib/platform/pastoral/triad/factories'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { validarCardinalidadTriada } from '@/lib/platform/pastoral/triad/validators'
import type { PastoralTriadaMiembro } from '@/lib/platform/pastoral/types'

const bad = (message: string) => NextResponse.json({ error: message }, { status: 400 })

function parseCreateBody(body: unknown): {
  readonly miembros: ReadonlyArray<{ readonly personaId: string; readonly rolEnTriada: string }>
  readonly contexto: string
} | { error: string } {
  if (!body || typeof body !== 'object') return { error: 'Body inválido' }
  const b = body as Record<string, unknown>

  // Parse contexto
  const contexto = typeof b.contexto === 'string' ? b.contexto.trim() : ''
  if (!contexto) return { error: 'contexto es requerido' }
  const validContexts = ['nuevo_paso', 'simultaneidad', 'inicial', 'reformada']
  if (!validContexts.includes(contexto)) {
    return { error: `contexto debe ser uno de: ${validContexts.join(', ')}` }
  }

  // Parse miembros
  if (!Array.isArray(b.miembros)) return { error: 'miembros debe ser un array' }
  const rawMiembros = b.miembros as unknown[]
  if (rawMiembros.length !== 3) {
    return { error: 'deben ser exactamente 3 miembros' }
  }

  const miembros: { personaId: string; rolEnTriada: string }[] = []
  for (const m of rawMiembros) {
    if (!m || typeof m !== 'object') return { error: 'cada miembro debe ser un objeto' }
    const mi = m as Record<string, unknown>
    const personaId = typeof mi.personaId === 'string' ? mi.personaId.trim() : ''
    const rolEnTriada = typeof mi.rolEnTriada === 'string' ? mi.rolEnTriada.trim() : ''
    if (!personaId) return { error: 'personaId es requerido en cada miembro' }
    if (!rolEnTriada) return { error: 'rolEnTriada es requerido en cada miembro' }
    miembros.push({ personaId, rolEnTriada })
  }

  return { miembros, contexto }
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
    if (!hasPastoralTriadaCreateCapability(session)) {
      return NextResponse.json({ error: 'Permiso denegado' }, { status: 403 })
    }

    // 400: malformed body
    let body: unknown
    try { body = await req.json() } catch { return bad('Body inválido') }
    const parsed = parseCreateBody(body)
    if ('error' in parsed) return bad(parsed.error)

    // Validate cardinality 3 distinct humans (D25)
    const cardinalityResult = validarCardinalidadTriada(parsed.miembros)
    if (!cardinalityResult.ok) {
      return bad(cardinalityResult.error.message)
    }

    const supabase = await createSupabaseServerClient()
    const repo = createPastoralTriadaRepository({ useFake: false, client: supabase as any })

    // ESC-05: mentor cascade resolution deferred to W10
    // For now, proceed with creation if actor has capability

    // Create the triada (autor = session persona)
    const triada = await repo.createTriada({
      mentorOficialPersonaId: parsed.miembros.find((m) => m.rolEnTriada === 'mentor')?.personaId ?? '',
      autorPersonaId: session.personaId,
      contexto: parsed.contexto as 'nuevo_paso' | 'simultaneidad' | 'inicial' | 'reformada',
    })

    // Add all 3 members
    const addedMiembros: PastoralTriadaMiembro[] = []
    for (const member of parsed.miembros) {
      const added = await repo.addMiembro({
        triadaId: triada.id,
        personaId: member.personaId,
        rolEnTriada: member.rolEnTriada,
      })
      addedMiembros.push(added)
    }

    return NextResponse.json(
      { id: triada.id, version: triada.version, miembros: addedMiembros.map((m) => ({ id: m.id, personaId: m.personaId, rolEnTriada: m.rolEnTriada })) },
      { status: 201 },
    )
  } catch (error) {
    console.error('[pastoral/triada POST] error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
