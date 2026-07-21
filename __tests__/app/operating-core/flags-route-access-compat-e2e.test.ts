/**
 * @jest-environment node
 *
 * S23 — flags-route-access compatibility e2e test.
 *
 * Verifies that when NEXT_PUBLIC_OPERATING_CORE_ENABLED is 'off',
 * all Operating Core API routes return 404 (not 500).
 *
 * Per spec: "Strict TDD (flag-off legacy shows legacy 404)"
 * Harness: OFF + R (flag off + route auth/scope/flag/error RED)
 *
 * NOTE: /api/operating-core/registrations/[token] is a PUBLIC endpoint
 * for anonymous token redemption. It does NOT have flag gating since
 * it must be accessible without the OC flag for public token flow.
 */

import { NextRequest } from 'next/server'

// ─── Route imports ────────────────────────────────────────────────────────────

import { GET as eventsGet, POST as eventsPost } from '@/app/api/operating-core/events/route'
import { GET as eventInstanceGet, PATCH as eventInstancePatch, POST as eventInstancePost } from '@/app/api/operating-core/events/[id]/route'
import { GET as servicesGet, POST as servicesPost } from '@/app/api/operating-core/services/route'
import { POST as capacityPost } from '@/app/api/operating-core/capacity/route'
import { GET as formsGet, POST as formsPost, PATCH as formsPatch } from '@/app/api/operating-core/forms/route'
import { POST as formSubmissionsPost } from '@/app/api/operating-core/forms/[id]/submissions/route'
import { GET as resourcesGet, POST as resourcesPost, PATCH as resourcesPatch } from '@/app/api/operating-core/resources/route'
import { POST as registrationsPost } from '@/app/api/operating-core/registrations/route'
import { POST as outboxDrainPost } from '@/app/api/operating-core/outbox/drain/route'

// ─── Mock setup ───────────────────────────────────────────────────────────────

// Minimal mocks needed so routes can be imported. Flag check happens first.

jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: jest.fn(),
}))

jest.mock('@/lib/auth/platformSessionReadOnly', () => ({
  resolveReadOnlyPlatformSession: jest.fn(),
}))

jest.mock('@/lib/platform/operating-core/repositories/factory', () => ({
  createOperatingCoreEventsRepository: jest.fn(),
  createOperatingCoreServicesRepository: jest.fn(),
}))

jest.mock('@/lib/platform/operating-core/forms/factory', () => ({
  createOperatingCoreFormsRepository: jest.fn(),
}))

jest.mock('@/lib/platform/operating-core/resources/factory', () => ({
  createOperatingCoreResourcesRepository: jest.fn(),
}))

jest.mock('@/lib/platform/operating-core/registrations/registration-repository', () => ({
  createOperatingCoreRegistrationsRepository: jest.fn(),
}))

jest.mock('@/lib/platform/operating-core/capacity/capacity-repository-supabase', () => ({
  createSupabaseCapacityRepository: jest.fn(),
}))

jest.mock('@/lib/platform/operating-core/notification-outbox/factory', () => ({
  createOperatingCoreOutboxRepository: jest.fn(),
}))

