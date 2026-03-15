import { Text } from '@react-email/components'
import { EmailLayout } from './components/EmailLayout'
import { EmailButton } from './components/EmailButton'

interface ResetPasswordEmailProps {
    resetUrl: string
}

export function ResetPasswordEmail({
    resetUrl = 'https://connect.yosoyglobal.org/auth/reset-password',
}: ResetPasswordEmailProps) {
    return (
        <EmailLayout preview="Restablece tu contraseña de GlobalConnect">
            <Text style={styles.title}>Restablecer contraseña</Text>
            <Text style={styles.text}>
                Recibimos una solicitud para restablecer la contraseña de tu cuenta en
                GlobalConnect. Haz clic en el botón de abajo para crear una nueva
                contraseña.
            </Text>
            <EmailButton href={resetUrl}>Restablecer contraseña</EmailButton>
            <Text style={styles.hint}>
                Este enlace expira en 1 hora. Si no solicitaste restablecer tu
                contraseña, tu cuenta está segura — puedes ignorar este correo.
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
    hint: {
        fontSize: '13px',
        color: '#6b7280',
        marginTop: '24px',
    },
}

export default ResetPasswordEmail
