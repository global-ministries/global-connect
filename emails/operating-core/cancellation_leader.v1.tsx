/**
 * S18 — Operating Core: cancellation_leader.v1 template
 * Notifies leader/capability holder when someone cancels
 * Spanish default; abstraction permits future locales
 */

import { Text } from '@react-email/components'

import { EmailLayout } from '../components/EmailLayout'
import type { OperatingCoreTemplatePropsMap } from '../../lib/platform/operating-core/notifications/template-keys'

type Props = OperatingCoreTemplatePropsMap['cancellation_leader']

export function CancellationLeaderEmail({
  leaderName,
  eventName,
  cancelledPersonaName,
  reason,
}: Props) {
  return (
    <EmailLayout preview={`Cancelación en ${eventName}`}>
      <Text style={styles.title}>Notificación de cancelación</Text>
      <Text style={styles.text}>
        Hola {leaderName}, te informamos que se ha registrado una cancelación
        a nombre de <strong>{cancelledPersonaName}</strong> para el evento{' '}
        <strong>{eventName}</strong>.
      </Text>
      {reason && (
        <Text style={styles.text}>
          Motivo de la cancelación: <em>{reason}</em>
        </Text>
      )}
      <Text style={styles.text}>
        Si lo consideras necesario, puedes cubrir este lugar asignando a otra
        persona del grupo o abriendo el registro nuevamente.
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
  hint: {
    fontSize: '14px',
    color: '#94a3b8',
    margin: '16px 0 0',
    fontStyle: 'italic' as const,
  },
}
