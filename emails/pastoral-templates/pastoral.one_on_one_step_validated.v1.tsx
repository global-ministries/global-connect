/**
 * W11 — DT-064 — Pastoral: one_on_one_step_validated.v1 template.
 * Sent when a step is validated in a 1:1.
 */

import { Text } from '@react-email/components'

import { EmailLayout } from '../components/EmailLayout'
import type { PastoralEmailPropsMap } from '@/lib/platform/pastoral/notifications/template-keys'

type Props = PastoralEmailPropsMap['pastoral_one_on_one_step_validated']

export function PastoralOneOnOneStepValidatedEmail({
  leaderName,
  assistedName,
  stepName,
}: Props) {
  return (
    <EmailLayout preview={`Paso "${stepName}" validado en tu 1:1`}>
      <Text style={styles.title}>Paso Validado</Text>
      <Text style={styles.text}>
        Hola {assistedName}, el paso <strong>&quot;{stepName}&quot;</strong> ha sido
        validado en tu encuentro 1:1 con <strong>{leaderName}</strong>.
      </Text>
      <Text style={styles.text}>
        Este avance queda registrado en tu camino de crecimiento espiritual.
        ¡Sigue adelante!
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
