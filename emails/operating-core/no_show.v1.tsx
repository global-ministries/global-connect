/**
 * S18 — Operating Core: no_show.v1 template
 * Notifies about an absence to the system/leader
 * Spanish default; abstraction permits future locales
 */

import { Text } from '@react-email/components'

import { EmailLayout } from '../components/EmailLayout'
import type { OperatingCoreTemplatePropsMap } from '../../lib/platform/operating-core/notifications/template-keys'

type Props = OperatingCoreTemplatePropsMap['no_show']

export function NoShowEmail({
  personaName,
  eventName,
  eventDate,
}: Props) {
  return (
    <EmailLayout preview={`inasistencia registrada: ${eventName}`}>
      <Text style={styles.title}>inasistencia registrada</Text>
      <Text style={styles.text}>
        Hola {personaName}, lamentamos informarte que no se registró tu asistencia
        al evento <strong>{eventName}</strong> realizado el <strong>{eventDate}</strong>.
      </Text>
      <Text style={styles.text}>
        Nos causa preocupación no haber podido contar contigo. Si hubo alguna
        circunstancia que te impidió asistir, por favor ponte en contacto con
        nosotros para brindarte el apoyo necesario.
      </Text>
      <Text style={styles.text}>
        Valoramos tu participación y esperamos verte en futuras actividades.
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
