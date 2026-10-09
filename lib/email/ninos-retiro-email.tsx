import { Text } from '@react-email/components'
import { EmailLayout } from '@/emails/components/EmailLayout'

export interface NinosRetiroEmailProps {
  /** One sentence per child, e.g. "Sofía fue retirada a las 10:42 por Ana." */
  readonly lineas: readonly string[]
}

/** N9: one email per family visit after the check-out. */
export function NinosRetiroEmail({ lineas = [] }: NinosRetiroEmailProps) {
  return (
    <EmailLayout preview={lineas[0] ?? 'Retiro registrado'}>
      {lineas.map((l) => (
        <Text key={l} style={styles.text}>
          {l}
        </Text>
      ))}
      <Text style={styles.hint}>Si no reconoces este retiro, comunícate de inmediato con el equipo de Niños.</Text>
    </EmailLayout>
  )
}

const styles = {
  text: { fontSize: '16px', lineHeight: '1.6', color: '#e5e5ee', margin: '0 0 8px' },
  hint: { fontSize: '13px', color: '#6b7280', marginTop: '24px' },
}

export default NinosRetiroEmail
