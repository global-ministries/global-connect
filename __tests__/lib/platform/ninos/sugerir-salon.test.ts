import { edadEnMeses, sugerirSalon, type SalonSugerible } from '@/lib/platform/ninos/sugerir-salon'

function salon(overrides: Partial<SalonSugerible> & Pick<SalonSugerible, 'id' | 'area'>): SalonSugerible {
  return {
    edadMinMeses: null,
    edadMaxMeses: null,
    gradoMin: null,
    gradoMax: null,
    esNecesidadesEspeciales: false,
    activo: true,
    orden: 0,
    ...overrides,
  }
}

const SALONES: SalonSugerible[] = [
  salon({ id: 'maternal', area: 'waumba', edadMinMeses: 0, edadMaxMeses: 23, orden: 10 }),
  salon({ id: 'pre1', area: 'waumba', edadMinMeses: 24, edadMaxMeses: 35, orden: 20 }),
  salon({ id: 'pre2', area: 'waumba', edadMinMeses: 36, edadMaxMeses: 47, orden: 30 }),
  salon({ id: 'pre3', area: 'waumba', edadMinMeses: 48, edadMaxMeses: 59, orden: 40 }),
  salon({ id: 'plus', area: 'waumba', esNecesidadesEspeciales: true, orden: 50 }),
  salon({ id: 'g1', area: 'upstreet', gradoMin: 1, gradoMax: 1, orden: 110 }),
  salon({ id: 'g4', area: 'upstreet', gradoMin: 4, gradoMax: 4, orden: 140 }),
  salon({ id: 'pread', area: 'upstreet', gradoMin: 5, gradoMax: 6, orden: 150 }),
]

const SERVICIO = '2026-10-11'

function sugerir(input: { fechaNacimiento?: string | null; grado?: number | null; necesidadesEspeciales?: boolean; salones?: SalonSugerible[] }) {
  return sugerirSalon({
    fechaNacimiento: input.fechaNacimiento ?? null,
    grado: input.grado ?? null,
    necesidadesEspeciales: input.necesidadesEspeciales ?? false,
    fechaServicio: SERVICIO,
    salones: input.salones ?? SALONES,
  })?.id ?? null
}

describe('edadEnMeses', () => {
  it('counts completed months up to the service date', () => {
    expect(edadEnMeses('2024-10-11', SERVICIO)).toBe(24)
    expect(edadEnMeses('2024-10-12', SERVICIO)).toBe(23)
    expect(edadEnMeses('2026-10-11', SERVICIO)).toBe(0)
  })

  it('returns null for a missing, invalid or future birth date', () => {
    expect(edadEnMeses(null, SERVICIO)).toBeNull()
    expect(edadEnMeses('not-a-date', SERVICIO)).toBeNull()
    expect(edadEnMeses('2027-01-01', SERVICIO)).toBeNull()
  })
})

describe('sugerirSalon', () => {
  it('uses the age for a Waumba child without a grade', () => {
    expect(sugerir({ fechaNacimiento: '2026-01-01' })).toBe('maternal')
    expect(sugerir({ fechaNacimiento: '2024-10-11' })).toBe('pre1')
    expect(sugerir({ fechaNacimiento: '2023-06-01' })).toBe('pre2')
    expect(sugerir({ fechaNacimiento: '2022-01-01' })).toBe('pre3')
  })

  it('uses the grade when present', () => {
    expect(sugerir({ grado: 1, fechaNacimiento: '2020-01-01' })).toBe('g1')
    expect(sugerir({ grado: 6 })).toBe('pread')
  })

  it('falls back to the age when no room matches the grade', () => {
    expect(sugerir({ grado: 0, fechaNacimiento: '2022-01-01' })).toBe('pre3')
  })

  it('sends a special-needs child in Waumba age range to Waumba Land Plus', () => {
    expect(sugerir({ fechaNacimiento: '2024-10-11', necesidadesEspeciales: true })).toBe('plus')
  })

  it('does not send an older special-needs child to Waumba Land Plus', () => {
    expect(sugerir({ fechaNacimiento: '2018-01-01', grado: 4, necesidadesEspeciales: true })).toBe('g4')
  })

  it('ignores inactive rooms', () => {
    const salones = SALONES.map((s) => (s.id === 'pre1' ? { ...s, activo: false } : s))
    expect(sugerir({ fechaNacimiento: '2024-10-11', salones })).toBeNull()
  })

  it('returns null without data to decide', () => {
    expect(sugerir({})).toBeNull()
    expect(sugerir({ fechaNacimiento: '2010-01-01' })).toBeNull()
  })

  it('prefers the lowest orden when two rooms match', () => {
    const salones = [...SALONES, salon({ id: 'pre1b', area: 'waumba', edadMinMeses: 24, edadMaxMeses: 35, orden: 5 })]
    expect(sugerir({ fechaNacimiento: '2024-10-11', salones })).toBe('pre1b')
  })
})
