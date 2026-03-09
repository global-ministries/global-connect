import { Text } from '@react-email/components'
import { EmailLayout } from './components/EmailLayout'
import { EmailButton } from './components/EmailButton'

interface InvitacionGrupoEmailProps {
    nombreUsuario: string
    nombreGrupo: string
    urlAceptar: string
}

export function InvitacionGrupoEmail({
    nombreUsuario = 'Usuario',
    nombreGrupo = 'Grupo',
    urlAceptar = 'https://connect.yosoyglobal.org',
}: InvitacionGrupoEmailProps) {
    return (
        <EmailLayout
            preview={`Fuiste invitado a unirte al grupo ${nombreGrupo}`}
        >
            <Text style={styles.title}>¡Hola, {nombreUsuario}!</Text>
            <Text style={styles.text}>
                Fuiste invitado a unirte al grupo{' '}
                <strong style={styles.groupName}>{nombreGrupo}</strong> en
                GlobalConnect. Acepta tu invitación para comenzar a participar.
            </Text>
            <EmailButton href={urlAceptar}>Aceptar invitación</EmailButton>
            <Text style={styles.hint}>
                Este enlace expira en 48 horas. Si no esperabas esta invitación, puedes
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
    groupName: {
        color: '#ffffff',
    },
    hint: {
        fontSize: '13px',
        color: '#6b7280',
        marginTop: '24px',
    },
}

export default InvitacionGrupoEmail
