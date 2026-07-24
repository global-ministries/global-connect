/**
 * W11 — DT-068 — Tests for Pastoral WhatsApp template formatters.
 */

import {
  formatOneOnOneScheduledWhatsApp,
  formatOneOnOneReminderWhatsApp,
  formatOneOnOneCompletedWhatsApp,
  formatOneOnOneCancelledWhatsApp,
  formatOneOnOneNoteLoggedWhatsApp,
  formatOneOnOneStepValidatedWhatsApp,
  formatTriadaFormedWhatsApp,
  formatTriadaMemberAddedWhatsApp,
  formatTriadaMemberRemovedWhatsApp,
  formatTriadaDisbandedWhatsApp,
  formatTriadaStepSuggestedWhatsApp,
  formatTriadaStepValidatedWhatsApp,
  formatCrisisAlertWhatsApp,
} from '@/lib/whatsapp/pastoral-templates'

describe('Pastoral WhatsApp template formatters', () => {
  describe('1:1 templates', () => {
    it('formatOneOnOneScheduledWhatsApp returns message under 160 chars', () => {
      const result = formatOneOnOneScheduledWhatsApp({
        leaderName: 'Carlos Méndez',
        assistedName: 'Ana Rodríguez',
        eventDate: '2026-07-25T10:00:00Z',
      })
      expect(result.length).toBeLessThan(160)
      expect(result).toContain('Carlos Méndez')
      expect(result).toContain('1:1')
    })

    it('formatOneOnOneReminderWhatsApp returns message under 160 chars', () => {
      const result = formatOneOnOneReminderWhatsApp({
        leaderName: 'Carlos Méndez',
        assistedName: 'Ana Rodríguez',
        eventDate: '2026-07-25T10:00:00Z',
        hoursUntil: 24,
      })
      expect(result.length).toBeLessThan(160)
      expect(result).toContain('24h')
      expect(result).toContain('Carlos Méndez')
    })

    it('formatOneOnOneCompletedWhatsApp returns message under 160 chars', () => {
      const result = formatOneOnOneCompletedWhatsApp({
        leaderName: 'Carlos Méndez',
        assistedName: 'Ana Rodríguez',
      })
      expect(result.length).toBeLessThan(160)
      expect(result).toContain('completado')
    })

    it('formatOneOnOneCancelledWhatsApp includes motivo when provided', () => {
      const result = formatOneOnOneCancelledWhatsApp({
        leaderName: 'Carlos Méndez',
        assistedName: 'Ana Rodríguez',
        motivo: 'Cambio de horario',
      })
      expect(result).toContain('Cambio de horario')
      expect(result.length).toBeLessThan(160)
    })

    it('formatOneOnOneNoteLoggedWhatsApp returns message under 160 chars', () => {
      const result = formatOneOnOneNoteLoggedWhatsApp({
        leaderName: 'Carlos Méndez',
        assistedName: 'Ana Rodríguez',
      })
      expect(result.length).toBeLessThan(160)
      expect(result).toContain('nota')
    })

    it('formatOneOnOneStepValidatedWhatsApp returns message under 160 chars', () => {
      const result = formatOneOnOneStepValidatedWhatsApp({
        leaderName: 'Carlos Méndez',
        assistedName: 'Ana Rodríguez',
        stepName: 'Oración inicial',
      })
      expect(result.length).toBeLessThan(160)
      expect(result).toContain('Oración inicial')
    })
  })

  describe('Triada templates', () => {
    it('formatTriadaFormedWhatsApp returns message under 160 chars', () => {
      const result = formatTriadaFormedWhatsApp({
        leaderName: 'Carlos Méndez',
        assistedName: 'Ana Rodríguez',
        memberNames: ['Ana', 'Pedro', 'María'],
      })
      expect(result.length).toBeLessThan(160)
      expect(result).toContain('triada')
    })

    it('formatTriadaMemberAddedWhatsApp returns message under 160 chars', () => {
      const result = formatTriadaMemberAddedWhatsApp({
        leaderName: 'Carlos Méndez',
        assistedName: 'Ana Rodríguez',
        newMemberName: 'Pedro',
      })
      expect(result.length).toBeLessThan(160)
      expect(result).toContain('Pedro')
    })

    it('formatTriadaMemberRemovedWhatsApp returns message under 160 chars', () => {
      const result = formatTriadaMemberRemovedWhatsApp({
        leaderName: 'Carlos Méndez',
        assistedName: 'Ana Rodríguez',
        removedMemberName: 'Pedro',
      })
      expect(result.length).toBeLessThan(160)
      expect(result).toContain('Pedro')
    })

    it('formatTriadaDisbandedWhatsApp returns message under 160 chars', () => {
      const result = formatTriadaDisbandedWhatsApp({
        leaderName: 'Carlos Méndez',
        assistedName: 'Ana Rodríguez',
      })
      expect(result.length).toBeLessThan(160)
      expect(result).toContain('disuelta')
    })

    it('formatTriadaStepSuggestedWhatsApp returns message under 160 chars', () => {
      const result = formatTriadaStepSuggestedWhatsApp({
        leaderName: 'Carlos Méndez',
        assistedName: 'Ana Rodríguez',
        stepName: 'Estudio bíblico',
      })
      expect(result.length).toBeLessThan(160)
      expect(result).toContain('Estudio bíblico')
    })

    it('formatTriadaStepValidatedWhatsApp returns message under 160 chars', () => {
      const result = formatTriadaStepValidatedWhatsApp({
        leaderName: 'Carlos Méndez',
        assistedName: 'Ana Rodríguez',
        stepName: 'Estudio bíblico',
      })
      expect(result.length).toBeLessThan(160)
      expect(result).toContain('validado')
    })
  })

  describe('Crisis alert', () => {
    it('formatCrisisAlertWhatsApp returns message under 160 chars', () => {
      const result = formatCrisisAlertWhatsApp({
        leaderName: 'Carlos Méndez',
        assistedName: 'Ana Rodríguez',
        categories: ['duelo', 'crisis_matrimonial'],
      })
      expect(result.length).toBeLessThan(160)
      expect(result).toContain('ALERTA')
      expect(result).toContain('duelo')
    })
  })
})
