import { Text } from '@react-email/components'

import { EmailLayout } from '@/emails/components/EmailLayout'
import { EmailButton } from '@/emails/components/EmailButton'

export interface CorreoCambioFechaProps {
  /** First name on the ficha; empty when unknown. */
  readonly nombre: string
  readonly tallerNombre: string
  /** «viernes 15 de enero» */
  readonly fechaInicio: string
  /** «lunes 11 de enero»; null for a request still waiting for approval. */
  readonly limite: string | null
  /** The message the director wrote for the inscritos. */
  readonly mensaje: string | null
  /** Absolute link to /talleres/mi-recorrido. */
  readonly url: string
}

/**
 * T8a (odd/tasks/talleres-reserva-publica.md, S9 S15) — the email twin of
 * the in-app «Tu taller cambió de fecha» notice. Approved inscritos must
 * confirm before the new cierre or they leave the edición; a request still
 * waiting for approval only learns the new date.
 */
export function CorreoCambioFecha({ nombre, tallerNombre, fechaInicio, limite, mensaje, url }: CorreoCambioFechaProps) {
  return (
    <EmailLayout preview={`${tallerNombre} cambió de fecha: ahora empieza el ${fechaInicio}`}>
      <Text style={styles.title}>{nombre ? `¡Hola, ${nombre}!` : '¡Hola!'}</Text>
      {mensaje && <Text style={styles.text}>{mensaje}</Text>}
      <Text style={styles.text}>
        <strong style={styles.highlight}>{tallerNombre}</strong> ahora empieza el{' '}
        <strong style={styles.highlight}>{fechaInicio}</strong>.
      </Text>
      {limite ? (
        <>
          <Text style={styles.text}>
            Confirma antes del <strong style={styles.highlight}>{limite}</strong> para mantener tu lugar. Si no confirmas,
            sales de la edición y tu cupo pasa a otra persona.
          </Text>
          <EmailButton href={url}>Mantener mi lugar</EmailButton>
        </>
      ) : (
        <Text style={styles.text}>Tu solicitud sigue esperando aprobación.</Text>
      )}
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
  highlight: {
    color: '#ffffff',
  },
}
