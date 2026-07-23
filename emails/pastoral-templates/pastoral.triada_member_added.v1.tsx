/**
 * W11 — DT-064 — Pastoral: triada_member_added.v1 template.
 * Sent when a new member is added to a triada.
 */

import { Text } from '@react-email/components'

import { EmailLayout } from '../components/EmailLayout'
import type { PastoralEmailPropsMap } from '@/lib/platform/pastoral/notifications/template-keys'

type Props = PastoralEmailPropsMap['pastoral_triada_member_added']

export function PastoralTriadaMemberAddedEmail({
  leaderName,
  assistedName,
  newMemberName,
}: Props) {
  return (
    <EmailLayout preview={`${newMemberName} se ha unido a tu triada`}>
      <Text style={styles.title}>Nuevo Miembro en Triada</Text>
      <Text style={styles.text}>
        Hola {assistedName}, <strong>{newMemberName}</strong> se ha unido
        a tu triada de acompañamiento liderada por <strong>{leaderName}</strong>.
      </Text>
      <Text style={styles.text}>
        Da la bienvenida a este nuevo miembro y sigue construyendo
        ese espacio de confianza y crecimiento espiritual.
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
