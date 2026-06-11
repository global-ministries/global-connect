import type { Event } from '@sentry/nextjs'

type SentryBeforeSend = <TEvent extends Event>(event: TEvent) => TEvent | null
type SentryRequest = NonNullable<Event['request']>
type SentryBreadcrumb = NonNullable<Event['breadcrumbs']>[number]
type SentryBeforeBreadcrumb = (breadcrumb: SentryBreadcrumb) => SentryBreadcrumb | null

const FILTERED = '[Filtered]'

const SENSITIVE_HEADER_NAMES = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-csrf-token',
  'x-xsrf-token',
  'x-supabase-auth',
])

const SUPPORT_CONTEXT_ALLOWLIST = new Set(['sentryEventId'])

const SENSITIVE_BREADCRUMB_DATA_KEY = /(?:diagnostics?|evidence|attachments?|r2|sentry|github|request|headers?|cookies?|env|query_string|signed|object[_-]?key)/i
const ABSOLUTE_URL_PATTERN = /https?:\/\/[^\s)'"<>]+/gi
const SUPPORT_PATH_PATTERN = /\/(?:ayuda|support)(?:\/[^\s)'"<>?#]*)?(?:\?[^\s)'"<>#]*)?(?:#[^\s)'"<>]*)?/gi

export function createSentryReplayPrivacyOptions() {
  return {
    maskAllText: true,
    blockAllMedia: true,
  }
}

export function createSentryBeforeSend(): SentryBeforeSend {
  return (event) => scrubSentryEvent(event)
}

export function createSentryBeforeBreadcrumb(): SentryBeforeBreadcrumb {
  return (breadcrumb) => scrubBreadcrumb(breadcrumb)
}

export function createSentryPrivacyOptions() {
  return {
    sendDefaultPii: false,
    beforeSend: createSentryBeforeSend(),
    beforeSendTransaction: createSentryBeforeSend(),
    beforeBreadcrumb: createSentryBeforeBreadcrumb(),
  }
}

function scrubSentryEvent<TEvent extends Event>(event: TEvent): TEvent {
  const scrubbedEvent = {
    ...event,
    user: scrubUser(event.user),
    request: scrubRequest(event.request),
    contexts: scrubContexts(event.contexts),
    breadcrumbs: scrubBreadcrumbs(event.breadcrumbs),
    extra: undefined,
  }

  return scrubbedEvent as TEvent
}

function scrubUser(user: Event['user']): Event['user'] {
  if (!user?.id) {
    return undefined
  }

  return { id: user.id }
}

function scrubRequest(request: Event['request']): Event['request'] {
  if (!request) {
    return undefined
  }

  return {
    url: scrubUrl(request.url),
    headers: scrubHeaders(request.headers),
    data: request.data === undefined ? undefined : FILTERED,
  }
}

function scrubUrl(url: string | undefined): string | undefined {
  if (!url) {
    return undefined
  }

  try {
    const parsed = new URL(url)
    parsed.search = ''
    parsed.hash = ''
    return parsed.toString()
  } catch {
    return url.split(/[?#]/, 1)[0]
  }
}

function scrubHeaders(headers: SentryRequest['headers']): SentryRequest['headers'] {
  if (!headers) {
    return undefined
  }

  return Object.fromEntries(
    Object.entries(headers).filter(([name]) => !SENSITIVE_HEADER_NAMES.has(name.toLowerCase()))
  )
}

function scrubContexts(contexts: Event['contexts']): Event['contexts'] {
  if (!contexts) {
    return undefined
  }

  const scrubbedContexts: Event['contexts'] = { ...contexts }

  if (contexts.support) {
    scrubbedContexts.support = Object.fromEntries(
      Object.entries(contexts.support).filter(([key]) => SUPPORT_CONTEXT_ALLOWLIST.has(key))
    )
  }

  return scrubbedContexts
}

function scrubBreadcrumbs(breadcrumbs: Event['breadcrumbs']): Event['breadcrumbs'] {
  if (!breadcrumbs) {
    return undefined
  }

  return breadcrumbs.map(scrubBreadcrumb)
}

function scrubBreadcrumb(breadcrumb: SentryBreadcrumb): SentryBreadcrumb {
  return {
    ...breadcrumb,
    message: scrubBreadcrumbText(breadcrumb.message),
    data: scrubBreadcrumbData(breadcrumb.data),
  }
}

function scrubBreadcrumbText(text: string | undefined): string | undefined {
  if (!text) {
    return undefined
  }

  return text
    .replace(ABSOLUTE_URL_PATTERN, (url) => scrubUrl(url) ?? '')
    .replace(SUPPORT_PATH_PATTERN, (path) => scrubUrl(path) ?? '')
}

function scrubBreadcrumbData(data: SentryBreadcrumb['data']): SentryBreadcrumb['data'] {
  if (!data) {
    return undefined
  }

  return Object.fromEntries(
    Object.entries(data)
      .filter(([key]) => !SENSITIVE_BREADCRUMB_DATA_KEY.test(key))
      .map(([key, value]) => [key, scrubBreadcrumbDataValue(value)])
  )
}

function scrubBreadcrumbDataValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return scrubBreadcrumbText(value)
  }

  if (Array.isArray(value)) {
    return value.map(scrubBreadcrumbDataValue)
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !SENSITIVE_BREADCRUMB_DATA_KEY.test(key))
        .map(([key, nestedValue]) => [key, scrubBreadcrumbDataValue(nestedValue)])
    )
  }

  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
