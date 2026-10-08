import { Text } from '@react-email/components'
import { EmailLayout } from '@/emails/components/EmailLayout'

export interface NinosIngresoEmailProps {
  /** One sentence per child, e.g. "Sofía ingresó a Preescolar II a las 9:05." */
  readonly lineas: readonly string[]
  readonly codigo: string
}

/** N9: one email per family visit after the check-in. */
export function NinosIngresoEmail({ lineas = [], codigo = '' }: NinosIngresoEmailProps) {
  return (
    <EmailLayout preview={`Tu código de retiro es ${codigo}`}>
      {lineas.map((l) => (
        <Text key={l} style={styles.text}>
          {l}
        </Text>
      ))}
      <Text style={styles.codigo}>Tu código de retiro es {codigo}.</Text>
      <Text style={styles.hint}>Muestra este código al retirar a tus niños.</Text>
    </EmailLayout>
  )
}

const styles = {
  text: { fontSize: '16px', lineHeight: '1.6', color: '#e5e5ee', margin: '0 0 8px' },
  codigo: { fontSize: '22px', fontWeight: '700' as const, color: '#ffffff', margin: '16px 0 0' },
  hint: { fontSize: '13px', color: '#6b7280', marginTop: '24px' },
}

export default NinosIngresoEmail
