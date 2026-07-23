/**
 * W11 — DT-064 — Pastoral: crisis_alert.v1 template.
 * Sent ONLY to pastor/admin when a crisis is detected. NOT to the assisted.
 */

import { Text } from '@react-email/components'

import { EmailLayout } from '../components/EmailLayout'
import type { PastoralEmailPropsMap } from '@/lib/platform/pastoral/notifications/template-keys'

type Props = PastoralEmailPropsMap['pastoral_crisis_alert']

export function PastoralCrisisAlertEmail({
  leaderName,
  assistedName,
  categories,
}: Props) {
  const categoriesList = categories.join(', ')

  return (
    <EmailLayout preview={`Alerta: Detección de crisis en acompañamiento`}>
      <Text style={styles.title}>Alerta de Crisis Detectada</Text>
      <Text style={styles.text}>
        Se ha detectado una situación de crisis en el acompañamiento de{' '}
        <strong>{assistedName}</strong> por parte del líder <strong>{leaderName}</strong>.
      </Text>
      <Text style={styles.categories}>
        Categorías detectadas: <strong>{categoriesList}</strong>
      </Text>
      <Text style={styles.text}>
        Esta alerta requiere atención inmediata. Por favor, contactar a{' '}
        <strong>{leaderName}</strong> para más detalles y coordinar la
        intervención appropriate.
      </Text>
      <Text style={styles.urgent}>
        Este correo es confidencial. No compartir con terceros no autorizados.
      </Text>
      <Text style={styles.hint}>
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
  categories: {
    fontSize: '16px',
    color: '#D06D2D',
    margin: '0 0 16px',
    fontWeight: '600' as const,
  },
  urgent: {
    fontSize: '14px',
    color: '#ef4444',
    margin: '16px 0 12px',
    fontStyle: 'italic' as const,
  },
  hint: {
    fontSize: '14px',
    color: '#94a3b8',
    margin: '16px 0 0',
    fontStyle: 'italic' as const,
  },
}
