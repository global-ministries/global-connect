/**
 * W13 — Tests for next-step-suggestion.ts (D26 declarative rules).
 */

import { suggestNextStep } from '@/lib/platform/pastoral/public-roadmap/next-step-suggestion'
import type { PublicRoadmap, PublicRoadmapStep } from '@/lib/platform/pastoral/public-roadmap/types'

function makeRoadmap(overrides: Partial<PublicRoadmap> = {}): PublicRoadmap {
  return {
    assistedPersonaId: 'persona-1',
    sesiones: [],
    proximoUnoAuno: null,
    pasosValidadosTotal: [],
    proximoPasoSugerido: null,
    generatedAtIso: new Date().toISOString(),
    ...overrides,
  }
}

function makeStep(key: string, validatedAtIso = '2025-01-01T00:00:00Z'): PublicRoadmapStep {
  return { id: `step-${key}`, stepKey: key, validatedAtIso, isSharedMilestone: false }
}

describe('suggestNextStep — declarative rules (D26)', () => {
  describe('rule: no sessions', () => {
    it('returns primera_conexion when roadmap has no sessions', () => {
      const roadmap = makeRoadmap({ sesiones: [], pasosValidadosTotal: [] })
      expect(suggestNextStep(roadmap)).toBe('primera_conexion')
    })
  })

  describe('rule: no steps validated yet', () => {
    it('returns establecer_proposito when sessions exist but no steps', () => {
      const roadmap = makeRoadmap({
        sesiones: [{ id: '1', estado: 'completed', scheduledAtIso: null, completedAtIso: null, pasosValidados: [], resumen: null, notas: null }],
        pasosValidadosTotal: [],
      })
      expect(suggestNextStep(roadmap)).toBe('establecer_proposito')
    })
  })

  describe('rule: after primera_conexion', () => {
    it('returns establecer_proposito after primera_conexion', () => {
      const roadmap = makeRoadmap({
        sesiones: [{ id: '1', estado: 'completed', scheduledAtIso: null, completedAtIso: null, pasosValidados: [makeStep('primera_conexion')], resumen: null, notas: null }],
        pasosValidadosTotal: [makeStep('primera_conexion')],
      })
      expect(suggestNextStep(roadmap)).toBe('establecer_proposito')
    })
  })

  describe('rule: after establecer_proposito', () => {
    it('returns crecimiento_proposito', () => {
      const roadmap = makeRoadmap({
        sesiones: [{ id: '1', estado: 'completed', scheduledAtIso: null, completedAtIso: null, pasosValidados: [makeStep('primera_conexion'), makeStep('establecer_proposito')], resumen: null, notas: null }],
        pasosValidadosTotal: [makeStep('primera_conexion'), makeStep('establecer_proposito')],
      })
      expect(suggestNextStep(roadmap)).toBe('crecimiento_proposito')
    })
  })

  describe('rule: after crecimiento_proposito', () => {
    it('returns servicio_inicial', () => {
      const roadmap = makeRoadmap({
        sesiones: [{ id: '1', estado: 'completed', scheduledAtIso: null, completedAtIso: null, pasosValidados: [makeStep('crecimiento_proposito')], resumen: null, notas: null }],
        pasosValidadosTotal: [makeStep('crecimiento_proposito')],
      })
      expect(suggestNextStep(roadmap)).toBe('servicio_inicial')
    })
  })

  describe('rule: after servicio_inicial', () => {
    it('returns formacion_lider', () => {
      const roadmap = makeRoadmap({
        sesiones: [{ id: '1', estado: 'completed', scheduledAtIso: null, completedAtIso: null, pasosValidados: [makeStep('servicio_inicial')], resumen: null, notas: null }],
        pasosValidadosTotal: [makeStep('servicio_inicial')],
      })
      expect(suggestNextStep(roadmap)).toBe('formacion_lider')
    })
  })

  describe('rule: all core steps done', () => {
    it('returns envio when all 5 core steps are done', () => {
      const roadmap = makeRoadmap({
        sesiones: [{
          id: '1', estado: 'completed', scheduledAtIso: null, completedAtIso: null,
          pasosValidados: [
            makeStep('primera_conexion'),
            makeStep('establecer_proposito'),
            makeStep('crecimiento_proposito'),
            makeStep('servicio_inicial'),
            makeStep('formacion_lider'),
          ],
          resumen: null, notas: null,
        }],
        pasosValidadosTotal: [
          makeStep('primera_conexion'),
          makeStep('establecer_proposito'),
          makeStep('crecimiento_proposito'),
          makeStep('servicio_inicial'),
          makeStep('formacion_lider'),
        ],
      })
      expect(suggestNextStep(roadmap)).toBe('envio')
    })
  })
})
