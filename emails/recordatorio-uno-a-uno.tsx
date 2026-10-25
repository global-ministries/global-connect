import { Section, Text } from '@react-email/components'
import { EmailLayout } from './components/EmailLayout'
import { EmailButton } from './components/EmailButton'
import { formatearFechaHora } from '../lib/uno-a-uno/fecha'
import { nombresDe } from '../lib/uno-a-uno/vista'

export function asuntoRecordatorioUnoAUno(cantidad: number): string {
    return cantidad === 1 ? 'Recordatorio: tu 1 a 1 de mañana' : 'Recordatorio: tus 1 a 1 de mañana'
}

interface PersonaRecordatorio {
    nombre: string
    apellido: string | null
}

export interface UnoAUnoRecordado {
    /** The other side of the 1:1. */
    conQuien: PersonaRecordatorio[]
    fechaHora: string
    lugar: string | null
}

interface RecordatorioUnoAUnoEmailProps {
    nombre: string
    unoAUnos: UnoAUnoRecordado[]
    urlMisUnoAUno: string
}

/**
 * The day-before reminder of a person's 1:1s (odd/tasks/uno-a-uno.md, T5 S5.5,
 * T5.2 S5.8): one email listing all of tomorrow's 1:1s in time order. It only
 * says who, when and where: nothing the leader wrote ever goes in an email.
 */
export function RecordatorioUnoAUnoEmail({ nombre, unoAUnos, urlMisUnoAUno }: RecordatorioUnoAUnoEmailProps) {
    const enOrden = [...unoAUnos].sort((a, b) => Date.parse(a.fechaHora) - Date.parse(b.fechaHora))
    const [unico] = enOrden
    const introduccion =
        enOrden.length === 1
            ? `Mañana tienes un 1 a 1 con ${nombresDe(unico.conQuien)}`
            : `Mañana tienes ${enOrden.length} 1 a 1`

    return (
        <EmailLayout preview={introduccion}>
            <Text style={styles.title}>¡Hola, {nombre}!</Text>
            {enOrden.length === 1 ? (
                <>
                    <Text style={styles.text}>
                        Mañana tienes un 1 a 1 con{' '}
                        <strong style={styles.highlight}>{nombresDe(unico.conQuien)}</strong>.
                    </Text>
                    <Detalles unoAUno={unico} />
                </>
            ) : (
                <>
                    <Text style={styles.text}>{introduccion}:</Text>
                    {enOrden.map((unoAUno) => (
                        <Section key={`${unoAUno.fechaHora}-${nombresDe(unoAUno.conQuien)}`} style={styles.item}>
                            <Text style={styles.detail}>
                                <strong style={styles.highlight}>{nombresDe(unoAUno.conQuien)}</strong>
                            </Text>
                            <Detalles unoAUno={unoAUno} />
                        </Section>
                    ))}
                </>
            )}
            <EmailButton href={urlMisUnoAUno}>Ver mis 1 a 1</EmailButton>
        </EmailLayout>
    )
}

function Detalles({ unoAUno }: { unoAUno: UnoAUnoRecordado }) {
    const lugarTexto = unoAUno.lugar?.trim()

    return (
        <>
            <Text style={styles.detail}>
                <strong style={styles.highlight}>Cuándo:</strong> {formatearFechaHora(unoAUno.fechaHora)}
            </Text>
            {lugarTexto ? (
                <Text style={styles.detail}>
                    <strong style={styles.highlight}>Dónde:</strong> {lugarTexto}
                </Text>
            ) : null}
        </>
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
    item: {
        margin: '0 0 16px',
    },
    highlight: {
        color: '#ffffff',
    },
}

export default RecordatorioUnoAUnoEmail
