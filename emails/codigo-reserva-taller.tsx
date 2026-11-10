import { Section, Text } from '@react-email/components'
import { EmailLayout } from './components/EmailLayout'

export interface CodigoReservaTallerEmailProps {
  /** First name on the ficha; empty when unknown. */
  readonly nombre: string
  readonly tallerNombre: string
  /** The 6-digit one-time code. */
  readonly codigo: string
}

/**
 * One-time code of the public reservation (odd/tasks/talleres-reserva-publica.md
 * S3, S11): sent to the email already on file after someone typed this
 * person's cédula. The same code is in their in-app notices. It never links
 * anywhere: the code is typed on the page that asked for it.
 */
export function CodigoReservaTallerEmail({ nombre = '', tallerNombre = 'un taller', codigo = '000000' }: CodigoReservaTallerEmailProps) {
  return (
    <EmailLayout preview={`Tu código para reservar en ${tallerNombre}: ${codigo}`}>
      <Text style={styles.title}>{nombre ? `¡Hola, ${nombre}!` : '¡Hola!'}</Text>
      <Text style={styles.text}>
        Este es tu código para reservar tu lugar en <strong style={styles.highlight}>{tallerNombre}</strong>. Escríbelo en
        la página de reserva.
      </Text>
      <Section style={styles.caja}>
        <Text style={styles.codigo}>{codigo}</Text>
      </Section>
      <Text style={styles.hint}>
        Vence en 10 minutos y sirve una sola vez. Si no estás reservando un taller, ignora este correo: nadie puede
        reservar a tu nombre sin este código.
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
  caja: {
    textAlign: 'center' as const,
    margin: '8px 0 24px',
  },
  codigo: {
    display: 'inline-block' as const,
    margin: '0',
    padding: '14px 24px',
    borderRadius: '10px',
    backgroundColor: '#1f1f2a',
    color: '#ffffff',
    fontSize: '32px',
    fontWeight: '700' as const,
    letterSpacing: '8px',
    fontFamily: "'SF Mono', Menlo, Consolas, monospace",
  },
  hint: {
    fontSize: '13px',
    color: '#6b7280',
    marginTop: '24px',
  },
}

export default CodigoReservaTallerEmail
