import { Text } from '@react-email/components'
import { EmailLayout } from './components/EmailLayout'
import { EmailButton } from './components/EmailButton'
import { formatearFechaHora } from '../lib/uno-a-uno/fecha'
import { nombresDe } from '../lib/uno-a-uno/vista'

export const ASUNTO_RECORDATORIO_UNO_A_UNO = 'Recordatorio: tu 1 a 1 de mañana'

interface PersonaRecordatorio {
    nombre: string
    apellido: string | null
}

interface RecordatorioUnoAUnoEmailProps {
    nombre: string
    /** The other side of the 1:1. */
    conQuien: PersonaRecordatorio[]
    fechaHora: string
    lugar: string | null
    urlMisUnoAUno: string
}

/**
 * The day-before reminder of a 1:1 (odd/tasks/uno-a-uno.md, T5, S5.5). It only
 * says who, when and where: nothing the leader wrote ever goes in an email.
 */
export function RecordatorioUnoAUnoEmail({
    nombre,
    conQuien,
    fechaHora,
    lugar,
    urlMisUnoAUno,
}: RecordatorioUnoAUnoEmailProps) {
    const conQuienTexto = nombresDe(conQuien)
    const lugarTexto = lugar?.trim()

    return (
        <EmailLayout preview={`Mañana tienes un 1 a 1 con ${conQuienTexto}`}>
            <Text style={styles.title}>¡Hola, {nombre}!</Text>
            <Text style={styles.text}>
                Mañana tienes un 1 a 1 con{' '}
                <strong style={styles.highlight}>{conQuienTexto}</strong>.
            </Text>
            <Text style={styles.detail}>
                <strong style={styles.highlight}>Cuándo:</strong> {formatearFechaHora(fechaHora)}
            </Text>
            {lugarTexto ? (
                <Text style={styles.detail}>
                    <strong style={styles.highlight}>Dónde:</strong> {lugarTexto}
                </Text>
            ) : null}
            <EmailButton href={urlMisUnoAUno}>Ver mis 1 a 1</EmailButton>
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
    detail: {
        fontSize: '15px',
        lineHeight: '1.6',
        color: '#a0a0b0',
        margin: '0 0 8px',
    },
    highlight: {
        color: '#ffffff',
    },
}

export default RecordatorioUnoAUnoEmail
