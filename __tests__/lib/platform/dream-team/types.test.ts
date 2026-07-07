import { DREAM_TEAM_ESTADOS, DREAM_TEAM_MOTIVOS, personaId } from '@/lib/platform/dream-team/types'
import type { PersonaId } from '@/lib/platform/dream-team/types'

describe('Dream Team types', () => {
  it('brands personaId and preserves the input value', () => {
    expect(personaId('persona-ana')).toBe('persona-ana')
    const same: PersonaId = personaId('persona-ana')
    expect(same).toBe('persona-ana')
  })

  it('exposes exactly the six DreamTeamEstado values', () => {
    expect(DREAM_TEAM_ESTADOS).toEqual(['postulado', 'en_orientacion', 'activo', 'en_pausa', 'inactivo', 'retirado'])
  })

  it('exposes exactly the ten DreamTeamMotivo values', () => {
    expect(DREAM_TEAM_MOTIVOS).toEqual([
      'admin_asignacion', 'admin_promocion', 'admin_pausa', 'admin_reactivacion', 'admin_retiro',
      'reasignacion', 'requisito_vencido', 'gdv_liderazgo_removed', 'auto_pausa', 'otro',
    ])
  })
})
