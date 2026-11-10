import { Text } from '@react-email/components'
import { EmailLayout } from './components/EmailLayout'
import { EmailButton } from './components/EmailButton'

export interface AccesoTallerPublicoEmailProps {
  readonly nombreInvitado: string
  readonly tallerNombre: string
  /** One-use activation link; it carries the raw token. */
  readonly urlActivar: string
}

/**
 * Access email for a new person who reserved a taller on the public page
 * (odd/tasks/talleres-reserva-publica.md S4): their ficha was created with
 * the reservation, which stays pending until the coordination approves it.
 * The link opens /activar, which asks for the cédula before the password.
 */
export function AccesoTallerPublicoEmail({
  nombreInvitado = 'Hola',
  tallerNombre = 'un taller',
  urlActivar = 'https://connect.yosoyglobal.org/activar',
}: AccesoTallerPublicoEmailProps) {
  return (
    <EmailLayout preview={`Activa tu cuenta Global para seguir ${tallerNombre}`}>
      <Text style={styles.title}>¡Hola, {nombreInvitado}!</Text>
      <Text style={styles.text}>
        Recibimos tu solicitud para <strong style={styles.highlight}>{tallerNombre}</strong>. La coordinación la revisa y te
        avisa cuando la apruebe.
      </Text>
      <Text style={styles.text}>
        Activa tu cuenta Global para ver tu grupo, tu asistencia y tu certificado.
      </Text>
      <EmailButton href={urlActivar}>Activar mi cuenta</EmailButton>
      <Text style={styles.hint}>
        Este enlace vence en 7 días y solo funciona una vez. Al abrirlo te pediremos tu cédula. Si no reservaste
        ningún taller, puedes ignorar este correo.
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

export default AccesoTallerPublicoEmail
