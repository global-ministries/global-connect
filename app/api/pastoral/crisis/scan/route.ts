/**
 * W09 — DT-055 — POST /api/pastoral/crisis/scan
 *
 * Internal crisis scan endpoint.
 * Only accessible by service_role (no normal capability check).
 * Invoked by: complete endpoint (DT-041, W06) and other internal callers.
 *
 * Request body: { one_on_one_id: string }
 * Returns: PastoralCrisisScanResult | null (null = no crisis detected)
 *
 * The endpoint:
 *   1. Looks up the 1:1 record (resumen + notas)
 *   2. Calls scanAndAlertPastoralCrisis(service)
 *   3. Returns result
 */

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createPastoralLedgerWriter } from '@/lib/platform/pastoral/participation-ledger-pastoral-writer'
import { createPastoralCrisisService } from '@/lib/platform/pastoral/crisis/service'
import type { PastoralCrisisScanResult } from '@/lib/platform/pastoral/crisis/service'

// ─── Request/Response types ─────────────────────────────────────────────────────

interface ScanRequestBody {
  readonly one_on_one_id: string
}

// ─── POST ───────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // service_role only — this is an internal endpoint.
  // No public session check needed.

  // Parse body
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Body requerido' }, { status: 400 })
  }

  const b = body as Record<string, unknown>
  const oneOnOneId = typeof b.one_on_one_id === 'string' ? b.one_on_one_id.trim() : ''

  if (!oneOnOneId) {
    return NextResponse.json({ error: 'one_on_one_id es requerido' }, { status: 400 })
  }

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(oneOnOneId)) {
    return NextResponse.json({ error: 'one_on_one_id debe ser un UUID válido' }, { status: 400 })
  }

  try {
    // Create service_role Supabase client
    const supabase = await createSupabaseServerClient()

    // Create pastoral ledger writer
    const ledgerWriter = createSupabaseLedgerWriter(supabase as any)

    // Create crisis service
    const crisisService = createPastoralCrisisService({
      supabase: supabase as any,
      ledgerWriter,
    })

    // ── Step 1: Fetch 1:1 record with resumen and notas ─────────────────
    const { data: ooo, error: oooError } = await (supabase as any)
      .from('pastoral_one_on_one')
      .select('id, resumen, mentor_oficial_persona_id')
      .eq('id', oneOnOneId)
      .maybeSingle()

    if (oooError) {
      console.error('[pastoral/crisis/scan] failed to fetch 1:1:', oooError)
      return NextResponse.json({ error: 'Error al obtener el registro' }, { status: 500 })
    }

    if (!ooo) {
      return NextResponse.json({ error: 'Registro no encontrado' }, { status: 404 })
    }

    // ── Step 2: Fetch notas ──────────────────────────────────────────────
    const { data: notas, error: notasError } = await (supabase as any)
      .from('pastoral_one_on_one_notas')
      .select('id, contenido')
      .eq('one_on_one_id', oneOnOneId)

    if (notasError) {
      console.error('[pastoral/crisis/scan] failed to fetch notas:', notasError)
      return NextResponse.json({ error: 'Error al obtener las notas' }, { status: 500 })
    }

    // ── Step 3: Invoke crisis scan ───────────────────────────────────────
    const result = await crisisService.scanAndAlertPastoralCrisis({
      resumen: ooo.resumen ?? null,
      notas: (notas ?? []).map((n: { id: string; contenido: string }) => ({
        id: n.id,
        contenido: n.contenido,
      })),
      oneOnOneId,
      actorPersonaId: ooo.mentor_oficial_persona_id,
    })

    const response = result !== null
      ? result satisfies PastoralCrisisScanResult
      : null

    return NextResponse.json(response, { status: 200 })
  } catch (error) {
    console.error('[pastoral/crisis/scan] error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

// ─── Ledger writer factory (inline to avoid circular imports) ───────────────────

function createSupabaseLedgerWriter(supabase: any) {
  // Dynamic import to break circular dependency at runtime
  // eslint-disable-next-line @typescript-eslint/no-shadow
  const { createSupabaseParticipationLedgerRepository } = require('@/lib/platform/operating-core/participation-ledger-repository-supabase')
  const repository = createSupabaseParticipationLedgerRepository(supabase)
  return createPastoralLedgerWriter(repository)
}
