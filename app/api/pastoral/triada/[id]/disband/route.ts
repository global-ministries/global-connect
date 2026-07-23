/**
 * W08 — DT-048 — POST /api/pastoral/triada/[id]/disband
 *
 * Disbands a pastoral triada with motivo from the closed catalog.
 * Only mentor oficial (or pastoral.read.all) can disband.
 *
 * Branches:
 * - 404: pastoral flag off or triada not found
 * - 401: no session
 * - 403: no pastoral.triada.disband capability OR not mentor oficial
 * - 400: missing motivo (ESC-05 of pastoral-triada-disband)
 * - 400: motivo not in closed catalog
 * - 409: stale version
 * - 409: already disbanded (ESC-04)
 * - 200: happy path with updated triada
 */
import { NextRequest, NextResponse } from 'next/server'
import {
  isPastoralRouteEnabled,
  requirePastoralSession,
  hasPastoralTriadaDisbandCapability,
} from '@/lib/platform/pastoral/route-access'
import { createPastoralTriadaRepository } from '@/lib/platform/pastoral/triad/factories'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createPastoralTriadaService } from '@/lib/platform/pastoral/triad/service'
import { createSupabasePastoralLedgerWriter } from '@/lib/platform/pastoral/participation-ledger-pastoral-writer'
import { createSupabaseParticipationLedgerRepository } from '@/lib/platform/operating-core/participation-ledger-repository-supabase'
import {
  isConcurrencyConflict,
  isTerminalState,
  isMissingMotivo,
  isInvalidMotivoForTransition,
  isPastoralNotFound,
} from '@/lib/platform/pastoral/errors'

const bad = (message: string) => NextResponse.json({ error: message }, { status: 400 })

interface RouteContext {
  params: Promise<{ id: string }>
}

function parseDisbandBody(body: unknown): {
  readonly motivo: string
  readonly expectedVersion: number
} | { error: string } {
  if (!body || typeof body !== 'object') return { error: 'Body inválido' }
  const b = body as Record<string, unknown>
  const motivo = typeof b.motivo === 'string' ? b.motivo.trim() : ''
  if (!motivo) return { error: 'motivo es requerido' }
  const expectedVersion = typeof b.expectedVersion === 'number' ? b.expectedVersion : NaN
  if (Number.isNaN(expectedVersion)) return { error: 'expectedVersion es requerido' }
  return { motivo, expectedVersion }
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    if (!isPastoralRouteEnabled()) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const session = await requirePastoralSession()
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    if (!hasPastoralTriadaDisbandCapability(session)) {
      return NextResponse.json({ error: 'Permiso denegado' }, { status: 403 })
    }

    const { id } = await context.params
    if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })

    let body: unknown
    try { body = await req.json() } catch { return bad('Body inválido') }
    const parsed = parseDisbandBody(body)
    if ('error' in parsed) return bad(parsed.error)

    const supabase = await createSupabaseServerClient()
    const repo = createPastoralTriadaRepository({ useFake: false, client: supabase as any })

    // Check: only mentor oficial can disband (403)
    const triada = await repo.getTriadaById(id)
    if (!triada) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
    if (triada.mentorOficialPersonaId !== session.personaId) {
      return NextResponse.json({ error: 'Solo el mentor oficial puede disolver la tríada' }, { status: 403 })
    }

    const ledgerRepo = createSupabaseParticipationLedgerRepository(supabase as any)
    const ledgerWriter = createSupabasePastoralLedgerWriter(supabase as any)
    const service = createPastoralTriadaService(repo, ledgerWriter)

    const result = await service.disbandTriadaWithAudit({
      triadaId: id,
      actorPersonaId: session.personaId,
      motivo: parsed.motivo as 'gdv_liderazgo_removed' | 'servicio_retirado' | 'cambio_de_temporada' | 'pastoral_decision' | 'otro',
      expectedVersion: parsed.expectedVersion,
    })

    if (!result.ok) {
      if (isConcurrencyConflict(result.error)) {
        return NextResponse.json({ error: 'Versión obsoleta' }, { status: 409 })
      }
      if (isPastoralNotFound(result.error)) {
        return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
      }
      if (isTerminalState(result.error)) {
        return NextResponse.json({ error: 'La tríada ya está disuelta' }, { status: 409 })
      }
      if (isMissingMotivo(result.error) || isInvalidMotivoForTransition(result.error)) {
        return NextResponse.json({ error: result.error.message }, { status: 400 })
      }
      return NextResponse.json({ error: result.error.message }, { status: 400 })
    }

    return NextResponse.json(result.triada)
  } catch (error) {
    console.error('[pastoral/triada/[id]/disband POST] error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
