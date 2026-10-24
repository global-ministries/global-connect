import { Text } from '@react-email/components'
import { EmailLayout } from '@/emails/components/EmailLayout'

export interface NinosAutorizadosEmailProps {
  /** The recipient's first name. */
  readonly nombre: string
  /** The first line explains the change; the rest are the authorized people. */
  readonly lineas: readonly string[]
}

/** M6c (D2): another parent changed the pickup list from Mis hijos. */
export function NinosAutorizadosEmail({ nombre = '', lineas = [] }: NinosAutorizadosEmailProps) {
  const [explicacion, ...personas] = lineas
  return (
    <EmailLayout preview={explicacion ?? 'Cambió la lista de personas autorizadas'}>
      <Text style={styles.text}>{nombre ? `Hola, ${nombre}:` : 'Hola:'}</Text>
      {explicacion && <Text style={styles.text}>{explicacion}</Text>}
      {personas.map((p) => (
        <Text key={p} style={styles.item}>
          • {p}
        </Text>
      ))}
      <Text style={styles.hint}>
        Si no reconoces este cambio, comunícate con el equipo de Niños antes del próximo servicio.
      </Text>
    </EmailLayout>
  )
}

const styles = {
  text: { fontSize: '16px', lineHeight: '1.6', color: '#e5e5ee', margin: '0 0 8px' },
  item: { fontSize: '16px', lineHeight: '1.6', color: '#e5e5ee', margin: '0 0 4px 8px' },
  hint: { fontSize: '13px', color: '#6b7280', marginTop: '24px' },
}

export default NinosAutorizadosEmail
