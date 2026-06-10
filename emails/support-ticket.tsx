import { Text } from '@react-email/components'

import { EmailButton } from './components/EmailButton'
import { EmailLayout } from './components/EmailLayout'

export type SupportEmailStatus = 'received' | 'in_review' | 'in_progress' | 'resolved' | 'closed'

interface SupportTicketEmailProps {
  recipientName?: string
  ticketNumber: number
  title: string
  status: SupportEmailStatus
  ticketUrl: string
}

export function SupportTicketCreatedEmail({ recipientName = 'Usuario', ticketNumber, title, status, ticketUrl }: SupportTicketEmailProps) {
  return (
    <EmailLayout preview={`Recibimos tu solicitud #${ticketNumber}`}>
      <Text style={styles.title}>Recibimos tu solicitud, {recipientName}</Text>
      <Text style={styles.text}>
        Tu solicitud #{ticketNumber} fue registrada y nuestro equipo la revisará desde GlobalConnect.
      </Text>
      <TicketSummary title={title} status={status} />
      <EmailButton href={ticketUrl}>Ver mi solicitud</EmailButton>
      <Text style={styles.hint}>
        Por seguridad, los detalles completos solo están disponibles al iniciar sesión.
      </Text>
    </EmailLayout>
  )
}

export function SupportTicketMessageEmail({ recipientName = 'Usuario', ticketNumber, title, status, ticketUrl }: SupportTicketEmailProps) {
  return (
    <EmailLayout preview={`Nueva respuesta en tu solicitud #${ticketNumber}`}>
      <Text style={styles.title}>Tienes una nueva respuesta, {recipientName}</Text>
      <Text style={styles.text}>
        Nuestro equipo agregó una respuesta a tu solicitud #{ticketNumber}.
      </Text>
      <TicketSummary title={title} status={status} />
      <EmailButton href={ticketUrl}>Abrir solicitud</EmailButton>
      <Text style={styles.hint}>
        Ingresa a GlobalConnect para leer la conversación completa y responder si hace falta.
      </Text>
    </EmailLayout>
  )
}

export function SupportTicketStatusChangedEmail({ recipientName = 'Usuario', ticketNumber, title, status, ticketUrl }: SupportTicketEmailProps) {
  return (
    <EmailLayout preview={`Actualizamos tu solicitud #${ticketNumber}`}>
      <Text style={styles.title}>Actualizamos tu solicitud, {recipientName}</Text>
      <Text style={styles.text}>
        El estado de tu solicitud #{ticketNumber} cambió a {getSupportStatusLabel(status)}.
      </Text>
      <TicketSummary title={title} status={status} />
      <EmailButton href={ticketUrl}>Revisar solicitud</EmailButton>
      <Text style={styles.hint}>
        Este correo solo incluye un resumen seguro. Los detalles están protegidos dentro de tu sesión.
      </Text>
    </EmailLayout>
  )
}

function TicketSummary({ title, status }: Pick<SupportTicketEmailProps, 'title' | 'status'>) {
  return (
    <>
      <Text style={styles.label}>Solicitud</Text>
      <Text style={styles.summary}>{title}</Text>
      <Text style={styles.label}>Estado</Text>
      <Text style={styles.summary}>{getSupportStatusLabel(status)}</Text>
    </>
  )
}

export function getSupportStatusLabel(status: SupportEmailStatus) {
  const labels: Record<SupportEmailStatus, string> = {
    received: 'Recibido',
    in_review: 'En revisión',
    in_progress: 'En progreso',
    resolved: 'Resuelto',
    closed: 'Cerrado',
  }

  return labels[status]
}

const styles = {
  title: {
    fontSize: '24px',
    fontWeight: '700' as const,
    color: '#ffffff',
    margin: '0 0 16px',
  },
  text: {
    fontSize: '15px',
    lineHeight: '1.6',
    color: '#a0a0b0',
    margin: '0 0 16px',
  },
  label: {
    fontSize: '12px',
    fontWeight: '700' as const,
    letterSpacing: '0.04em',
    textTransform: 'uppercase' as const,
    color: '#D06D2D',
    margin: '20px 0 6px',
  },
  summary: {
    fontSize: '15px',
    lineHeight: '1.5',
    color: '#ffffff',
    margin: '0',
  },
  hint: {
    fontSize: '13px',
    color: '#6b7280',
    marginTop: '24px',
    lineHeight: '1.5',
  },
}