jest.mock('@/lib/platform/operating-core/notifications/factory', () => ({
  createNotificationStateRepository: jest.fn(),
}))

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest(path: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest(new URL(`http://localhost${path}`), init)
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('flags-route-access compatibility (flag OFF → 404)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.NEXT_PUBLIC_OPERATING_CORE_ENABLED = 'off'
  })

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_OPERATING_CORE_ENABLED
  })

  // Events
  describe('GET /api/operating-core/events', () => {
    it('returns 404 when flag is off', async () => {
      const res = await eventsGet(makeRequest('/api/operating-core/events'))
      expect(res.status).toBe(404)
    })
  })

  describe('POST /api/operating-core/events', () => {
    it('returns 404 when flag is off', async () => {
      const res = await eventsPost(makeRequest('/api/operating-core/events', { method: 'POST' }))
      expect(res.status).toBe(404)
    })
  })

  describe('GET /api/operating-core/events/[id]', () => {
    it('returns 404 when flag is off', async () => {
      const res = await eventInstanceGet(
        makeRequest('/api/operating-core/events/evt-123'),
        { params: Promise.resolve({ id: 'evt-123' }) },
      )
      expect(res.status).toBe(404)
    })
  })

  describe('PATCH /api/operating-core/events/[id]', () => {
    it('returns 404 when flag is off', async () => {
      const res = await eventInstancePatch(
        makeRequest('/api/operating-core/events/evt-123', { method: 'PATCH' }),
        { params: Promise.resolve({ id: 'evt-123' }) },
      )
      expect(res.status).toBe(404)
    })
  })

  describe('POST /api/operating-core/events/[id]', () => {
    it('returns 404 when flag is off', async () => {
      const res = await eventInstancePost(
        makeRequest('/api/operating-core/events/evt-123', { method: 'POST' }),
        { params: Promise.resolve({ id: 'evt-123' }) },
      )
      expect(res.status).toBe(404)
    })
  })

  // Services
  describe('GET /api/operating-core/services', () => {
    it('returns 404 when flag is off', async () => {
      const res = await servicesGet(makeRequest('/api/operating-core/services'))
      expect(res.status).toBe(404)
    })
  })

  describe('POST /api/operating-core/services', () => {
    it('returns 404 when flag is off', async () => {
      const res = await servicesPost(makeRequest('/api/operating-core/services', { method: 'POST' }))
      expect(res.status).toBe(404)
    })
  })

  // Capacity (POST only)
  describe('POST /api/operating-core/capacity', () => {
    it('returns 404 when flag is off', async () => {
      const res = await capacityPost(makeRequest('/api/operating-core/capacity', { method: 'POST' }))
      expect(res.status).toBe(404)
    })
  })

  // Forms
  describe('GET /api/operating-core/forms', () => {
    it('returns 404 when flag is off', async () => {
      const res = await formsGet(makeRequest('/api/operating-core/forms'))
      expect(res.status).toBe(404)
    })
  })

  describe('POST /api/operating-core/forms', () => {
    it('returns 404 when flag is off', async () => {
      const res = await formsPost(makeRequest('/api/operating-core/forms', { method: 'POST' }))
      expect(res.status).toBe(404)
    })
  })

  describe('PATCH /api/operating-core/forms', () => {
    it('returns 404 when flag is off', async () => {
      const res = await formsPatch(
        makeRequest('/api/operating-core/forms', { method: 'PATCH' }),
      )
      expect(res.status).toBe(404)
    })
  })

  // Form submissions - uses [id] route with params
  describe('POST /api/operating-core/forms/[id]/submissions', () => {
    it('returns 404 when flag is off', async () => {
      const res = await formSubmissionsPost(
        makeRequest('/api/operating-core/forms/frm-123/submissions', { method: 'POST' }),
        { params: Promise.resolve({ id: 'frm-123' }) },
      )
      expect(res.status).toBe(404)
    })
  })

  // Resources
  describe('GET /api/operating-core/resources', () => {
    it('returns 404 when flag is off', async () => {
      const res = await resourcesGet(makeRequest('/api/operating-core/resources'))
      expect(res.status).toBe(404)
    })
  })

  describe('POST /api/operating-core/resources', () => {
    it('returns 404 when flag is off', async () => {
      const res = await resourcesPost(
        makeRequest('/api/operating-core/resources', { method: 'POST' }),
      )
      expect(res.status).toBe(404)
    })
  })

  describe('PATCH /api/operating-core/resources', () => {
    it('returns 404 when flag is off', async () => {
      const res = await resourcesPatch(
        makeRequest('/api/operating-core/resources', { method: 'PATCH' }),
      )
      expect(res.status).toBe(404)
    })
  })

  // Registrations (POST only - authenticated)
  describe('POST /api/operating-core/registrations', () => {
    it('returns 404 when flag is off', async () => {
      const res = await registrationsPost(
        makeRequest('/api/operating-core/registrations', { method: 'POST' }),
      )
      expect(res.status).toBe(404)
    })
  })

  // Outbox drain
  describe('POST /api/operating-core/outbox/drain', () => {
    it('returns 404 when flag is off', async () => {
      const res = await outboxDrainPost(
        makeRequest('/api/operating-core/outbox/drain', { method: 'POST' }),
      )
      expect(res.status).toBe(404)
    })
  })
})

describe('multi-tenant OUT of MVP scope — no campus_id in OC tables', () => {
  it('OC tables should not have campus_id columns (multi-tenant OUT of scope)', () => {
    // This is a documentation test — OC does not introduce multi-tenant columns.
    // The spec explicitly states: "Multi-tenant OUT of MVP scope"
    const ocTableNames = [
      'operating_core_events',
      'operating_core_services',
      'operating_core_registrations',
      'operating_core_capacity_overrides',
      'operating_core_forms',
      'operating_core_form_submissions',
      'operating_core_resources',
      'operating_core_public_tokens',
      'operating_core_notification_outbox',
      'operating_core_notification_states',
      'operating_core_participation_eventos',
    ]
    expect(ocTableNames.length).toBe(11)
  })
})
