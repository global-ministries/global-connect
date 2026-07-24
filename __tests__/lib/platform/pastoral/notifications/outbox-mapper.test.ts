/**
 * W11 — DT-068 — Tests for Pastoral outbox mapper.
 *
 * Strict TDD: RED first.
 */

import {
  mapPastoralEventToOutboxEntries,
  PASTORAL_NOTIFICATION_KINDS,
  type PastoralNotificationKind,
  type PastoralNotificationPayload,
} from '@/lib/platform/pastoral/notifications/outbox-mapper'

// ─── Test fixtures ──────────────────────────────────────────────────────────────

const FIXTURE_MENTOR_ID = 'persona-mentor-001'
const FIXTURE_ASSISTED_ID = 'persona-assisted-001'
const FIXTURE_PASTOR_ID = 'persona-pastor-001'
const FIXTURE_ADMIN_ID = 'persona-admin-001'

const FIXTURE_BASE_PAYLOAD: PastoralNotificationPayload = {
  oneOnOneId: 'one-on-one-123',
  leaderName: 'Carlos Méndez',
  assistedName: 'Ana Rodríguez',
  eventDate: '2026-07-25T10:00:00Z',
  stepName: 'Oración inicial',
}

// ─── Happy path: each kind maps to correct template key ───────────────────────

