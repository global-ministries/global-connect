/**
 * W11 — DT-064 — Pastoral: triada_disbanded.v1 template.
 * Sent when a triada is disbanded.
 */

import { Text } from '@react-email/components'

import { EmailLayout } from '../components/EmailLayout'
import type { PastoralEmailPropsMap } from '@/lib/platform/pastoral/notifications/template-keys'

type Props = PastoralEmailPropsMap['pastoral_triada_disbanded']

export function PastoralTriadaDisbandedEmail({
  leaderName,
  assistedName,
  motivo,
}: Props) {
  return (
    <EmailLayout preview={`Tu triada ha sido disuelta`}>
      <Text style={styles.title}>Triada Disuelta</Text>
      <Text style={styles.text}>
        Hola {assistedName}, tu triada de acompañamiento liderada por{' '}
        <strong>{leaderName}</strong> ha sido disuelta.
      </Text>
      {motivo && (
        <Text style={styles.motivo}>Motivo: {motivo}</Text>
      )}
      <Text style={styles.text}>
        Agradecemos el tiempo compartido en comunidad. Si necesitas
        más acompañamiento, tu líder estará disponible.
      </Text>
      <Text style={styles.hint}>
        Bendiciones,
        <br />
        Equipo de Acompañamiento Pastoral
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
    fontSize: '16px',
    color: '#cbd5e1',
    margin: '0 0 12px',
    lineHeight: '1.5',
  },
  motivo: {
    fontSize: '14px',
    color: '#94a3b8',
    margin: '0 0 12px',
    fontStyle: 'italic' as const,
  },
  hint: {
    fontSize: '14px',
    color: '#94a3b8',
    margin: '16px 0 0',
    fontStyle: 'italic' as const,
  },
}
