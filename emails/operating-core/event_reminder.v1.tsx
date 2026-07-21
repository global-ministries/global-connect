/**
 * S18 — Operating Core: event_reminder.v1 template
 * Default T-24h reminder; configurable window
 * Spanish default; abstraction permits future locales
 */

import { Text } from '@react-email/components'

import { EmailLayout } from '../components/EmailLayout'
import type { OperatingCoreTemplatePropsMap } from '../../lib/platform/operating-core/notifications/template-keys'

type Props = OperatingCoreTemplatePropsMap['event_reminder']

export function EventReminderEmail({
  personaName,
  eventName,
  eventDate,
  hoursUntil,
}: Props) {
  return (
    <EmailLayout preview={`Recordatorio: ${eventName} en ${hoursUntil} horas`}>
      <Text style={styles.title}>¡Recuerda tu inscripción!</Text>
      <Text style={styles.text}>
        Hola {personaName}, este es un recordatorio de tu inscripción al evento{' '}
        <strong>{eventName}</strong>.
      </Text>
      <Text style={styles.eventDate}>{eventDate}</Text>
      <Text style={styles.text}>
        El evento comienza en aproximadamente <strong>{hoursUntil} horas</strong>.
        Asegúrate de prepararte para asistir.
      </Text>
      <Text style={styles.text}>
        Si no puedes asistir, por favor cancela tu registro desde la plataforma
        con anticipación para que otra persona pueda tomar tu lugar.
      </Text>
      <Text style={styles.hint}>
        Bendiciones,
        <br />
        Equipo de GlobalConnect
      </Text>
    </EmailLayout>
  )
}

const styles = {
  title: {
    fontSize: '24px',
    fontWeight: '700' as const,
    color: '#ffffff',
    margin: '0 0 16px',
  },
  text: {
    fontSize: '16px',
    color: '#cbd5e1',
    margin: '0 0 12px',
    lineHeight: '1.5',
  },
  eventDate: {
    fontSize: '18px',
    color: '#D06D2D',
    margin: '8px 0 16px',
    fontWeight: '600' as const,
  },
  hint: {
    fontSize: '14px',
    color: '#94a3b8',
    margin: '16px 0 0',
    fontStyle: 'italic' as const,
  },
}
