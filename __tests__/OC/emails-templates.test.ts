/**
 * S18 — Operating Core email templates: render tests
 * RED first: tests describe what the templates MUST render
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { RegistrationConfirmedEmail } from '../../emails/operating-core/registration_confirmed.v1'
import { WaitlistPlacedEmail } from '../../emails/operating-core/waitlist_placed.v1'
import { WaitlistPromotedEmail } from '../../emails/operating-core/waitlist_promoted.v1'
import { CancellationLeaderEmail } from '../../emails/operating-core/cancellation_leader.v1'
import { EventReminderEmail } from '../../emails/operating-core/event_reminder.v1'
import { NoShowEmail } from '../../emails/operating-core/no_show.v1'
import {
  OPERATING_CORE_TEMPLATE_KEYS,
} from '../../lib/platform/operating-core/notifications/template-keys'

// --- Template key union is exactly 6 values ---
test('OPERATING_CORE_TEMPLATE_KEYS has exactly 6 values', () => {
  expect(OPERATING_CORE_TEMPLATE_KEYS).toHaveLength(6)
})

test('OPERATING_CORE_TEMPLATE_KEYS contains all expected keys', () => {
  const expected = [
    'registration_confirmed',
    'waitlist_placed',
    'waitlist_promoted',
    'cancellation_leader',
    'event_reminder',
    'no_show',
  ] as const
  expect(OPERATING_CORE_TEMPLATE_KEYS).toEqual(expected)
})

// --- registration_confirmed template ---
describe('registration_confirmed.v1', () => {
  const props = {
    personaName: 'María García',
    eventName: 'Celebración de Cumpleaños',
    eventDate: '25 de julio de 2026',
    eventLocation: 'Salón Principal, Campus Central',
  }

  const rendered = renderToStaticMarkup(
    RegistrationConfirmedEmail(props)
  )

  test('renders Spanish confirmation text', () => {
    expect(rendered).toContain('Registro confirmado')
    expect(rendered).toContain('María García')
    expect(rendered).toContain('Celebración de Cumpleaños')
    expect(rendered).toContain('25 de julio de 2026')
  })

  test('renders location when provided', () => {
    expect(rendered).toContain('Salón Principal, Campus Central')
  })

  test('renders cancellation call-to-action hint', () => {
    expect(rendered).toContain('cancelar')
    expect(rendered).toContain('plataforma')
  })

  test('renders closing blessing', () => {
    expect(rendered).toContain('Bendiciones')
    expect(rendered).toContain('GlobalConnect')
  })

  test('renders email layout with preview', () => {
    expect(rendered).toContain('Confirmación de registro: Celebración de Cumpleaños')
  })

  test('renders without event location when omitted', () => {
    const withoutLocation = renderToStaticMarkup(
      RegistrationConfirmedEmail({
        personaName: 'Juan Pérez',
        eventName: 'Workshop',
        eventDate: '30 de julio',
      })
    )
    expect(withoutLocation).toContain('Juan Pérez')
    expect(withoutLocation).toContain('Workshop')
    expect(withoutLocation).not.toContain('Salón')
  })
})

// --- waitlist_placed template ---
describe('waitlist_placed.v1', () => {
  const props = {
    personaName: 'Carlos López',
    eventName: 'Conferencia Anual',
    eventDate: '15 de agosto de 2026',
    waitlistPosition: 3,
  }

  const rendered = renderToStaticMarkup(WaitlistPlacedEmail(props))

  test('renders Spanish waitlist placement text', () => {
    expect(rendered).toContain('lista de espera')
    expect(rendered).toContain('Carlos López')
    expect(rendered).toContain('Conferencia Anual')
    expect(rendered).toContain('15 de agosto')
  })

  test('renders waitlist position', () => {
    expect(rendered).toContain('3')
    expect(rendered).toContain('posición')
  })

  test('renders encouraging message', () => {
    expect(rendered).toContain('permanecer')
    expect(rendered).toContain('lugar')
  })

  test('renders email layout with preview', () => {
    expect(rendered).toContain('lista de espera')
  })
})

// --- waitlist_promoted template ---
describe('waitlist_promoted.v1', () => {
  const props = {
    personaName: 'Ana Martínez',
    eventName: 'Retiro Espiritual',
    eventDate: '10 de septiembre de 2026',
    eventLocation: 'Campamento Monte Verde',
  }

  const rendered = renderToStaticMarkup(WaitlistPromotedEmail(props))

  test('renders Spanish promotion text', () => {
    expect(rendered).toContain('promoción')
    expect(rendered).toContain('Ana Martínez')
    expect(rendered).toContain('Retiro Espiritual')
    expect(rendered).toContain('10 de septiembre')
  })

  test('renders location when provided', () => {
    expect(rendered).toContain('Campamento Monte Verde')
  })

  test('renders celebratory message', () => {
    expect(rendered).toContain('confirmar')
    expect(rendered).toContain('asistencia')
  })

  test('renders without location when omitted', () => {
    const withoutLocation = renderToStaticMarkup(
      WaitlistPromotedEmail({
        personaName: 'Pedro Ruiz',
        eventName: 'Encuentro Juvenile',
        eventDate: '20 de julio',
      })
    )
    expect(withoutLocation).toContain('Pedro Ruiz')
    expect(withoutLocation).not.toContain('Campamento')
  })
})

// --- cancellation_leader template ---
describe('cancellation_leader.v1', () => {
  const props = {
    leaderName: 'Roberto Mendoza',
    eventName: 'Grupo de Vida',
    cancelledPersonaName: 'Laura Sánchez',
    reason: 'Motivos personales',
  }

  const rendered = renderToStaticMarkup(CancellationLeaderEmail(props))

  test('renders Spanish cancellation notice', () => {
    expect(rendered).toContain('cancelación')
    expect(rendered).toContain('Roberto Mendoza')
    expect(rendered).toContain('Grupo de Vida')
    expect(rendered).toContain('Laura Sánchez')
  })

  test('renders cancellation reason', () => {
    expect(rendered).toContain('Motivos personales')
  })

  test('renders leader call-to-action', () => {
    expect(rendered).toContain('cubrir')
    expect(rendered).toContain('lugar')
  })
})

// --- event_reminder template ---
describe('event_reminder.v1', () => {
  const props = {
    personaName: 'Elena Gómez',
    eventName: 'Ensayo del Coro',
    eventDate: 'Mañana, 19:00',
    hoursUntil: 24,
  }

  const rendered = renderToStaticMarkup(EventReminderEmail(props))

  test('renders Spanish reminder text', () => {
    expect(rendered).toContain('recordatorio')
    expect(rendered).toContain('Elena Gómez')
    expect(rendered).toContain('Ensayo del Coro')
    expect(rendered).toContain('Mañana')
  })

  test('renders hours until event', () => {
    expect(rendered).toContain('24')
    expect(rendered).toContain('horas')
  })

  test('renders preparation encouragement', () => {
    expect(rendered).toContain('preparar')
  })
})

// --- no_show template ---
describe('no_show.v1', () => {
  const props = {
    personaName: 'Miguel Torres',
    eventName: 'Sesión de Orientación',
    eventDate: '15 de julio de 2026',
  }

  const rendered = renderToStaticMarkup(NoShowEmail(props))

  test('renders Spanish no-show text', () => {
    expect(rendered).toContain('inasistencia')
    expect(rendered).toContain('Miguel Torres')
    expect(rendered).toContain('Sesión de Orientación')
    expect(rendered).toContain('15 de julio')
  })

  test('renders concern message', () => {
    expect(rendered).toContain('preocupación')
    expect(rendered).toContain('contacto')
  })

  test('renders support offer', () => {
    expect(rendered).toContain('apoyo')
    expect(rendered).toContain('asistir')
  })
})
