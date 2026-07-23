/**
 * W11 — DT-064 — Pastoral: one_on_one_note_logged.v1 template.
 * Sent when a note is added to a 1:1 (mentor only).
 */

import { Text } from '@react-email/components'

import { EmailLayout } from '../components/EmailLayout'
import type { PastoralEmailPropsMap } from '@/lib/platform/pastoral/notifications/template-keys'

type Props = PastoralEmailPropsMap['pastoral_one_on_one_note_logged']

export function PastoralOneOnOneNoteLoggedEmail({
  leaderName,
  assistedName,
}: Props) {
  return (
    <EmailLayout preview={`Nota registrada en tu 1:1 con ${leaderName}`}>
      <Text style={styles.title}>Nota Registrada</Text>
      <Text style={styles.text}>
        Hola {assistedName}, tu líder <strong>{leaderName}</strong> ha registrado
        una nota en tu encuentro 1:1 de seguimiento pastoral.
      </Text>
      <Text style={styles.text}>
        Esta nota queda registrada en tu historial de acompañamiento como parte
        del proceso de seguimiento.
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
