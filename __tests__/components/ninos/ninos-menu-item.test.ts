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

describe('getNinosNavItems eventos entry', () => {
  it('shows Eventos to configurers, right before Salones', () => {
    expect(ids({ ...base, puedeOperar: true, puedeVerSalon: true, puedeConfigurar: true })).toEqual([
      'ninos-checkin',
      'ninos-familias',
      'ninos-eventos',
      'ninos-salones',
      'ninos-salon',
      'ninos-cartel',
      'ninos-reportes',
    ])
    const eventos = getNinosNavItems({ ...base, puedeConfigurar: true }).find((item) => item.id === 'ninos-eventos')
    expect(eventos).toMatchObject({ label: 'Eventos', href: '/ninos/eventos' })
  })

  it('hides Eventos from operators, room viewers and volunteer markers', () => {
    expect(ids({ ...base, puedeOperar: true, puedeVerSalon: true, puedeMarcarVoluntarios: true })).not.toContain('ninos-eventos')
  })
})

describe('getNinosNavItems salones entry (T1d)', () => {
  it('shows Salones de check-in to configurers, right after Eventos, apart from the roster', () => {
    const items = getNinosNavItems({ ...base, puedeConfigurar: true })
    expect(items.find((item) => item.id === 'ninos-salones')).toMatchObject({ label: 'Salones de check-in', href: '/ninos/salones' })
    expect(ids({ ...base, puedeConfigurar: true })).toEqual(['ninos-eventos', 'ninos-salones', 'ninos-reportes'])
  })

  it('hides Salones de check-in from operators, room viewers and volunteer markers', () => {
    expect(ids({ ...base, puedeOperar: true, puedeVerSalon: true, puedeMarcarVoluntarios: true })).not.toContain('ninos-salones')
  })
})
