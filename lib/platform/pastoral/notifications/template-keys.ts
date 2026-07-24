/**
 * W11 — Pastoral notification template keys.
 * 13 templates: pastoral.{kind}.email.v1 and pastoral.{kind}.whatsapp.v1
 */

export const PASTORAL_TEMPLATE_KEYS = [
  'pastoral_one_on_one_scheduled',
  'pastoral_one_on_one_completed',
  'pastoral_one_on_one_cancelled',
  'pastoral_one_on_one_note_logged',
  'pastoral_one_on_one_step_validated',
  'pastoral_one_on_one_reminder',
  'pastoral_triada_formed',
  'pastoral_triada_member_added',
  'pastoral_triada_member_removed',
  'pastoral_triada_disbanded',
  'pastoral_triada_step_suggested',
  'pastoral_triada_step_validated',
  'pastoral_crisis_alert',
] as const

export type PastoralTemplateKey = (typeof PASTORAL_TEMPLATE_KEYS)[number]

export const PASTORAL_TEMPLATE_VERSION = 'v1' as const

export type PastoralEmailTemplateKey = `${PastoralTemplateKey}.email.${typeof PASTORAL_TEMPLATE_VERSION}`
export type PastoralWhatsAppTemplateKey = `${PastoralTemplateKey}.whatsapp.${typeof PASTORAL_TEMPLATE_VERSION}`

// ─── Props maps ────────────────────────────────────────────────────────────────

export interface PastoralEmailPropsMap {
  pastoral_one_on_one_scheduled: {
    leaderName: string
    assistedName: string
    eventDate: string
    oneOnOneId: string
  }
  pastoral_one_on_one_completed: {
    leaderName: string
    assistedName: string
    eventDate: string
    oneOnOneId: string
  }
  pastoral_one_on_one_cancelled: {
    leaderName: string
    assistedName: string
    eventDate: string
    motivo: string
    oneOnOneId: string
  }
  pastoral_one_on_one_note_logged: {
    leaderName: string
    assistedName: string
    oneOnOneId: string
  }
  pastoral_one_on_one_step_validated: {
    leaderName: string
    assistedName: string
    stepName: string
    oneOnOneId: string
  }
  pastoral_one_on_one_reminder: {
    leaderName: string
    assistedName: string
    eventDate: string
    oneOnOneId: string
    hoursUntil: number
  }
  pastoral_triada_formed: {
    leaderName: string
    assistedName: string
    triadaId: string
    memberNames: string[]
  }
  pastoral_triada_member_added: {
    leaderName: string
    assistedName: string
    newMemberName: string
    triadaId: string
  }
  pastoral_triada_member_removed: {
    leaderName: string
    assistedName: string
    removedMemberName: string
    triadaId: string
  }
  pastoral_triada_disbanded: {
    leaderName: string
    assistedName: string
    motivo: string
    triadaId: string
  }
  pastoral_triada_step_suggested: {
    leaderName: string
    assistedName: string
    stepName: string
    triadaId: string
  }
  pastoral_triada_step_validated: {
    leaderName: string
    assistedName: string
    stepName: string
    triadaId: string
  }
  pastoral_crisis_alert: {
    leaderName: string
    assistedName: string
    categories: string[]
    oneOnOneId: string
  }
}

export type PastoralEmailTemplateProps<K extends PastoralTemplateKey> = PastoralEmailPropsMap[K]
