/**
 * W11 — DT-064 — Pastoral: triada_formed.v1 template.
 * Sent when a triada is formed.
 */

import { Text } from '@react-email/components'

import { EmailLayout } from '../components/EmailLayout'
import type { PastoralEmailPropsMap } from '@/lib/platform/pastoral/notifications/template-keys'

type Props = PastoralEmailPropsMap['pastoral_triada_formed']

export function PastoralTriadaFormedEmail({
  leaderName,
  assistedName,
  memberNames,
}: Props) {
  const membersList = memberNames.join(', ')

  return (
    <EmailLayout preview={`Triada de acompañamiento formada`}>
      <Text style={styles.title}>Triada de Acompañamiento</Text>
      <Text style={styles.text}>
        Hola {assistedName}, tu triada de acompañamiento ha sido formada bajo
        el liderazgo de <strong>{leaderName}</strong>.
      </Text>
      <Text style={styles.text}>
        Los miembros de tu triada son: <strong>{membersList}</strong>.
      </Text>
      <Text style={styles.text}>
        La triada es un espacio sagrado de confianza donde comparten, oran
        y crecen juntos en fe. Confiamos en que este tiempo será de
        bendicion para cada miembro.
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
  hint: {
    fontSize: '14px',
    color: '#94a3b8',
    margin: '16px 0 0',
    fontStyle: 'italic' as const,
  },
}
