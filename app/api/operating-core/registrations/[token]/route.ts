/**
 * Public token registration endpoint (no auth required).
 * - Consumes the token atomically (single-use)
 * - Creates a registration via RegistrationsRepository
 * - Rate limited per (token_hash, ip_address): 10 req/min
 * - Threat matrix: invalid/replay/expired → 404 (NOT 409 to avoid existence disclosure)
 * - Non-disclosing response: NO registrationId, NO personaId
 */
import { NextRequest, NextResponse } from 'next/server'
import { createSupabasePublicTokensRepository } from '@/lib/platform/operating-core/public-tokens/public-token-repository-supabase'
import { createSupabaseRegistrationsRepository } from '@/lib/platform/operating-core/registrations/registration-repository-supabase'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { hashPublicToken } from '@/lib/platform/operating-core/public-tokens/token-hash'

// ─── Rate limiter ──────────────────────────────────────────────────────────────

interface RateLimitEntry {
  count: number
  resetAt: number // ms timestamp when window resets
}

const rateLimitMap = new Map<string, RateLimitEntry>()

const RATE_LIMIT = 10       // requests per window
const RATE_WINDOW_MS = 60 * 1000 // 1 minute

function rateLimitKey(tokenHash: string, ip: string): string {
  return `${tokenHash}:${ip}`
}

function checkRateLimit(tokenHash: string, ip: string): boolean {
  const key = rateLimitKey(tokenHash, ip)
  const now = Date.now()
  const entry = rateLimitMap.get(key)

  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return true
  }

  if (entry.count >= RATE_LIMIT) {
    return false
  }

  entry.count++
  return true
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const bad = (message: string) => NextResponse.json({ error: message }, { status: 400 })

function getClientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? req.headers.get('x-real-ip') ?? 'unknown'
}

function parseBody(body: unknown): {
  rawToken: string
  resourceType: string
  resourceId: string
  personaId?: string
} | { error: string } {
  if (!body || typeof body !== 'object') return { error: 'Body inválido' }
  const b = body as Record<string, unknown>
  const { rawToken, resourceType, resourceId, personaId } = b
  if (typeof rawToken !== 'string' || !rawToken.trim()) return { error: 'rawToken es requerido' }
  if (typeof resourceType !== 'string' || !resourceType.trim()) return { error: 'resourceType es requerido' }
  if (typeof resourceId !== 'string' || !resourceId.trim()) return { error: 'resourceId es requerido' }
  return {
    rawToken: rawToken as string,
    resourceType: resourceType as string,
    resourceId: resourceId as string,
    personaId: typeof personaId === 'string' ? personaId : undefined,
  }
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    let body: unknown
    try { body = await req.json() } catch { return bad('Body inválido') }
    const parsed = parseBody(body)
    if ('error' in parsed) return bad(parsed.error)

    const { rawToken, resourceType, resourceId, personaId: preassignedPersonaId } = parsed
    const ip = getClientIp(req)

    // Hash the raw token to get the token_hash
    const tokenHash = hashPublicToken(rawToken)

    // Rate limit check BEFORE any DB work
    if (!checkRateLimit(tokenHash, ip)) {
      return NextResponse.json({ error: 'Demasiadas solicitudes' }, { status: 429 })
    }

    const supabase = await createSupabaseServerClient()
    const tokensRepo = createSupabasePublicTokensRepository({ supabase })
    const regsRepo = createSupabaseRegistrationsRepository({ supabase })

    // Step 1: Atomic token claim
    // concurrent callers: exactly ONE wins; others get token_not_found → 404
    const claimOutcome = await tokensRepo.claim(tokenHash, null)

    if (!claimOutcome.ok) {
      // Per spec: invalid/replay/expired → 404 (NOT 409 to avoid existence disclosure)
      return NextResponse.json({ error: 'Token inválido o expirado' }, { status: 404 })
    }

    const tokenRow = claimOutcome.row

    // Verify resource matches (defense in depth)
    if (tokenRow.resource_type !== resourceType || tokenRow.resource_id !== resourceId) {
      return NextResponse.json({ error: 'Token inválido o expirado' }, { status: 404 })
    }

    // Step 2: Create registration
    // Use pre-assigned persona if token has one, otherwise require one in the request
    const effectivePersonaId = tokenRow.persona_id ?? preassignedPersonaId ?? null

    if (!effectivePersonaId) {
      return NextResponse.json({ error: 'Persona no especificada' }, { status: 400 })
    }

    // For public token flow, we default to automatic confirmation mode
    // The event's confirmation mode is looked up from the event; for now use automatic
    // NOTE: In a full implementation, we'd look up the event to get its confirmation mode
    // For this slice, we use 'automatic' with waitlistable=true as the default
    const confirmed = await regsRepo.listByEvent(resourceId, { state: 'confirmada' })
    const waitlist = await regsRepo.listWaitlist(resourceId)

    // Effective capacity defaults — in full impl, this comes from the event
    const effectiveCapacity = 100 // placeholder — real impl reads from event
    const waitlistable = true

    const outcome = await regsRepo.create({
      personaId: effectivePersonaId,
      eventId: resourceId,
      confirmationMode: 'automatic',
      effectiveCapacity,
      waitlistable,
      currentConfirmedCount: confirmed.length,
      currentWaitlistLength: waitlist.length,
    })

    if (outcome.kind === 'capacity_conflict') {
      // Per spec: capacity conflict → 409
      return NextResponse.json({ code: 'capacity_exceeded' }, { status: 409 })
    }
    if (outcome.kind === 'irreconcilable_idempotency') {
      // Already registered → 409
      return NextResponse.json({ code: 'already_registered' }, { status: 409 })
    }

    // Non-disclosing response — NO registrationId, NO personaId per spec
    if (outcome.kind === 'waitlisted') {
      return NextResponse.json({ outcome: 'waitlisted', waitlistPosition: outcome.waitlistPosition })
    }
    return NextResponse.json({ outcome: 'confirmed' })
  } catch (error) {
    console.error('[operating-core/registrations/token] POST error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
