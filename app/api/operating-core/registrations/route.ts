/**
 * Registrations API — POST: create registration (authenticated, directors with manage capability).
 * Deny-by-default: flag → auth → capability → body → concurrency.
 */
import { NextRequest, NextResponse } from 'next/server'
import {
  isOperatingCoreEnabled,
  requireOperatingCoreSession,
  hasOperatingCoreEventsWriteCapability,
} from '@/lib/platform/operating-core/route-access'
import { createSupabaseRegistrationsRepository } from '@/lib/platform/operating-core/registrations/registration-repository-supabase'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { OperatingCoreConcurrencyConflictError } from '@/lib/platform/operating-core/errors'

const bad = (message: string) => NextResponse.json({ error: message }, { status: 400 })

function parseCreateBody(body: unknown): {
  personaId: string
  eventId: string
  confirmationMode: 'automatic' | 'manual'
  effectiveCapacity: number
  waitlistable: boolean
} | { error: string } {
  if (!body || typeof body !== 'object') return { error: 'Body inválido' }
  const b = body as Record<string, unknown>
  const { personaId, eventId, confirmationMode, effectiveCapacity, waitlistable } = b
  if (typeof personaId !== 'string' || !personaId.trim()) return { error: 'personaId es requerido' }
  if (typeof eventId !== 'string' || !eventId.trim()) return { error: 'eventId es requerido' }
  if (confirmationMode !== 'automatic' && confirmationMode !== 'manual') {
    return { error: 'confirmationMode debe ser automatic o manual' }
  }
  if (typeof effectiveCapacity !== 'number' || effectiveCapacity < 0) {
    return { error: 'effectiveCapacity debe ser >= 0' }
  }
  if (typeof waitlistable !== 'boolean') return { error: 'waitlistable es requerido' }
  return {
    personaId: personaId as string,
    eventId: eventId as string,
    confirmationMode: confirmationMode as 'automatic' | 'manual',
    effectiveCapacity,
    waitlistable,
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!isOperatingCoreEnabled()) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    const session = await requireOperatingCoreSession()
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    if (!hasOperatingCoreEventsWriteCapability(session)) {
      return NextResponse.json({ error: 'Permiso denegado' }, { status: 403 })
    }

    let body: unknown
    try { body = await req.json() } catch { return bad('Body inválido') }
    const parsed = parseCreateBody(body)
    if ('error' in parsed) return bad(parsed.error)

    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const repo = createSupabaseRegistrationsRepository({ supabase })

    // Fetch current counts for the event
    const confirmed = await repo.listByEvent(parsed.eventId, { state: 'confirmada' })
    const waitlist = await repo.listWaitlist(parsed.eventId)

    const outcome = await repo.create({
      personaId: parsed.personaId,
      eventId: parsed.eventId,
      confirmationMode: parsed.confirmationMode,
      effectiveCapacity: parsed.effectiveCapacity,
      waitlistable: parsed.waitlistable,
      currentConfirmedCount: confirmed.length,
      currentWaitlistLength: waitlist.length,
    })

    if (outcome.kind === 'capacity_conflict') {
      return NextResponse.json({ code: 'capacity_exceeded' }, { status: 409 })
    }
    if (outcome.kind === 'irreconcilable_idempotency') {
      return NextResponse.json({ code: 'already_registered' }, { status: 409 })
    }
    if (outcome.kind === 'invalid_transition') {
      return NextResponse.json({ code: 'invalid_transition' }, { status: 409 })
    }

    // Non-disclosing response — NO registrationId, NO personaId per spec
    if (outcome.kind === 'waitlisted') {
      return NextResponse.json({ outcome: 'waitlisted', waitlistPosition: outcome.waitlistPosition })
    }
    return NextResponse.json({ outcome: 'confirmed' })
  } catch (error) {
    if (error instanceof OperatingCoreConcurrencyConflictError) {
      return NextResponse.json({ error: 'Conflicto de concurrencia' }, { status: 409 })
    }
    console.error('[operating-core/registrations] POST error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
