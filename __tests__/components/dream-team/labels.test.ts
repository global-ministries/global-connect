/**
 * `components/dream-team/labels.ts` — human-readable copy for raw keys.
 *
 * Covers:
 *   - experienciaLabel() resolves a PLATFORM_EXPERIENCE_CATALOG key to its
 *     Spanish label, and falls back to the raw key for an unknown one
 *   - rolLabel() resolves the four known Dream Team roles (stored lowercase,
 *     no accents) to their Spanish display label, and capitalizes the first
 *     letter of an unknown role label
 *   - ROL_BADGE_VARIANTE follows the Grupos de Vida hierarchy convention:
 *     the top role gets `warning`, the next gets `info`, the rest `default`
 *   - ROL_LIDER_GDV_LABELS labels the two Grupos de Vida leadership roles
 *     surfaced read-only in the servidores/mi-equipo screens
 *   - ORIGEN_GRUPOS_VIDA_LABEL is the badge copy marking those rows as
 *     coming from Grupos de Vida, not Dream Team
 */
import {
  experienciaLabel,
  rolLabel,
  ROL_LABELS,
  ROL_BADGE_VARIANTE,
  ROL_LIDER_GDV_LABELS,
  ORIGEN_GRUPOS_VIDA_LABEL,
} from '@/components/dream-team/labels'

describe('experienciaLabel', () => {
  it('resolves known experience catalog keys to their Spanish label', () => {
    expect(experienciaLabel('talleres_crecimiento')).toBe('Talleres de Crecimiento')
    expect(experienciaLabel('atraccion')).toBe('Atracción')
    expect(experienciaLabel('dream_team')).toBe('Dream Team')
  })

  it('falls back to the raw key for an unknown experience key', () => {
    expect(experienciaLabel('clave_desconocida')).toBe('clave_desconocida')
  })
})

describe('rolLabel', () => {
  it('resolves the four known Dream Team roles to their Spanish label', () => {
    expect(rolLabel('director')).toBe('Director')
    expect(rolLabel('coordinador')).toBe('Coordinador')
    expect(rolLabel('lider')).toBe('Líder')
    expect(rolLabel('voluntario')).toBe('Voluntario')
  })

  it('capitalizes only the first letter for an unknown role label', () => {
    expect(rolLabel('mentor')).toBe('Mentor')
  })

  it('never renders the raw lowercase key for a known role', () => {
    for (const key of Object.keys(ROL_LABELS)) {
      expect(rolLabel(key)).not.toBe(key)
    }
  })
})

describe('ROL_BADGE_VARIANTE', () => {
  it('follows the Grupos de Vida hierarchy convention (director > coordinador > lider/voluntario)', () => {
    expect(ROL_BADGE_VARIANTE.director).toBe('warning')
    expect(ROL_BADGE_VARIANTE.coordinador).toBe('info')
    expect(ROL_BADGE_VARIANTE.lider).toBe('default')
    expect(ROL_BADGE_VARIANTE.voluntario).toBe('default')
  })
})

describe('ROL_LIDER_GDV_LABELS', () => {
  it('labels the two Grupos de Vida leadership roles', () => {
    expect(ROL_LIDER_GDV_LABELS.lider).toBe('Líder de grupo')
    expect(ROL_LIDER_GDV_LABELS.colider).toBe('Colíder de grupo')
  })
})

describe('ORIGEN_GRUPOS_VIDA_LABEL', () => {
  it('is the Spanish badge copy for a servidor sourced from Grupos de Vida', () => {
    expect(ORIGEN_GRUPOS_VIDA_LABEL).toBe('Grupos de Vida')
  })
})
