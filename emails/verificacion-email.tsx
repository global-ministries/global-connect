import { Text } from '@react-email/components'
import { EmailLayout } from './components/EmailLayout'
import { EmailButton } from './components/EmailButton'

interface VerificacionEmailProps {
    nombreUsuario: string
    confirmationUrl: string
}

export function VerificacionEmail({
    nombreUsuario = 'Usuario',
    confirmationUrl = 'https://connect.yosoyglobal.org',
}: VerificacionEmailProps) {
    return (
        <EmailLayout preview="Verifica tu dirección de correo electrónico para completar tu registro">
            <Text style={styles.title}>Verifica tu correo electrónico</Text>
            <Text style={styles.text}>
                ¡Hola, {nombreUsuario}! Gracias por registrarte en GlobalConnect. Para
                completar tu registro, verifica tu dirección de correo electrónico.
            </Text>
            <EmailButton href={confirmationUrl}>Verificar mi correo</EmailButton>
            <Text style={styles.hint}>
                Este enlace expira en 24 horas. Si no creaste esta cuenta, puedes
                ignorar este correo de forma segura.
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

export default VerificacionEmail
