/**
 * W11 — DT-064 — Pastoral: one_on_one_scheduled.v1 template.
 * Sent to both mentor and assisted when a 1:1 is scheduled.
 */

import { Text } from '@react-email/components'

import { EmailLayout } from '../components/EmailLayout'
import type { PastoralEmailPropsMap } from '@/lib/platform/pastoral/notifications/template-keys'

type Props = PastoralEmailPropsMap['pastoral_one_on_one_scheduled']

export function PastoralOneOnOneScheduledEmail({
  leaderName,
  assistedName,
  eventDate,
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
    <EmailLayout preview={`Tu 1:1 con ${leaderName} ha sido programado`}>
      <Text style={styles.title}>1:1 Pastoral Programado</Text>
      <Text style={styles.text}>
        Hola {assistedName}, tu líder <strong>{leaderName}</strong> ha programado
        un encuentro personal (1:1) contigo.
      </Text>
      <Text style={styles.eventDate}>{formattedDate}</Text>
      <Text style={styles.text}>
        Este es un espacio dedicado a tu crecimiento espiritual. Prepárate para
        compartir cómo estás y qué Dios está haciendo en tu vida.
      </Text>
      <Text style={styles.hint}>
        Si necesitas reprogramar, contacta a tu líder directamente.
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
