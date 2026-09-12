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
  ROL_RESPONSABLE_GDV_LABELS,
  rolResponsableGdvLabel,
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

describe('ROL_RESPONSABLE_GDV_LABELS / rolResponsableGdvLabel', () => {
  it('labels the four Grupos de Vida structure responsable roles', () => {
    expect(ROL_RESPONSABLE_GDV_LABELS.director_general).toBe('Director general')
    expect(ROL_RESPONSABLE_GDV_LABELS.director_etapa).toBe('Director de etapa')
    expect(ROL_RESPONSABLE_GDV_LABELS.lider).toBe('Líder')
    expect(ROL_RESPONSABLE_GDV_LABELS.colider).toBe('Colíder')
  })

  it('resolves each known key through rolResponsableGdvLabel', () => {
    for (const [key, label] of Object.entries(ROL_RESPONSABLE_GDV_LABELS)) {
      expect(rolResponsableGdvLabel(key)).toBe(label)
    }
  })

  it('falls back to rolLabel-style capitalization for an unrecognized key, never the raw key', () => {
    expect(rolResponsableGdvLabel('mentor')).toBe('Mentor')
  })
})

describe('ORIGEN_GRUPOS_VIDA_LABEL', () => {
  it('is the Spanish badge copy for a servidor sourced from Grupos de Vida', () => {
    expect(ORIGEN_GRUPOS_VIDA_LABEL).toBe('Grupos de Vida')
  })
})
