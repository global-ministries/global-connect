import { Text } from '@react-email/components'
import { EmailLayout } from '@/emails/components/EmailLayout'
import { EmailButton } from '@/emails/components/EmailButton'

export interface InvitacionCuentaEmailProps {
  readonly nombre: string
  /** One-use confirm link; it carries the hashed token. */
  readonly urlAceptar: string
}

/**
 * Account invitation (T12): the person already has a ficha; the link
 * confirms the new account, binds it to that ficha and opens the page to
 * choose a password.
 */
export function InvitacionCuentaEmail({
  nombre = 'Hola',
  urlAceptar = 'https://connect.yosoyglobal.org',
}: InvitacionCuentaEmailProps) {
  return (
    <EmailLayout preview="Te invitamos a crear tu cuenta en GlobalConnect">
      <Text style={styles.title}>¡Hola{nombre ? `, ${nombre}` : ''}!</Text>
      <Text style={styles.text}>
        Te invitamos a entrar a GlobalConnect. Tu ficha ya está registrada: solo tienes que aceptar
        la invitación y elegir tu contraseña.
      </Text>
      <EmailButton href={urlAceptar}>Aceptar invitación</EmailButton>
      <Text style={styles.hint}>
        Este enlace solo funciona una vez y vence pronto; si vence, pide que te lo reenvíen. Si no
        esperabas este correo, puedes ignorarlo.
      </Text>
    </EmailLayout>
  )
}

const styles = {
  title: { fontSize: '24px', fontWeight: '700' as const, color: '#ffffff', margin: '0 0 16px' },
  text: { fontSize: '15px', lineHeight: '1.6', color: '#a0a0b0', margin: '0 0 24px' },
  hint: { fontSize: '13px', color: '#6b7280', marginTop: '24px' },
}

export default InvitacionCuentaEmail
