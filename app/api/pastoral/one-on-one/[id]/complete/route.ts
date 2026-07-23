/**
 * W06 — DT-041 — POST /api/pastoral/one-on-one/[id]/complete
 *
 * Closes a pastoral 1:1 as completed (in_progress → completed).
 *
 * Uses PastoralOneOnOneService from W05.
 * Validates resumen (D17, P4): max 500 chars, no sensitive patterns.
 * Emits pastoral_one_on_one_completed to ledger (via W04 writer).
 * Invokes crisis scan stub (W09 will replace).
 *
 * ESC-01: happy path
 * ESC-04: resumen > 500 chars → 400
 * ESC-05: sensitive pattern in resumen → 400
 * ESC-06: stale version → 409
 */
import { NextRequest, NextResponse } from 'next/server'
import {
  isPastoralRouteEnabled,
  requirePastoralSession,
  hasPastoralOneOnOneCompleteCapability,
} from '@/lib/platform/pastoral/route-access'
import { createPastoralOneOnOneRepository } from '@/lib/platform/pastoral/one-on-one/factories'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabasePastoralLedgerWriter } from '@/lib/platform/pastoral/participation-ledger-pastoral-writer'
import { createPastoralOneOnOneService } from '@/lib/platform/pastoral/one-on-one/service'
import { scanAndAlertPastoralCrisis } from '@/lib/platform/pastoral/crisis/scan'
import { isInvalidStateTransition, isMissingMotivo, isConcurrencyConflict } from '@/lib/platform/pastoral/errors'

const bad = (message: string) => NextResponse.json({ error: message }, { status: 400 })

interface RouteContext {
  params: Promise<{ id: string }>
}

function parseCompleteBody(body: unknown): {
  resumen: string
  expectedVersion: number
} | { error: string } {
  if (!body || typeof body !== 'object') return { error: 'Body inválido' }
  const b = body as Record<string, unknown>
  const resumen = typeof b.resumen === 'string' ? b.resumen : ''
  if (!resumen.trim()) return { error: 'resumen es requerido' }
  const expectedVersion = typeof b.expectedVersion === 'number' ? b.expectedVersion : NaN
  if (Number.isNaN(expectedVersion)) return { error: 'expectedVersion es requerido' }
  return { resumen, expectedVersion }
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    if (!isPastoralRouteEnabled()) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const session = await requirePastoralSession()
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    if (!hasPastoralOneOnOneCompleteCapability(session)) {
      return NextResponse.json({ error: 'Permiso denegado' }, { status: 403 })
    }

    const { id } = await context.params
    if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })

    let body: unknown
    try { body = await req.json() } catch { return bad('Body inválido') }
    const parsed = parseCompleteBody(body)
    if ('error' in parsed) return bad(parsed.error)

    const supabase = await createSupabaseServerClient()
    const repo = createPastoralOneOnOneRepository({ useFake: false, client: supabase as any })
    const ledgerWriter = createSupabasePastoralLedgerWriter(supabase as any)
    const service = createPastoralOneOnOneService(repo, ledgerWriter)

    const result = await service.completeOneOnOne({
      oneOnOneId: id,
      actorPersonaId: session.personaId,
      resumen: parsed.resumen,
      expectedVersion: parsed.expectedVersion,
    })

    if (!result.ok) {
      if (isConcurrencyConflict(result.error)) {
        return NextResponse.json({ error: 'Versión obsoleta' }, { status: 409 })
      }
      if (isMissingMotivo(result.error) || isInvalidStateTransition(result.error)) {
        return NextResponse.json({ error: result.error.message }, { status: 400 })
      }
      return NextResponse.json({ error: result.error.message }, { status: 400 })
    }

    // ── Crisis scan stub (W09 replaces implementation) ──────────────────────────
    // The stub is invoked with the completed 1:1 data.
    // W09 will implement real keyword detection and alert routing.
    const notas = await repo.listNotas(id)
    try {
      await scanAndAlertPastoralCrisis({
        resumen: parsed.resumen,
        notas: notas.map((n) => ({ contenido: n.contenido })),
        oneOnOneId: id,
        actorPersonaId: session.personaId,
      })
    } catch (scanError) {
      // Crisis scan failure should not affect the completed response
      console.error('[PastoralOneOnOne complete] Crisis scan failed:', scanError)
    }

    return NextResponse.json(result.oneOnOne)
  } catch (error) {
    console.error('[pastoral/one-on-one/[id]/complete POST] error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
