import { buildGrantsForServicio } from '@/lib/platform/dream-team/grants'
import { NIVELES_ROL } from '@/lib/platform/dream-team/nivel-rol'

const EXPS = ['dps', 'global_music', 'estudiantes', 'talleres_crecimiento', 'ninos', 'the_living_room', 'experiencia']

const k = (label: string, nivel?: (typeof NIVELES_ROL)[number]['nivel'], e = 'dps') =>
  buildGrantsForServicio({ id: 'eq', experiencia: e }, { id: 'r', label, ...(nivel ? { nivel } : {}) }).map(
    (g) => g.capabilityKey,
  )

describe('grants by nivel — regression', () => {
  it('nivel overrides the label upward (S6.1)', () => {
    expect(k('Voluntario', 'director')).toEqual(['dream_team.serve', 'dream_team.direct', 'dps.team.director'])
  })

  it('Líder de grupo keeps gdv.lead on top of any nivel (S6.3)', () => {
    expect(k('Líder de grupo', 'director', 'estudiantes')).toEqual([
      'dream_team.serve',
      'dream_team.direct',
      'dream_team.gdv.lead',
      'estudiantes.team.lead',
    ])
  })

  it('no nivel mints the global director.coordinate or gdv.lead (S6.1, S6.3)', () => {
    for (const { nivel } of NIVELES_ROL) {
      for (const e of EXPS) {
        expect(k('Grupo líder', nivel, e)).not.toContain('dream_team.gdv.lead')
        expect(k('x', nivel, e)).not.toContain('dream_team.director.coordinate')
      }
    }
  })

  // T1 of odd/tasks/dps-plan.md (S10): musicians serve on the Global Music node itself. A
  // voluntario or lider there gets the serve or lead tier on that equipo, never director reach.
  it('global_music mirrors the dps tiers, scoped to the equipo (S10)', () => {
    expect(k('Voluntario', 'voluntario', 'global_music')).toEqual(['dream_team.serve', 'global_music.team.serve'])
    expect(k('Líder', 'lider', 'global_music')).toEqual(['dream_team.serve', 'dream_team.lead', 'global_music.team.lead'])
    expect(k('Coordinador', 'coordinador', 'global_music')).toEqual([
      'dream_team.serve',
      'dream_team.coordinate',
      'global_music.team.lead',
    ])
    expect(k('Director', 'director', 'global_music')).toEqual([
      'dream_team.serve',
      'dream_team.direct',
      'global_music.team.director',
    ])
    const grants = buildGrantsForServicio({ id: 'global-music', experiencia: 'global_music' }, { id: 'r', label: 'Voluntario', nivel: 'voluntario' })
    expect(grants.map((g) => `${g.experience}:${g.scopeType}:${g.scopeId}`)).toEqual([
      'dream_team:equipo:global-music',
      'global_music:equipo:global-music',
    ])
  })

  it('legacy label variants without nivel resolve by label (S6.5)', () => {
    expect(k(' LÍDER ')).toEqual(['dream_team.serve', 'dream_team.lead', 'dps.team.lead'])
    expect(k('Voluntario de Cámara')).toEqual(['dream_team.serve', 'dps.team.serve'])
  })
})
