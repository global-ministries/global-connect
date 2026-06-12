import type { Event } from '@sentry/nextjs'
import { readFileSync } from 'node:fs'

import {
  createSentryBeforeBreadcrumb,
  createSentryBeforeSend,
  createSentryPrivacyOptions,
  createSentryReplayPrivacyOptions,
} from '@/lib/support/sentry-privacy'

describe('Sentry privacy hardening', () => {
  it('keeps runtime config files free of default PII and default replay sampling', () => {
    const clientConfig = readFileSync('instrumentation-client.ts', 'utf8')
    const serverConfig = readFileSync('sentry.server.config.ts', 'utf8')
    const edgeConfig = readFileSync('sentry.edge.config.ts', 'utf8')
    const configs = [clientConfig, serverConfig, edgeConfig].join('\n')

    expect(configs).toContain('createSentryPrivacyOptions')
    expect(clientConfig).toContain('createSentryReplayPrivacyOptions')
    expect(configs).not.toMatch(/sendDefaultPii:\s*true/)
    expect(clientConfig).not.toMatch(/replaysSessionSampleRate:\s*(?!0\b)\d/)
    expect(clientConfig).not.toMatch(/replaysOnErrorSampleRate:\s*(?!0\b)\d/)
  })

  it('disables default PII and raw replay capture in client options', () => {
    expect(createSentryPrivacyOptions()).toEqual({
      sendDefaultPii: false,
      beforeSend: expect.any(Function),
      beforeSendTransaction: expect.any(Function),
      beforeBreadcrumb: expect.any(Function),
    })
    expect(createSentryReplayPrivacyOptions()).toEqual({
      maskAllText: true,
      blockAllMedia: true,
    })
  })

  it('keeps server and edge options consistent without replay-only options', () => {
    expect(createSentryPrivacyOptions()).toEqual({
      sendDefaultPii: false,
      beforeSend: expect.any(Function),
      beforeSendTransaction: expect.any(Function),
      beforeBreadcrumb: expect.any(Function),
    })
  })

  it('scrubs support routes, query strings, request metadata, headers, request data, and user PII before sending', () => {
    const beforeSend = createSentryBeforeSend()
    const event: Event = {
      event_id: 'event-1',
      user: {
        id: 'usuario-1',
        email: 'reporter@example.com',
        username: 'Reporter',
        ip_address: '127.0.0.1',
      },
      request: {
        url: 'https://app.example.com/ayuda/reportar?token=secret&sentry=raw&attachment=support/ticket-1/file.png',
        query_string: 'token=secret&sentry=raw&attachment=support/ticket-1/file.png',
        cookies: { session: 'secret' },
        env: {
          REMOTE_ADDR: '127.0.0.1',
          HTTP_COOKIE: 'session=secret',
        },
        headers: {
          cookie: 'session=secret',
          authorization: 'Bearer secret',
          'x-csrf-token': 'csrf-secret',
          'user-agent': 'Chrome',
        },
        data: {
          password: 'secret',
          diagnostics: { localStorage: 'secret', viewport: '1920x1080' },
          r2ObjectKey: 'support/ticket-1/attachment-1/file.png',
          githubIssueBody: 'private GitHub details',
          rawSentryPayload: { token: 'secret' },
          description: 'private support description',
        },
      },
      contexts: {
        support: {
          sentryEventId: 'reference-ok',
          diagnostics: { route: '/ayuda?token=secret' },
          attachmentKey: 'support/ticket-1/attachment-1/file.png',
          githubIssue: { body: 'private details' },
          rawSentryPayload: { token: 'secret' },
        },
      },
      extra: {
        supportEvidence: {
          route: '/ayuda/tickets/ticket-1?email=reporter@example.com',
          browser: 'Chrome',
        },
        r2Key: 'support/ticket-1/attachment-1/file.png',
      },
    }

    const scrubbed = beforeSend(event)

    expect(scrubbed?.user).toEqual({ id: 'usuario-1' })
    expect(scrubbed?.request?.url).toBe('https://app.example.com/ayuda/reportar')
    expect(scrubbed?.request?.headers).toEqual({ 'user-agent': 'Chrome' })
    expect(scrubbed?.request?.data).toBe('[Filtered]')
    expect(scrubbed?.request).not.toHaveProperty('query_string')
    expect(scrubbed?.request).not.toHaveProperty('cookies')
    expect(scrubbed?.request).not.toHaveProperty('env')
    expect(scrubbed?.contexts?.support).toEqual({ sentryEventId: 'reference-ok' })
    expect(scrubbed?.extra).toBeUndefined()

    expect(JSON.stringify(scrubbed)).not.toMatch(/secret|cookie|authorization|csrf|localStorage|support\/ticket-1|rawSentry|github|private support|reporter@example.com|token=/i)
  })

  it('scrubs relative URLs and drops user objects that only contain PII', () => {
    const scrubbed = createSentryBeforeSend()({
      event_id: 'event-2',
      user: { email: 'only-pii@example.com', ip_address: '10.0.0.1' },
      request: {
        url: '/ayuda/tickets/ticket-1?email=only-pii@example.com#private',
        headers: {
          Authorization: 'Bearer secret',
          Cookie: 'session=secret',
          accept: 'application/json',
        },
      },
      contexts: {
        support: { route: '/ayuda?token=secret' },
      },
    })

    expect(scrubbed?.user).toBeUndefined()
    expect(scrubbed?.request?.url).toBe('/ayuda/tickets/ticket-1')
    expect(scrubbed?.request?.headers).toEqual({ accept: 'application/json' })
    expect(scrubbed?.contexts?.support).toEqual({})
    expect(JSON.stringify(scrubbed)).not.toMatch(/secret|only-pii|token=|session=/i)
  })

  it('scrubs breadcrumb support URL query strings and hashes before capture', () => {
    const beforeBreadcrumb = createSentryBeforeBreadcrumb()

    const scrubbed = beforeBreadcrumb({
      category: 'navigation',
      message: 'Navigated to /ayuda/tickets/ticket-1?email=reporter@example.com&token=secret#private',
      data: {
        href: 'https://app.example.com/ayuda/reportar?token=secret#private',
        previous: '/support/cases/case-1?session=secret#details',
      },
    })

    expect(scrubbed?.message).toBe('Navigated to /ayuda/tickets/ticket-1')
    expect(scrubbed?.data).toEqual({
      href: 'https://app.example.com/ayuda/reportar',
      previous: '/support/cases/case-1',
    })
    expect(JSON.stringify(scrubbed)).not.toMatch(/reporter@example.com|token=|session=|#private|#details/i)
  })

  it('removes sensitive breadcrumb diagnostic, evidence, attachment, R2, Sentry, and GitHub data', () => {
    const beforeBreadcrumb = createSentryBeforeBreadcrumb()

    const scrubbed = beforeBreadcrumb({
      category: 'support',
      message: 'Support diagnostics collected',
      data: {
        action: 'submit_support_ticket',
        diagnostics: { localStorage: 'secret' },
        supportEvidence: { route: '/ayuda?token=secret' },
        attachments: ['support/ticket-1/file.png'],
        r2ObjectKey: 'support/ticket-1/file.png',
        signedUrl: 'https://r2.example.com/support/ticket-1/file.png?X-Amz-Signature=secret',
        objectKey: 'support/ticket-1/file.png',
        sentryEventId: 'event-secret',
        githubIssueBody: 'private GitHub details',
        nested: {
          githubUrl: 'https://github.com/org/repo/issues/1?token=secret',
          safeUrl: '/ayuda/tickets/ticket-1?email=reporter@example.com#private',
        },
      },
    })

    expect(scrubbed?.data).toEqual({
      action: 'submit_support_ticket',
      nested: {
        safeUrl: '/ayuda/tickets/ticket-1',
      },
    })
    expect(JSON.stringify(scrubbed)).not.toMatch(/secret|localStorage|support\/ticket-1|github|private GitHub|event-secret|signed|objectKey|token=|reporter@example.com/i)
  })

  it('scrubs breadcrumbs already attached to events before sending', () => {
    const scrubbed = createSentryBeforeSend()({
      event_id: 'event-3',
      breadcrumbs: [
        {
          category: 'fetch',
          message: 'GET /ayuda/reportar?token=secret#private',
          data: {
            requestHeaders: { authorization: 'Bearer secret' },
            url: '/ayuda/reportar?token=secret#private',
          },
        },
      ],
    })

    expect(scrubbed?.breadcrumbs).toEqual([
      {
        category: 'fetch',
        message: 'GET /ayuda/reportar',
        data: {
          url: '/ayuda/reportar',
        },
      },
    ])
    expect(JSON.stringify(scrubbed)).not.toMatch(/secret|authorization|token=|#private/i)
  })
})
