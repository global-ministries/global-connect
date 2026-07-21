/**
 * S18 — Operating Core: waitlist_promoted.v1 template
 * Spanish default; abstraction permits future locales
 */

import { Text } from '@react-email/components'

import { EmailLayout } from '../components/EmailLayout'
import type { OperatingCoreTemplatePropsMap } from '../../lib/platform/operating-core/notifications/template-keys'

type Props = OperatingCoreTemplatePropsMap['waitlist_promoted']

export function WaitlistPromotedEmail({
  personaName,
  eventName,
  eventDate,
  eventLocation,
}: Props) {
  return (
    <EmailLayout preview={`¡Promoción! Tienes un lugar en ${eventName}`}>
      <Text style={styles.title}>¡Tienes un lugar!</Text>
      <Text style={styles.text}>
        Hola {personaName}, ¡buenas noticias! Se liberó un lugar en el evento{' '}
        <strong>{eventName}</strong> que se realizará el <strong>{eventDate}</strong>.
      </Text>
      {eventLocation && (
        <Text style={styles.text}>Lugar: {eventLocation}</Text>
      )}
      <Text style={styles.text}>
        Tu promoción desde la lista de espera ha sido confirmada. Por favor,
        confirmar tu asistencia lo antes posible para asegurar tu lugar.
        Si no puedes asistir, cancela desde la plataforma para que otra persona
        pueda beneficiarse.
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
