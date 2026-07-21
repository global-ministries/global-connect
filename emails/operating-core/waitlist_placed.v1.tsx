/**
 * S18 — Operating Core: waitlist_placed.v1 template
 * Spanish default; abstraction permits future locales
 */

import { Text } from '@react-email/components'

import { EmailLayout } from '../components/EmailLayout'
import type { OperatingCoreTemplatePropsMap } from '../../lib/platform/operating-core/notifications/template-keys'

type Props = OperatingCoreTemplatePropsMap['waitlist_placed']

export function WaitlistPlacedEmail({
  personaName,
  eventName,
  eventDate,
  waitlistPosition,
}: Props) {
  return (
    <EmailLayout preview={`Lista de espera: ${eventName}`}>
      <Text style={styles.title}>¡Estás en lista de espera!</Text>
      <Text style={styles.text}>
        Hola {personaName}, lamento informarte que el evento{' '}
        <strong>{eventName}</strong> programado para el <strong>{eventDate}</strong>{' '}
        ha alcanzado su capacidad máxima.
      </Text>
      <Text style={styles.position}>
        Tu posición en la lista de espera es: <strong>#{waitlistPosition}</strong>
      </Text>
      <Text style={styles.text}>
        permanecer en lista de espera aumenta tus posibilidades de obtener un lugar.
        Si alguien cancela su registro, notificaremos a las siguientes personas.
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
  position: {
    fontSize: '20px',
    color: '#D06D2D',
    margin: '16px 0',
    fontWeight: '600' as const,
  },
  hint: {
    fontSize: '14px',
    color: '#94a3b8',
    margin: '16px 0 0',
    fontStyle: 'italic' as const,
  },
}
