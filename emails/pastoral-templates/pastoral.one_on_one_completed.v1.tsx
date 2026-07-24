/**
 * W11 — DT-064 — Pastoral: one_on_one_completed.v1 template.
 * Sent when a 1:1 is completed.
 */

import { Text } from '@react-email/components'

import { EmailLayout } from '../components/EmailLayout'
import type { PastoralEmailPropsMap } from '@/lib/platform/pastoral/notifications/template-keys'

type Props = PastoralEmailPropsMap['pastoral_one_on_one_completed']

export function PastoralOneOnOneCompletedEmail({
  leaderName,
  assistedName,
  eventDate,
}: Props) {
  const formattedDate = new Date(eventDate).toLocaleDateString('es-VE', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <EmailLayout preview={`Tu 1:1 con ${leaderName} ha sido completado`}>
      <Text style={styles.title}>1:1 Completado</Text>
      <Text style={styles.text}>
        Hola {assistedName}, tu encuentro 1:1 con <strong>{leaderName}</strong> del{' '}
        <strong>{formattedDate}</strong> ha sido registrado como completado.
      </Text>
      <Text style={styles.text}>
        Gracias por dedicar tiempo a tu crecimiento espiritual. El próximo paso
        será definido en tu siguiente encuentro.
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
  hint: {
    fontSize: '14px',
    color: '#94a3b8',
    margin: '16px 0 0',
    fontStyle: 'italic' as const,
  },
}
