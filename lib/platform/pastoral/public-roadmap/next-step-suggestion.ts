/**
 * W13 — DT-083 — Declarative next-step suggestion rules (D26).
 *
 * Closed rule set — no dynamic catalog lookup.
 * Future evolution: table `pastoral_step_catalog` (documented as debt).
 */

import type { PublicRoadmap, NextStepRule } from './types'

// ─── Rule: first connection ────────────────────────────────────────────────────

/**
 * If no sessions exist, suggest 'primera_conexion'.
 */
const ruleNoSessions: NextStepRule = (roadmap) => {
  if (roadmap.sesiones.length === 0) return 'primera_conexion'
  return null
}

// ─── Rule: no steps validated yet ────────────────────────────────────────────

/**
 * If sessions exist but no steps validated, suggest 'establecer_proposito'.
 */
const ruleNoStepsYet: NextStepRule = (roadmap) => {
  if (roadmap.pasosValidadosTotal.length === 0) return 'establecer_proposito'
  return null
}

// ─── Rule: last step was first connection ─────────────────────────────────────

/**
 * If last validated step was 'primera_conexion', suggest 'establecer_proposito'.
 */
const ruleAfterPrimeraConexion: NextStepRule = (roadmap) => {
  const last = roadmap.pasosValidadosTotal[roadmap.pasosValidadosTotal.length - 1]
  if (!last) return null
  if (last.stepKey === 'primera_conexion') return 'establecer_proposito'
  return null
}

// ─── Rule: last step was establecer_proposito ────────────────────────────────

/**
 * If last step was 'establecer_proposito', suggest 'crecimiento_proposito'.
 */
const ruleAfterEstablecerProposito: NextStepRule = (roadmap) => {
  const last = roadmap.pasosValidadosTotal[roadmap.pasosValidadosTotal.length - 1]
  if (!last) return null
  if (last.stepKey === 'establecer_proposito') return 'crecimiento_proposito'
  return null
}

// ─── Rule: last step was crecimiento_proposito ───────────────────────────────

/**
 * If last step was 'crecimiento_proposito', suggest 'servicio_inicial'.
 */
const ruleAfterCrecimiento: NextStepRule = (roadmap) => {
  const last = roadmap.pasosValidadosTotal[roadmap.pasosValidadosTotal.length - 1]
  if (!last) return null
  if (last.stepKey === 'crecimiento_proposito') return 'servicio_inicial'
  return null
}

// ─── Rule: last step was servicio_inicial ────────────────────────────────────

/**
 * If last step was 'servicio_inicial', suggest 'formacion_lider'.
 */
const ruleAfterServicio: NextStepRule = (roadmap) => {
  const last = roadmap.pasosValidadosTotal[roadmap.pasosValidadosTotal.length - 1]
  if (!last) return null
  if (last.stepKey === 'servicio_inicial') return 'formacion_lider'
  return null
}

// ─── Rule: all steps done ─────────────────────────────────────────────────────

/**
 * If all core steps are done, suggest 'envio'.
 */
const ruleAllCoreStepsDone: NextStepRule = (roadmap) => {
  const coreKeys = new Set(['primera_conexion', 'establecer_proposito', 'crecimiento_proposito', 'servicio_inicial', 'formacion_lider'])
  const validatedKeys = new Set(roadmap.pasosValidadosTotal.map((s) => s.stepKey))
  const allCoreDone = [...coreKeys].every((k) => validatedKeys.has(k))
  if (allCoreDone) return 'envio'
  return null
}

// ─── Ordered rule list ───────────────────────────────────────────────────────

/**
 * Rules evaluated in order. First non-null result wins.
 */
const NEXT_STEP_RULES: readonly NextStepRule[] = [
  ruleNoSessions,
  ruleNoStepsYet,
  ruleAfterPrimeraConexion,
  ruleAfterEstablecerProposito,
  ruleAfterCrecimiento,
  ruleAfterServicio,
  ruleAllCoreStepsDone,
]

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Evaluates all rules in order and returns the first non-null suggestion.
 * Returns null if no rule applies (should not happen with closed rules).
 */
export function suggestNextStep(roadmap: PublicRoadmap): string | null {
  for (const rule of NEXT_STEP_RULES) {
    const result = rule(roadmap)
    if (result !== null) return result
  }
  return null
}
