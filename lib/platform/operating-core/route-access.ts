/**
 * Route access helpers for Operating Core.
 * Mirrors dream-team/route-access.ts pattern.
 * Capability-based only — no role-string checks.
 */
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { findPlatformSessionPersonaByAuthId, resolveReadOnlyPlatformSession } from '@/lib/auth/platformSessionReadOnly'
import { PLATFORM_CAPABILITIES, resolvePlatformCapability } from '@/lib/platform/experiences'
import type { PlatformSession } from '@/lib/platform/session/types'

const EVENTS_READ = ['operating_core.events.read'] as const
const EVENTS_WRITE = ['operating_core.events.manage'] as const
const SERVICES_READ = ['operating_core.services.read'] as const
const SERVICES_WRITE = ['operating_core.services.manage'] as const
const CAPACITY_WRITE = ['operating_core.capacity.manage'] as const
const FORMS_MANAGE = ['operating_core.forms.manage'] as const
const FORMS_SUBMIT = ['operating_core.forms.submit'] as const
const RESOURCES_MANAGE = ['operating_core.resources.manage'] as const
const OUTBOX_DRAIN = ['operating_core.outbox.drain'] as const

/**
 * Flag check — mirrors dream-team flag pattern.
 * Reads env var directly since getOperatingCoreFlags is not yet in flags.ts.
 */
export const isOperatingCoreEnabled = (env: NodeJS.ProcessEnv = process.env) =>
  env.NEXT_PUBLIC_OPERATING_CORE_ENABLED === 'on'

export async function requireOperatingCoreSession() {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  return resolveReadOnlyPlatformSession({
    subjectAuthId: user.id,
    findPersonaByAuthId: (authId) => findPlatformSessionPersonaByAuthId(supabase, authId),
  })
}

function toActor(session: PlatformSession) {
  return {
    personaId: session.personaId,
    allowedFlows: ['operating_core.api'],
    grants: session.capabilities.map((c) => ({
      key: c.key,
      scope: { experience: c.experience, type: c.scopeType, ...(c.scopeId ? { id: c.scopeId } : {}) },
      source: c.source,
    })),
  }
}

function hasCapability(session: PlatformSession, key: string) {
  const def = PLATFORM_CAPABILITIES[key as keyof typeof PLATFORM_CAPABILITIES]
  if (!def) return false
  return resolvePlatformCapability({
    actor: toActor(session),
    flow: 'operating_core.api',
    required: { key, scope: { experience: def.experience, type: def.scopeType } },
  }).ok
}

export const hasOperatingCoreEventsReadCapability = (session: PlatformSession) =>
  EVENTS_READ.some((key) => hasCapability(session, key))

export const hasOperatingCoreEventsWriteCapability = (session: PlatformSession) =>
  EVENTS_WRITE.some((key) => hasCapability(session, key))

export const hasOperatingCoreServicesReadCapability = (session: PlatformSession) =>
  SERVICES_READ.some((key) => hasCapability(session, key))

export const hasOperatingCoreServicesWriteCapability = (session: PlatformSession) =>
  SERVICES_WRITE.some((key) => hasCapability(session, key))

export const hasOperatingCoreCapacityManageCapability = (session: PlatformSession) =>
  CAPACITY_WRITE.some((key) => hasCapability(session, key))

export const hasOperatingCoreFormsManageCapability = (session: PlatformSession) =>
  FORMS_MANAGE.some((key) => hasCapability(session, key))

export const hasOperatingCoreFormsSubmitCapability = (session: PlatformSession) =>
  FORMS_SUBMIT.some((key) => hasCapability(session, key))

export const hasOperatingCoreResourcesManageCapability = (session: PlatformSession) =>
  RESOURCES_MANAGE.some((key) => hasCapability(session, key))

export const hasOperatingCoreOutboxDrainCapability = (session: PlatformSession) =>
  OUTBOX_DRAIN.some((key) => hasCapability(session, key))
