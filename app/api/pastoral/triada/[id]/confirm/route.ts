/**
 * W08 — DT-047 — POST /api/pastoral/triada/[id]/confirm
 *
 * Confirms a pastoral triada (pending_confirmation → active).
 * Each member confirms separately using their actor_persona_id.
 *
 * Branches:
 * - 404: pastoral flag off or triada not found
 * - 401: no session
 * - 403: no pastoral.read.all capability (confirm requires broader access)
 * - 400: invalid state transition (not in pending_confirmation state)
 * - 409: stale version
 * - 200: happy path with updated triada
 */
import { NextRequest, NextResponse } from 'next/server'
import {
  isPastoralRouteEnabled,
  requirePastoralSession,
  hasPastoralReadAllCapability,
} from '@/lib/platform/pastoral/route-access'
import { createPastoralTriadaRepository } from '@/lib/platform/pastoral/triad/factories'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createPastoralTriadaService } from '@/lib/platform/pastoral/triad/service'
import { createSupabasePastoralLedgerWriter } from '@/lib/platform/pastoral/participation-ledger-pastoral-writer'
import { isConcurrencyConflict, isInvalidStateTransition, isPastoralNotFound } from '@/lib/platform/pastoral/errors'

const bad = (message: string) => NextResponse.json({ error: message }, { status: 400 })

interface RouteContext {
  params: Promise<{ id: string }>
}

function parseConfirmBody(body: unknown): { expectedVersion: number } | { error: string } {
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

    // confirm requires pastoral.read.all (any authorized member can confirm)
    if (!hasPastoralReadAllCapability(session)) {
      return NextResponse.json({ error: 'Permiso denegado' }, { status: 403 })
    }

    const { id } = await context.params
    if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })

    let body: unknown
    try { body = await req.json() } catch { return bad('Body inválido') }
    const parsed = parseConfirmBody(body)
    if ('error' in parsed) return bad(parsed.error)

    const supabase = await createSupabaseServerClient()
    const repo = createPastoralTriadaRepository({ useFake: false, client: supabase as any })
    const ledgerWriter = createSupabasePastoralLedgerWriter(supabase as any)
    const service = createPastoralTriadaService(repo, ledgerWriter)

    const result = await service.confirmTriada({
      triadaId: id,
      actorPersonaId: session.personaId,
      expectedVersion: parsed.expectedVersion,
    })

    if (!result.ok) {
      if (isConcurrencyConflict(result.error)) {
        return NextResponse.json({ error: 'Versión obsoleta' }, { status: 409 })
      }
      if (isPastoralNotFound(result.error)) {
        return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
      }
      if (isInvalidStateTransition(result.error)) {
        return NextResponse.json({ error: result.error.message }, { status: 400 })
      }
      return NextResponse.json({ error: result.error.message }, { status: 400 })
    }

    return NextResponse.json(result.triada)
  } catch (error) {
    console.error('[pastoral/triada/[id]/confirm POST] error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
