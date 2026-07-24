/**
 * W11 — DT-064 — Pastoral: triada_step_validated.v1 template.
 * Sent when a step is validated in a triada.
 */

import { Text } from '@react-email/components'

import { EmailLayout } from '../components/EmailLayout'
import type { PastoralEmailPropsMap } from '@/lib/platform/pastoral/notifications/template-keys'

type Props = PastoralEmailPropsMap['pastoral_triada_step_validated']

export function PastoralTriadaStepValidatedEmail({
  leaderName,
  assistedName,
  stepName,
}: Props) {
  return (
    <EmailLayout preview={`Paso "${stepName}" validado en tu triada`}>
      <Text style={styles.title}>Paso Validado en Triada</Text>
      <Text style={styles.text}>
        Hola {assistedName}, el paso <strong>&quot;{stepName}&quot;</strong> ha
        sido validado en tu triada liderada por <strong>{leaderName}</strong>.
      </Text>
      <Text style={styles.text}>
        Este avance es un testimonio del compromiso de ustedes como comunidad
        de fe. Sigan adelante con fiducia.
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
