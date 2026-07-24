/**
 * W11 — DT-064 — Pastoral: triada_member_removed.v1 template.
 * Sent when a member is removed from a triada.
 */

import { Text } from '@react-email/components'

import { EmailLayout } from '../components/EmailLayout'
import type { PastoralEmailPropsMap } from '@/lib/platform/pastoral/notifications/template-keys'

type Props = PastoralEmailPropsMap['pastoral_triada_member_removed']

export function PastoralTriadaMemberRemovedEmail({
  leaderName,
  assistedName,
  removedMemberName,
}: Props) {
  return (
    <EmailLayout preview={`Un miembro ha salido de tu triada`}>
      <Text style={styles.title}>Miembro Removido de Triada</Text>
      <Text style={styles.text}>
        Hola {assistedName}, <strong>{removedMemberName}</strong> ya no forma
        parte de tu triada de acompañamiento liderada por <strong>{leaderName}</strong>.
      </Text>
      <Text style={styles.text}>
        La triada continua con los miembros restantes. Si tienes alguna
        pregunta, comunícate con tu líder.
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
