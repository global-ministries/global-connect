import { Text } from '@react-email/components'
import { EmailLayout } from './components/EmailLayout'
import { EmailButton } from './components/EmailButton'

interface BienvenidaEmailProps {
    nombreUsuario: string
    dashboardUrl: string
}

export function BienvenidaEmail({
    nombreUsuario = 'Usuario',
    dashboardUrl = 'https://connect.yosoyglobal.org/dashboard',
}: BienvenidaEmailProps) {
    return (
        <EmailLayout preview={`¡Bienvenido a GlobalConnect, ${nombreUsuario}!`}>
            <Text style={styles.title}>¡Bienvenido, {nombreUsuario}!</Text>
            <Text style={styles.text}>
                Tu cuenta en en sistema de miembros de Global ha sido creada exitosamente. Ahora eres parte
                de nuestra comunidad.
            </Text>
            <Text style={styles.text}>
                Desde tu dashboard podrás gestionar tu perfil, conectarte con tu grupo y
                acceder a todos los recursos disponibles.
            </Text>
            <EmailButton href={dashboardUrl}>Ir a mi dashboard</EmailButton>
            <Text style={styles.hint}>
                Si tienes alguna pregunta, contacta a tu líder inmediato o al
                departamento de tecnología de tu iglesia.
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
        margin: '0 0 16px',
    },
    hint: {
        fontSize: '13px',
        color: '#6b7280',
        marginTop: '24px',
    },
}

export default BienvenidaEmail
