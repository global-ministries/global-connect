import { getNinosNavItems } from '@/components/ninos/ninos-menu-item'

const base = { puedeOperar: false, puedeVerSalon: false, puedeConfigurar: false, puedeMarcarVoluntarios: false }

const ids = (acceso: typeof base) => getNinosNavItems(acceso).map((item) => item.id)

describe('getNinosNavItems reportes entry', () => {
  it('shows Reportes to configurers', () => {
    expect(ids({ ...base, puedeConfigurar: true })).toContain('ninos-reportes')
  })

  it('shows Reportes to volunteer markers (sub-area coordinators)', () => {
    expect(ids({ ...base, puedeMarcarVoluntarios: true })).toContain('ninos-reportes')
  })

  it('hides Reportes from operators without either permission', () => {
    expect(ids({ ...base, puedeOperar: true })).not.toContain('ninos-reportes')
  })
})
