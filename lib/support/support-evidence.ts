import { z } from 'zod'

export const diagnosticsConsentSchema = z.preprocess((value) => value === true || value === 'true' || value === 'on' || value === '1', z.boolean())

const supportEvidenceSchema = z.object({
  currentRoute: z.string().trim().max(500).optional(),
  browserName: z.string().trim().max(120).optional(),
  osName: z.string().trim().max(120).optional(),
  viewport: z.string().trim().max(40).optional(),
  appBuildVersion: z.string().trim().max(120).optional(),
  sentryEventId: z.string().trim().max(120).optional(),
  diagnosticsConsent: diagnosticsConsentSchema.optional(),
})

export function sanitizeSupportEvidence(input: Record<string, unknown>) {
  const parsed = supportEvidenceSchema.parse(input)
  const diagnosticsConsent = parsed.diagnosticsConsent ?? true

  return {
    current_route: sanitizeRouteEvidence(parsed.currentRoute),
    browser_name: diagnosticsConsent ? parsed.browserName || null : null,
    os_name: diagnosticsConsent ? parsed.osName || null : null,
    viewport: diagnosticsConsent ? parsed.viewport || null : null,
    app_build_version: diagnosticsConsent ? parsed.appBuildVersion || null : null,
    sentry_event_id: diagnosticsConsent ? parsed.sentryEventId || null : null,
    diagnostics_consent: diagnosticsConsent,
  }
}

function sanitizeRouteEvidence(route: string | undefined) {
  const [withoutHash] = (route ?? '').split('#', 1)
  const [withoutQuery] = withoutHash.split('?', 1)
  return withoutQuery || null
}
