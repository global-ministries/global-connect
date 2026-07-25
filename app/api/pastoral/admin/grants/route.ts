/**
 * W17 — DT-002 — POST /api/pastoral/admin/grants
 *
 * Grants or revokes pastoral.* capabilities to a persona.
 * Auth: requires pastoral.admin.manage (403 without capability).
 * Also 404 if pastoral flag is OFF.
 *
 * Body: { usuario_id: string, capability_key: string, action: 'grant' | 'revoke' }
 * Response: 200 with { persona_id, capability_key, granted_at, revoked_at } or 4xx with error.
 */
import { NextRequest, NextResponse } from 'next/server'
import {
  isPastoralRouteEnabled,
  requirePastoralSession,
  hasPastoralAdminManageCapability,
} from '@/lib/platform/pastoral/route-access'
import { PLATFORM_CAPABILITIES } from '@/lib/platform/experiences'
import { createSupabaseServerClient } from '@/lib/supabase/server'

interface RouteContext {
  params: Promise<Record<string, string>>
}

type GrantBody = {
  usuario_id?: string
  capability_key?: string
  action?: string
}

type GrantResult = {
  persona_id: string
  capability_key: string
  granted_at: string | null
  revoked_at: string | null
}

function bad(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}

function parseBody(body: unknown): GrantBody {
  if (!body || typeof body !== 'object') return {}
  const b = body as Record<string, unknown>
  return {
    usuario_id: typeof b.usuario_id === 'string' ? b.usuario_id.trim() : undefined,
    capability_key: typeof b.capability_key === 'string' ? b.capability_key.trim() : undefined,
    action: typeof b.action === 'string' ? b.action.trim() : undefined,
  }
}

function isPastoralCapability(key: string): boolean {
  return key.startsWith('pastoral.')
}

// Map a pastoral.* capability_key to its experience/scope_type from the
// platform catalog. Falls back to 'pastoral' / 'experience' if unknown
// so the grants table's NOT NULL constraints are always satisfied.
function resolvePastoralScope(capabilityKey: string): { experience: string; scopeType: string } {
  const definition = PLATFORM_CAPABILITIES[capabilityKey as keyof typeof PLATFORM_CAPABILITIES]
  if (definition) {
    return { experience: definition.experience, scopeType: definition.scopeType }
  }
  return { experience: 'pastoral', scopeType: 'experience' }
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    if (!isPastoralRouteEnabled()) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const session = await requirePastoralSession()
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    if (!hasPastoralAdminManageCapability(session)) {
      return NextResponse.json({ error: 'Permiso denegado' }, { status: 403 })
    }

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return bad('Body requerido')
    }

    const parsed = parseBody(body)
    if (!parsed.usuario_id) return bad('usuario_id es requerido')
    if (!parsed.capability_key) return bad('capability_key es requerido')
    if (!parsed.action || !['grant', 'revoke'].includes(parsed.action)) {
      return bad('action debe ser "grant" o "revoke"')
    }

    // Validate capability is pastoral.*
    if (!isPastoralCapability(parsed.capability_key)) {
      return bad('Solo capabilities pastoral.* son permitidas')
    }

    const supabase = await createSupabaseServerClient()
    const now = new Date().toISOString()
    const capabilityKey = parsed.capability_key
    const { experience, scopeType } = resolvePastoralScope(capabilityKey)

    if (parsed.action === 'grant') {
      // Upsert: INSERT or UPDATE dream_team_capability_grants
      const { error } = await supabase
        .from('dream_team_capability_grants')
        .upsert(
          {
            persona_id: parsed.usuario_id,
            capability_key: capabilityKey,
            experience,
            scope_type: scopeType,
            scope_id: null,
            source: 'pastoral_admin',
            granted_at: now,
            revoked_at: null,
          },
          { onConflict: 'persona_id,capability_key,experience,scope_type,scope_id,source' }
        )

      if (error) {
        console.error('[pastoral/admin/grants POST] upsert error:', error)
        return NextResponse.json({ error: 'Error interno' }, { status: 500 })
      }

      const result: GrantResult = {
        persona_id: parsed.usuario_id,
        capability_key: capabilityKey,
        granted_at: now,
        revoked_at: null,
      }
      return NextResponse.json(result)
    } else {
      // Revoke: UPDATE set revoked_at for ALL active grants matching this (persona, capability).
      const { error } = await supabase
        .from('dream_team_capability_grants')
        .update({ revoked_at: now })
        .eq('persona_id', parsed.usuario_id)
        .eq('capability_key', capabilityKey)
        .is('revoked_at', null)

      if (error) {
        console.error('[pastoral/admin/grants POST] revoke error:', error)
        return NextResponse.json({ error: 'Error interno' }, { status: 500 })
      }

      const result: GrantResult = {
        persona_id: parsed.usuario_id,
        capability_key: capabilityKey,
        granted_at: null,
        revoked_at: now,
      }
      return NextResponse.json(result)
    }
  } catch (error) {
    console.error('[pastoral/admin/grants POST] error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
