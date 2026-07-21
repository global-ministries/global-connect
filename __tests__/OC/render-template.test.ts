/**
 * S18 — Operating Core template render helper: tests
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { renderOperatingCoreTemplate } from '../../lib/platform/operating-core/notifications/render-template'
import type { OperatingCoreTemplateKey, OperatingCoreTemplateVersionedKey } from '../../lib/platform/operating-core/notifications/template-keys'

describe('renderOperatingCoreTemplate', () => {
  describe('version enforcement', () => {
    test('accepts versioned key ending in .v1', () => {
      const result = renderOperatingCoreTemplate(
        'registration_confirmed',
        'registration_confirmed.v1' as OperatingCoreTemplateVersionedKey,
        {
          personaName: 'María',
          eventName: 'Test Event',
          eventDate: '2026-07-25',
        }
      )

      expect(result).toBeDefined()
      const html = renderToStaticMarkup(result)
      expect(html).toContain('María')
    })

    test('rejects versioned key that does not end in .v1', () => {
      expect(() => {
        renderOperatingCoreTemplate(
          'registration_confirmed',
          'registration_confirmed.v2' as OperatingCoreTemplateVersionedKey,
          {
            personaName: 'María',
            eventName: 'Test Event',
            eventDate: '2026-07-25',
          }
        )
      }).toThrow('version mismatch')
    })

    test('rejects mismatched key and versionedKey', () => {
      expect(() => {
        renderOperatingCoreTemplate(
          'waitlist_placed',
          'registration_confirmed.v1' as OperatingCoreTemplateVersionedKey,
          {
            personaName: 'María',
            eventName: 'Test Event',
            eventDate: '2026-07-25',
            waitlistPosition: 3,
          }
        )
      }).toThrow()
    })
  })

  describe('all 6 templates render correctly', () => {
    test('registration_confirmed', () => {
      const result = renderOperatingCoreTemplate(
        'registration_confirmed',
        'registration_confirmed.v1',
        {
          personaName: 'Carlos',
          eventName: 'Workshop',
          eventDate: '20 de agosto',
          eventLocation: 'Sala A',
        }
      )
      const html = renderToStaticMarkup(result)
      expect(html).toContain('Carlos')
      expect(html).toContain('Workshop')
      expect(html).toContain('20 de agosto')
      expect(html).toContain('Sala A')
    })

    test('waitlist_placed', () => {
      const result = renderOperatingCoreTemplate(
        'waitlist_placed',
        'waitlist_placed.v1',
        {
          personaName: 'Ana',
          eventName: 'Conferencia',
          eventDate: '15 de septiembre',
          waitlistPosition: 2,
        }
      )
      const html = renderToStaticMarkup(result)
      expect(html).toContain('Ana')
      expect(html).toContain('Conferencia')
      expect(html).toContain('2')
    })

    test('waitlist_promoted', () => {
      const result = renderOperatingCoreTemplate(
        'waitlist_promoted',
        'waitlist_promoted.v1',
        {
          personaName: 'Pedro',
          eventName: 'Retiro',
          eventDate: '10 de octubre',
          eventLocation: 'Campo',
        }
      )
      const html = renderToStaticMarkup(result)
      expect(html).toContain('Pedro')
      expect(html).toContain('Retiro')
      expect(html).toContain('promoción')
    })

    test('cancellation_leader', () => {
      const result = renderOperatingCoreTemplate(
        'cancellation_leader',
        'cancellation_leader.v1',
        {
          leaderName: 'Roberto',
          eventName: 'Grupo de Vida',
          cancelledPersonaName: 'Laura',
          reason: 'Enfermedad',
        }
      )
      const html = renderToStaticMarkup(result)
      expect(html).toContain('Roberto')
      expect(html).toContain('Laura')
      expect(html).toContain('cancelación')
    })

    test('event_reminder', () => {
      const result = renderOperatingCoreTemplate(
        'event_reminder',
        'event_reminder.v1',
        {
          personaName: 'Elena',
          eventName: 'Ensayo',
          eventDate: 'Mañana',
          hoursUntil: 24,
        }
      )
      const html = renderToStaticMarkup(result)
      expect(html).toContain('Elena')
      expect(html).toContain('recordatorio')
      expect(html).toContain('24')
    })

    test('no_show', () => {
      const result = renderOperatingCoreTemplate(
        'no_show',
        'no_show.v1',
        {
          personaName: 'Miguel',
          eventName: 'Orientación',
          eventDate: '15 de julio',
        }
      )
      const html = renderToStaticMarkup(result)
      expect(html).toContain('Miguel')
      expect(html).toContain('inasistencia')
    })
  })

  describe('type safety', () => {
    test('accepts only valid template keys', () => {
      const validKeys: OperatingCoreTemplateKey[] = [
        'registration_confirmed',
        'waitlist_placed',
        'waitlist_promoted',
        'cancellation_leader',
        'event_reminder',
        'no_show',
      ]

      validKeys.forEach((key) => {
        expect(() => {
          const versionedKey = `${key}.v1` as const
          if (key === 'registration_confirmed') {
            renderOperatingCoreTemplate(key, versionedKey, {
              personaName: 'Test',
              eventName: 'Event',
              eventDate: 'Date',
            })
          } else if (key === 'waitlist_placed') {
            renderOperatingCoreTemplate(key, versionedKey, {
              personaName: 'Test',
              eventName: 'Event',
              eventDate: 'Date',
              waitlistPosition: 1,
            })
          } else if (key === 'waitlist_promoted') {
            renderOperatingCoreTemplate(key, versionedKey, {
              personaName: 'Test',
              eventName: 'Event',
              eventDate: 'Date',
            })
          } else if (key === 'cancellation_leader') {
            renderOperatingCoreTemplate(key, versionedKey, {
              leaderName: 'Leader',
              eventName: 'Event',
              cancelledPersonaName: 'Person',
              reason: 'Reason',
            })
          } else if (key === 'event_reminder') {
            renderOperatingCoreTemplate(key, versionedKey, {
              personaName: 'Test',
              eventName: 'Event',
              eventDate: 'Date',
              hoursUntil: 24,
            })
          } else {
            renderOperatingCoreTemplate(key, versionedKey, {
              personaName: 'Test',
              eventName: 'Event',
              eventDate: 'Date',
            })
          }
        }).not.toThrow()
      })
    })
  })
})
