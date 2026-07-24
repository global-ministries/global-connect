/**
 * W11 — DT-064 — Pastoral: one_on_one_reminder.v1 template.
 * Sent T-24h before a 1:1 to both mentor and assisted.
 */

import { Text } from '@react-email/components'

import { EmailLayout } from '../components/EmailLayout'
import type { PastoralEmailPropsMap } from '@/lib/platform/pastoral/notifications/template-keys'

type Props = PastoralEmailPropsMap['pastoral_one_on_one_reminder']

export function PastoralOneOnOneReminderEmail({
  leaderName,
  assistedName,
  eventDate,
  hoursUntil,
}: Props) {
  const formattedDate = new Date(eventDate).toLocaleDateString('es-VE', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <EmailLayout preview={`Recordatorio: Tu 1:1 es en ${hoursUntil} horas`}>
      <Text style={styles.title}>Recordatorio de 1:1</Text>
      <Text style={styles.text}>
        Hola {assistedName}, te recordarmos que tu encuentro 1:1 con{' '}
        <strong>{leaderName}</strong> es mañana.
      </Text>
      <Text style={styles.eventDate}>{formattedDate}</Text>
      <Text style={styles.text}>
        Tu encuentro es en aproximadamente <strong>{hoursUntil} horas</strong>.
        Asegúrate de有空 para asistir.
      </Text>
      <Text style={styles.text}>
        Este espacio es importante para tu acompañamiento pastoral. Si no puedes
        asistir, por favor comunica a tu líder con anticipación.
      </Text>
      <Text style={styles.hint}>
        Bendiciones,
        <br />
        Equipo de Acompañamiento Pastoral
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