describe('mapPastoralEventToOutboxEntries', () => {
  describe('happy path: template key selection (non-crisis only)', () => {
    const NON_CRISIS_KINDS = (PASTORAL_NOTIFICATION_KINDS as readonly PastoralNotificationKind[]).filter(
      (k) => k !== 'pastoral_crisis_alert'
    )

    for (const kind of NON_CRISIS_KINDS) {
      it(`kind=${kind} → returns 2 entries per recipient (email + WhatsApp)`, () => {
        const recipients = [
          { personaId: FIXTURE_MENTOR_ID, role: 'mentor' as const },
          { personaId: FIXTURE_ASSISTED_ID, role: 'assisted' as const },
        ]
        const result = mapPastoralEventToOutboxEntries(kind, recipients, FIXTURE_BASE_PAYLOAD)

        // 2 recipients × 2 channels = 4 entries
        expect(result).toHaveLength(4)

        const emailEntries = result.filter((e) => e.targetKind === 'email')
        const whatsappEntries = result.filter((e) => e.targetKind === 'whatsapp')

        expect(emailEntries).toHaveLength(2)
        expect(whatsappEntries).toHaveLength(2)
      })

      it(`kind=${kind} → email entries have correct template_key format`, () => {
        const recipients = [{ personaId: FIXTURE_MENTOR_ID, role: 'mentor' as const }]
        const result = mapPastoralEventToOutboxEntries(kind, recipients, FIXTURE_BASE_PAYLOAD)

        const emailEntry = result.find((e) => e.targetKind === 'email')
        expect(emailEntry?.templateKey).toMatch(/^pastoral\./)
        expect(emailEntry?.templateKey).toMatch(/\.v1$/)
        expect(emailEntry?.templateKey).toMatch(/\.(email|whatsapp)\.v1$/)
      })
    }
  })

  // ─── Crisis alert: only pastor/admin recipients ─────────────────────────────────

  describe('crisis alert routing (DT-067)', () => {
    it('pastoral_crisis_alert → only pastor/admin receive notification', () => {
      const kind: PastoralNotificationKind = 'pastoral_crisis_alert'
      const recipients = [
        { personaId: FIXTURE_PASTOR_ID, role: 'pastor' as const },
        { personaId: FIXTURE_ADMIN_ID, role: 'admin' as const },
        { personaId: FIXTURE_ASSISTED_ID, role: 'assisted' as const },
      ]
      const result = mapPastoralEventToOutboxEntries(kind, recipients, FIXTURE_BASE_PAYLOAD)

      // Only pastor + admin should receive crisis alerts (not assisted)
      // 2 recipients × 2 channels = 4 entries
      expect(result).toHaveLength(4)

      const assistedEntries = result.filter((e) =>
        e.recipientPersonaId === FIXTURE_ASSISTED_ID
      )
      expect(assistedEntries).toHaveLength(0)

      // Pastor and admin should each get 2 entries (email + whatsapp)
      const pastorEntries = result.filter((e) => e.recipientPersonaId === FIXTURE_PASTOR_ID)
      const adminEntries = result.filter((e) => e.recipientPersonaId === FIXTURE_ADMIN_ID)
      expect(pastorEntries).toHaveLength(2)
      expect(adminEntries).toHaveLength(2)
    })

    it('pastoral_crisis_alert → empty result when no pastor/admin present', () => {
      const kind: PastoralNotificationKind = 'pastoral_crisis_alert'
      const recipients = [
        { personaId: FIXTURE_MENTOR_ID, role: 'mentor' as const },
        { personaId: FIXTURE_ASSISTED_ID, role: 'assisted' as const },
      ]
      const result = mapPastoralEventToOutboxEntries(kind, recipients, FIXTURE_BASE_PAYLOAD)
      expect(result).toHaveLength(0)
    })

    it('pastoral_crisis_alert → pastor only gets 2 entries (email + whatsapp)', () => {
      const kind: PastoralNotificationKind = 'pastoral_crisis_alert'
      const recipients = [
        { personaId: FIXTURE_PASTOR_ID, role: 'pastor' as const },
      ]
      const result = mapPastoralEventToOutboxEntries(kind, recipients, FIXTURE_BASE_PAYLOAD)

      expect(result).toHaveLength(2)
      const emailEntry = result.find((e) => e.targetKind === 'email')
      const whatsappEntry = result.find((e) => e.targetKind === 'whatsapp')
      expect(emailEntry).toBeDefined()
      expect(whatsappEntry).toBeDefined()
    })
  })

  // ─── Non-crisis: all recipients get both channels ───────────────────────────────

  describe('non-crisis: both channels to all recipients', () => {
    const NON_CRISIS_KINDS = (PASTORAL_NOTIFICATION_KINDS as readonly PastoralNotificationKind[]).filter(
      (k) => k !== 'pastoral_crisis_alert'
    )

    for (const kind of NON_CRISIS_KINDS) {
      it(`kind=${kind} → both mentor and assisted receive both channels (4 total)`, () => {
        const recipients = [
          { personaId: FIXTURE_MENTOR_ID, role: 'mentor' as const },
          { personaId: FIXTURE_ASSISTED_ID, role: 'assisted' as const },
        ]
        const result = mapPastoralEventToOutboxEntries(kind, recipients, FIXTURE_BASE_PAYLOAD)

        // Each recipient gets 2 entries (email + whatsapp) = 4 total
        expect(result).toHaveLength(4)

        const mentorEntries = result.filter((e) => e.recipientPersonaId === FIXTURE_MENTOR_ID)
        const assistedEntries = result.filter((e) => e.recipientPersonaId === FIXTURE_ASSISTED_ID)

        expect(mentorEntries).toHaveLength(2)
        expect(assistedEntries).toHaveLength(2)
      })
    }
  })

  // ─── Template key derivation ───────────────────────────────────────────────────

  describe('template key derivation', () => {
    it('pastoral_one_on_one_scheduled → pastoral.one_on_one_scheduled.email.v1', () => {
      const recipients = [{ personaId: FIXTURE_MENTOR_ID, role: 'mentor' as const }]
      const result = mapPastoralEventToOutboxEntries(
        'pastoral_one_on_one_scheduled',
        recipients,
        FIXTURE_BASE_PAYLOAD
      )
      const emailEntry = result.find((e) => e.targetKind === 'email')
      expect(emailEntry?.templateKey).toBe('pastoral.one_on_one_scheduled.email.v1')
    })

    it('pastoral_one_on_one_completed → pastoral.one_on_one_completed.email.v1', () => {
      const recipients = [{ personaId: FIXTURE_MENTOR_ID, role: 'mentor' as const }]
      const result = mapPastoralEventToOutboxEntries(
        'pastoral_one_on_one_completed',
        recipients,
        FIXTURE_BASE_PAYLOAD
      )
      const emailEntry = result.find((e) => e.targetKind === 'email')
      expect(emailEntry?.templateKey).toBe('pastoral.one_on_one_completed.email.v1')
    })

    it('pastoral_triada_formed → pastoral.triada_formed.email.v1', () => {
      const recipients = [{ personaId: FIXTURE_MENTOR_ID, role: 'mentor' as const }]
      const result = mapPastoralEventToOutboxEntries(
        'pastoral_triada_formed',
        recipients,
        FIXTURE_BASE_PAYLOAD
      )
      const emailEntry = result.find((e) => e.targetKind === 'email')
      expect(emailEntry?.templateKey).toBe('pastoral.triada_formed.email.v1')
    })

    it('pastoral_crisis_alert → pastoral.crisis_alert.email.v1', () => {
      const recipients = [{ personaId: FIXTURE_PASTOR_ID, role: 'pastor' as const }]
      const result = mapPastoralEventToOutboxEntries(
        'pastoral_crisis_alert',
        recipients,
        FIXTURE_BASE_PAYLOAD
      )
      const emailEntry = result.find((e) => e.targetKind === 'email')
      expect(emailEntry?.templateKey).toBe('pastoral.crisis_alert.email.v1')
    })

    it('whatsapp template keys end with .whatsapp.v1', () => {
      const recipients = [{ personaId: FIXTURE_MENTOR_ID, role: 'mentor' as const }]
      const result = mapPastoralEventToOutboxEntries(
        'pastoral_one_on_one_scheduled',
        recipients,
        FIXTURE_BASE_PAYLOAD
      )
      const whatsappEntry = result.find((e) => e.targetKind === 'whatsapp')
      expect(whatsappEntry?.templateKey).toBe('pastoral.one_on_one_scheduled.whatsapp.v1')
    })
  })

  // ─── Payload passthrough ──────────────────────────────────────────────────────

  describe('payload passthrough', () => {
    it('includes all payload fields in the entry', () => {
      const recipients = [{ personaId: FIXTURE_MENTOR_ID, role: 'mentor' as const }]
      const customPayload: PastoralNotificationPayload = {
        ...FIXTURE_BASE_PAYLOAD,
        customField: 'custom-value',
      }
      const result = mapPastoralEventToOutboxEntries(
        'pastoral_one_on_one_scheduled',
        recipients,
        customPayload
      )

      const emailEntry = result.find((e) => e.targetKind === 'email')
      expect(emailEntry?.payload).toMatchObject({
        ...customPayload,
      })
    })

    it('entry includes correct kind and subjectId', () => {
      const recipients = [{ personaId: FIXTURE_MENTOR_ID, role: 'mentor' as const }]
      const result = mapPastoralEventToOutboxEntries(
        'pastoral_one_on_one_completed',
        recipients,
        FIXTURE_BASE_PAYLOAD
      )

      const emailEntry = result.find((e) => e.targetKind === 'email')
      expect(emailEntry?.kind).toBe('pastoral_one_on_one_completed')
      expect(emailEntry?.subjectId).toBe(FIXTURE_BASE_PAYLOAD.oneOnOneId)
    })
  })

  // ─── Edge cases ────────────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('returns empty array when recipients is empty', () => {
      const result = mapPastoralEventToOutboxEntries(
        'pastoral_one_on_one_scheduled',
        [],
        FIXTURE_BASE_PAYLOAD
      )
      expect(result).toHaveLength(0)
    })

    it('unknown kind throws error', () => {
      const recipients = [{ personaId: FIXTURE_MENTOR_ID, role: 'mentor' as const }]
      expect(() =>
        // @ts-expect-error — testing runtime validation
        mapPastoralEventToOutboxEntries('unknown_kind', recipients, FIXTURE_BASE_PAYLOAD)
      ).toThrow()
    })
  })
})
