/**
 * S18 — Operating Core: registration_confirmed.v1 template
 * Spanish default; abstraction permits future locales
 */

import { Text } from '@react-email/components'

import { EmailLayout } from '../components/EmailLayout'
import type { OperatingCoreTemplatePropsMap } from '../../lib/platform/operating-core/notifications/template-keys'

type Props = OperatingCoreTemplatePropsMap['registration_confirmed']

export function RegistrationConfirmedEmail({
  personaName,
  eventName,
  eventDate,
  eventLocation,
}: Props) {
  return (
    <EmailLayout preview={`Confirmación de registro: ${eventName}`}>
      <Text style={styles.title}>¡Registro confirmado!</Text>
      <Text style={styles.text}>
        Hola {personaName}, te confirmamos tu registro al evento{' '}
        <strong>{eventName}</strong> el día <strong>{eventDate}</strong>.
      </Text>
      {eventLocation && (
        <Text style={styles.text}>Lugar: {eventLocation}</Text>
      )}
      <Text style={styles.text}>
        ¡Te esperamos! Si no puedes asistir, por favor cancela tu registro
        desde la plataforma para que otra persona pueda tomar tu lugar.
      </Text>
      <Text style={styles.hint}>
        Si necesitas cancelar, hazlo con anticipación.
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
