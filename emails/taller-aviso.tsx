import { Section, Text } from '@react-email/components'
import { EmailLayout } from './components/EmailLayout'
import { EmailButton } from './components/EmailButton'

export interface TallerAvisoEmailProps {
  /** First name; empty when unknown. */
  readonly nombre: string
  readonly titulo: string
  readonly cuerpo: string
  /** Label/value pairs under the text (Grupo, Facilita, Cuándo, Lugar, Indicaciones…). */
  readonly filas?: readonly (readonly [string, string])[]
  /** Absolute link and its button label; no button without both. */
  readonly url?: string | null
  readonly cta?: string | null
  readonly tallerNombre?: string | null
}

/**
 * Every automatic talleres notice by email (odd/tasks/talleres-reserva-publica.md
 * T7, S6; design/talleres-reserva/11): the same title and text as the in-app
 * notice, its data rows and one button. The database writes the text
 * (taller_avisos_envios.datos), so the email and the app always say the same.
 */
export function TallerAvisoEmail({
  nombre = '',
  titulo = 'Aviso de tu taller',
  cuerpo = '',
  filas = [],
  url = null,
  cta = null,
  tallerNombre = null,
}: TallerAvisoEmailProps) {
  return (
    <EmailLayout preview={cuerpo || titulo}>
      <Text style={styles.marca}>Iglesia Global · Grupos de Corto Plazo</Text>
      <Text style={styles.title}>{titulo}</Text>
      {nombre ? <Text style={styles.text}>¡Hola, {nombre}!</Text> : null}
      {cuerpo ? <Text style={styles.text}>{cuerpo}</Text> : null}
      {filas.length > 0 ? (
        <Section style={styles.datos}>
          {filas.map(([etiqueta, valor]) => (
            <Text key={etiqueta} style={styles.fila}>
              <span style={styles.etiqueta}>{etiqueta}</span>
              <br />
              <span style={styles.valor}>{valor}</span>
            </Text>
          ))}
        </Section>
      ) : null}
      {url && cta ? <EmailButton href={url}>{cta}</EmailButton> : null}
      <Text style={styles.hint}>
        Recibes este correo porque te inscribiste{tallerNombre ? ` en ${tallerNombre}` : ' en un taller'} o pediste que te
        avisáramos. Si no fuiste tú, puedes ignorarlo.
      </Text>
    </EmailLayout>
  )
}

const styles = {
  marca: {
    fontSize: '12px',
    fontWeight: '600' as const,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    color: '#6b7280',
    margin: '0 0 8px',
  },
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
  datos: {
    margin: '8px 0 8px',
    padding: '4px 16px',
    borderRadius: '10px',
    backgroundColor: '#1f1f2a',
  },
  fila: {
    margin: '10px 0',
    fontSize: '14px',
    lineHeight: '1.5',
  },
  etiqueta: {
    fontSize: '12px',
    color: '#6b7280',
  },
  valor: {
    color: '#ffffff',
    // T10: «Indicaciones» may have line breaks; keep them.
    whiteSpace: 'pre-line' as const,
  },
  hint: {
    fontSize: '13px',
    color: '#6b7280',
    marginTop: '24px',
  },
}

export default TallerAvisoEmail
