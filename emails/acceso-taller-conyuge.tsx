import { Text } from '@react-email/components'
import { EmailLayout } from './components/EmailLayout'
import { EmailButton } from './components/EmailButton'

export interface AccesoTallerConyugeEmailProps {
  readonly nombreInvitado: string
  readonly nombreInvitante: string
  readonly tallerNombre: string
  /** One-use activation link; it carries the raw token. */
  readonly urlActivar: string
}

/**
 * Access email for a spouse whose ficha a member created while enrolling
 * both in a couple taller. The link opens /activar, which asks for the
 * cédula before letting the person set a password.
 */
export function AccesoTallerConyugeEmail({
  nombreInvitado = 'Hola',
  nombreInvitante = 'Tu pareja',
  tallerNombre = 'un taller',
  urlActivar = 'https://connect.yosoyglobal.org/activar',
}: AccesoTallerConyugeEmailProps) {
  return (
    <EmailLayout preview={`${nombreInvitante} te inscribió en ${tallerNombre}`}>
      <Text style={styles.title}>¡Hola, {nombreInvitado}!</Text>
      <Text style={styles.text}>
        {nombreInvitante} te inscribió en el taller{' '}
        <strong style={styles.highlight}>{tallerNombre}</strong>. Activa tu cuenta en GlobalConnect para
        ver tu inscripción y seguir el taller.
      </Text>
      <EmailButton href={urlActivar}>Activar mi cuenta</EmailButton>
      <Text style={styles.hint}>
        Este enlace vence en 7 días y solo funciona una vez. Al abrirlo te pediremos tu cédula. Si no
        esperabas este correo, puedes ignorarlo.
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
    fontSize: '15px',
    lineHeight: '1.6',
    color: '#a0a0b0',
    margin: '0 0 24px',
  },
  highlight: {
    color: '#ffffff',
  },
  hint: {
    fontSize: '13px',
    color: '#6b7280',
    marginTop: '24px',
  },
}

export default AccesoTallerConyugeEmail
