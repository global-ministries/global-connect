/**
 * W11 — DT-064 — Pastoral: one_on_one_cancelled.v1 template.
 * Sent when a 1:1 is cancelled.
 */

import { Text } from '@react-email/components'

import { EmailLayout } from '../components/EmailLayout'
import type { PastoralEmailPropsMap } from '@/lib/platform/pastoral/notifications/template-keys'

type Props = PastoralEmailPropsMap['pastoral_one_on_one_cancelled']

export function PastoralOneOnOneCancelledEmail({
  leaderName,
  assistedName,
  eventDate,
  motivo,
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
    <EmailLayout preview={`Tu 1:1 con ${leaderName} ha sido cancelado`}>
      <Text style={styles.title}>1:1 Cancelado</Text>
      <Text style={styles.text}>
        Hola {assistedName}, tu encuentro 1:1 con <strong>{leaderName}</strong>{' '}
        programado para el <strong>{formattedDate}</strong> ha sido cancelado.
      </Text>
      {motivo && (
        <Text style={styles.motivo}>Motivo: {motivo}</Text>
      )}
      <Text style={styles.text}>
        Tu líder se pondrá en contacto para reprogramar. Si necesitas algo,
        no dudes en comunicarte directamente.
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
  motivo: {
    fontSize: '14px',
    color: '#94a3b8',
    margin: '0 0 12px',
    fontStyle: 'italic' as const,
  },
  hint: {
    fontSize: '14px',
    color: '#94a3b8',
    margin: '16px 0 0',
    fontStyle: 'italic' as const,
  },
}
