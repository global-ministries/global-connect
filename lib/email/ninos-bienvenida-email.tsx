import { Text } from '@react-email/components'
import { EmailButton } from '@/emails/components/EmailButton'
import { EmailLayout } from '@/emails/components/EmailLayout'

export interface NinosBienvenidaEmailProps {
  readonly nombre: string
  /** Absolute link to Mi Perfil → Mis hijos (R3b). */
  readonly urlMisHijos?: string
}

/** N8: sent after the anfitrión confirms a family pre-registration that carried an email. */
export function NinosBienvenidaEmail({
  nombre = '',
  urlMisHijos = 'https://miembros.yosoyglobal.org/perfil#mis-hijos',
}: NinosBienvenidaEmailProps) {
  return (
    <EmailLayout preview="Bienvenidos a Waumba Land / UpStreet">
      <Text style={styles.title}>Bienvenidos a Waumba Land / UpStreet</Text>
      <Text style={styles.text}>
        ¡Hola{nombre ? `, ${nombre}` : ''}! Tu familia ya está registrada en Niños. Cada domingo, en la mesa de
        check-in, te daremos un código de retiro: guárdalo, porque lo pediremos para entregarte a tus niños.
      </Text>
      <Text style={styles.text}>
        A este correo te avisaremos cuando tus niños ingresen a su salón y cuando sean retirados.
      </Text>
      <Text style={styles.text}>
        En GlobalConnect, en Mi Perfil → Mis hijos, puedes ver a tus niños y avisar a la mesa que van en camino.
      </Text>
      <EmailButton href={urlMisHijos}>Ver a mis hijos</EmailButton>
      <Text style={styles.hint}>Si no esperabas este correo, puedes ignorarlo.</Text>
    </EmailLayout>
  )
}

const styles = {
  title: { fontSize: '24px', fontWeight: '700' as const, color: '#ffffff', margin: '0 0 16px' },
  text: { fontSize: '15px', lineHeight: '1.6', color: '#a0a0b0', margin: '0 0 16px' },
  hint: { fontSize: '13px', color: '#6b7280', marginTop: '24px' },
}

export default NinosBienvenidaEmail
