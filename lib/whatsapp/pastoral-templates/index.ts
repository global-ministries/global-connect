/**
 * W11 — DT-065 — Pastoral WhatsApp templates.
 * Short messages for WhatsApp notification channel.
 * Max ~160 characters per message.
 */

export interface PastoralWhatsAppPropsMap {
  pastoral_one_on_one_scheduled: {
    leaderName: string
    assistedName: string
    eventDate: string
  }
  pastoral_one_on_one_completed: {
    leaderName: string
    assistedName: string
  }
  pastoral_one_on_one_cancelled: {
    leaderName: string
    assistedName: string
    motivo?: string
  }
  pastoral_one_on_one_note_logged: {
    leaderName: string
    assistedName: string
  }
  pastoral_one_on_one_step_validated: {
    leaderName: string
    assistedName: string
    stepName: string
  }
  pastoral_one_on_one_reminder: {
    leaderName: string
    assistedName: string
    eventDate: string
    hoursUntil: number
  }
  pastoral_triada_formed: {
    leaderName: string
    assistedName: string
    memberNames: string[]
  }
  pastoral_triada_member_added: {
    leaderName: string
    assistedName: string
    newMemberName: string
  }
  pastoral_triada_member_removed: {
    leaderName: string
    assistedName: string
    removedMemberName: string
  }
  pastoral_triada_disbanded: {
    leaderName: string
    assistedName: string
    motivo?: string
  }
  pastoral_triada_step_suggested: {
    leaderName: string
    assistedName: string
    stepName: string
  }
  pastoral_triada_step_validated: {
    leaderName: string
    assistedName: string
    stepName: string
  }
  pastoral_crisis_alert: {
    leaderName: string
    assistedName: string
    categories: string[]
  }
}

// ─── WhatsApp message formatters ─────────────────────────────────────────────

export function formatOneOnOneScheduledWhatsApp(props: PastoralWhatsAppPropsMap['pastoral_one_on_one_scheduled']): string {
  const date = new Date(props.eventDate).toLocaleDateString('es-VE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  return `1:1 con ${props.leaderName} programado para ${date}. Prepárate para compartir. Bendiciones!`
}

export function formatOneOnOneReminderWhatsApp(props: PastoralWhatsAppPropsMap['pastoral_one_on_one_reminder']): string {
  return `⏰ Recordatorio: Tu 1:1 con ${props.leaderName} es en ${props.hoursUntil}h. Te esperamos!`
}

export function formatOneOnOneCompletedWhatsApp(props: PastoralWhatsAppPropsMap['pastoral_one_on_one_completed']): string {
  return `✓ Tu 1:1 con ${props.leaderName} ha sido completado. Gracias por tu tiempo!`
}

export function formatOneOnOneCancelledWhatsApp(props: PastoralWhatsAppPropsMap['pastoral_one_on_one_cancelled']): string {
  const motivo = props.motivo ? ` Motivo: ${props.motivo}` : ''
  return `✗ Tu 1:1 con ${props.leaderName} ha sido cancelado.${motivo} Tu líder se comunicará.`
}

export function formatOneOnOneNoteLoggedWhatsApp(props: PastoralWhatsAppPropsMap['pastoral_one_on_one_note_logged']): string {
  return `📝 Se ha registrado una nota en tu 1:1 con ${props.leaderName}.`
}

export function formatOneOnOneStepValidatedWhatsApp(props: PastoralWhatsAppPropsMap['pastoral_one_on_one_step_validated']): string {
  return `🎯 Paso "${props.stepName}" validado en tu 1:1 con ${props.leaderName}. Sigue adelante!`
}

export function formatTriadaFormedWhatsApp(props: PastoralWhatsAppPropsMap['pastoral_triada_formed']): string {
  const members = props.memberNames.slice(0, 2).join(', ')
  return `🌟 Tu triada con ${props.leaderName} ha sido formada. Miembros: ${members}. Bendiciones!`
}

export function formatTriadaMemberAddedWhatsApp(props: PastoralWhatsAppPropsMap['pastoral_triada_member_added']): string {
  return `👋 ${props.newMemberName} se ha unido a tu triada con ${props.leaderName}. Bienvenido!`
}

export function formatTriadaMemberRemovedWhatsApp(props: PastoralWhatsAppPropsMap['pastoral_triada_member_removed']): string {
  return `👤 ${props.removedMemberName} ha salido de tu triada con ${props.leaderName}.`
}

export function formatTriadaDisbandedWhatsApp(props: PastoralWhatsAppPropsMap['pastoral_triada_disbanded']): string {
  return `📤 Tu triada con ${props.leaderName} ha sido disuelta. Gracias por este tiempo juntos.`
}

export function formatTriadaStepSuggestedWhatsApp(props: PastoralWhatsAppPropsMap['pastoral_triada_step_suggested']): string {
  return `💡 Nuevo paso sugerido en tu triada: "${props.stepName}". Vive este tiempo con fiducia!`
}

export function formatTriadaStepValidatedWhatsApp(props: PastoralWhatsAppPropsMap['pastoral_triada_step_validated']): string {
  return `✅ Paso "${props.stepName}" validado en tu triada con ${props.leaderName}. Bravo!`
}

export function formatCrisisAlertWhatsApp(props: PastoralWhatsAppPropsMap['pastoral_crisis_alert']): string {
  const cats = props.categories.slice(0, 2).join(', ')
  return `🚨 ALERTA: Crisis detectada en acompañamiento de ${props.assistedName}. Categorías: ${cats}. Requiere atención inmediata.`
}
