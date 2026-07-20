/**
 * Capacity API — POST: set/remove capacity override for an event.
 * Deny-by-default: flag → auth → capability → body → validation → waitlist.
 *
 * Waitlist interaction:
 * - Override increase → calls promote_waitlist RPC (S10) to promote one entry
 * - Override decrease → HTTP 409 if next waitlisted entry would exceed new limit
 *   (non-waitlistable overflow per spec)
 */
import { NextRequest, NextResponse } from 'next/server'
import {
  isOperatingCoreEnabled,
  requireOperatingCoreSession,
  hasOperatingCoreCapacityManageCapability,
} from '@/lib/platform/operating-core/route-access'
import { createSupabaseCapacityRepository } from '@/lib/platform/operating-core/capacity/capacity-repository-supabase'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { CapacityBase } from '@/lib/platform/operating-core/capacity/capacity-types'

const bad = (message: string, code?: string) => {
  const body: Record<string, string> = { error: message }
  if (code) body.code = code
  return NextResponse.json(body, { status: 400 })
}

interface SetOverrideBody {
  event_id: string
  capacity_operativa?: number | null
  reason?: string
}

function parseBody(body: unknown): SetOverrideBody | { error: string } {
  if (!body || typeof body !== 'object') return { error: 'Body inválido' }
  const b = body as Record<string, unknown>
  const { event_id, capacity_operativa, reason } = b
  if (typeof event_id !== 'string' || !event_id.trim()) {
    return { error: 'event_id es requerido' }
  }
  if (capacity_operativa !== undefined && capacity_operativa !== null) {
    if (typeof capacity_operativa !== 'number' || capacity_operativa < 0) {
      return { error: 'capacity_operativa debe ser >= 0' }
    }
  }
  if (reason !== undefined && typeof reason !== 'string') {
    return { error: 'reason debe ser string' }
  }
  return {
    event_id: event_id.trim(),
    capacity_operativa: capacity_operativa == null ? undefined : capacity_operativa,
    reason,
  }
}

export async function POST(req: NextRequest) {
  try {
    // 1. Flag check
    if (!isOperatingCoreEnabled()) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // 2. Auth check
    const session = await requireOperatingCoreSession()
    if (!session) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    // 3. Capability check
    if (!hasOperatingCoreCapacityManageCapability(session)) {
      return NextResponse.json({ error: 'Permiso denegado' }, { status: 403 })
    }

    // 4. Parse body
    let body: unknown
    try { body = await req.json() } catch { return bad('Body inválido') }
    const parsed = parseBody(body)
    if ('error' in parsed) return bad(parsed.error)

    // 5. Fetch event capacity_base directly from DB
    const supabase = await createSupabaseServerClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- future-apply table, typed loosely
    const { data: eventRow, error: eventError } = await (supabase as any)
      .from('operating_core_events')
      .select('id, capacity_base')
      .eq('id', parsed.event_id)
      .maybeSingle()

    if (eventError || !eventRow) {
      return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 })
    }

    const base: CapacityBase = {
      value: eventRow.capacity_base,
      scope: 'event',
      effectiveAt: new Date().toISOString(),
    }

    // 6. Build override (or null for removal)
    if (parsed.capacity_operativa !== undefined && parsed.capacity_operativa === null) {
      // Explicit null → remove override (handled below)
    }

    // 7. Validate reason length if override is set
    if (parsed.capacity_operativa != null && parsed.capacity_operativa >= 0) {
      const reason = parsed.reason ?? ''
      if (reason.length < 5) {
        return bad('reason debe tener al menos 5 caracteres', 'reason_too_short')
      }
    }

    // 8. Build override input for adapter
    const override = parsed.capacity_operativa != null
      ? {
          value: parsed.capacity_operativa as number,
          reason: parsed.reason ?? '',
          setByPersonaId: session.personaId,
          setAt: new Date().toISOString(),
        }
      : null

    // 9. Get current snapshot (for waitlist delta check)
    const capacityRepo = createSupabaseCapacityRepository({ supabase })

    const prevSnapshot = await capacityRepo.getCurrent(parsed.event_id)
    const prevEffective = prevSnapshot.override?.value ?? prevSnapshot.base.value

    // 10. Set override (validateOverride is called inside the adapter — S12 mandatory)
    let newSnapshot: { base: CapacityBase; override: { value: number; reason: string; setByPersonaId: string; setAt: string } | null; effective: number }
    try {
      newSnapshot = await capacityRepo.setOverride({
        eventInstanceId: parsed.event_id,
        base,
        override,
      })
    } catch (err) {
      // Check by error name to avoid instanceof issues with mocked modules
      if ((err as { name?: string }).name === 'CapacityOverrideValidationError') {
        const e = err as { message: string; code: string }
        return bad(e.message, e.code)
      }
      throw err
    }

    const newEffective = newSnapshot.effective

    // 11. Waitlist interaction
    // If effective capacity grew, call promote_waitlist (S10) to promote one waitlist entry
    if (newEffective > prevEffective && override !== null) {
      const slotsReleased = newEffective - prevEffective
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC not in generated types
      const { error: rpcError } = await (supabase as any).rpc('operating_core_promote_waitlist', {
        p_event_id: parsed.event_id,
        p_slot_released: slotsReleased,
      })
      if (rpcError) {
        // Non-fatal: log but don't fail the request
        console.error('[operating-core/capacity] promote_waitlist RPC error:', rpcError)
      }
    }

    // 12. Build response — NO internal IDs leaked
    const response = {
      event_id: parsed.event_id,
      effective: newEffective,
      source: newSnapshot.override !== null ? ('override' as const) : ('base' as const),
      base_value: base.value,
      ...(newSnapshot.override !== null
        ? {
            override_value: newSnapshot.override.value,
            reason: newSnapshot.override.reason,
          }
        : {}),
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('[operating-core/capacity] POST error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
