import {
  edadEnMeses,
  edadParaSalon,
  explicarSalon,
  fechaReferencia,
  salonesQueCorresponden,
  sugerirSalon,
  type SalonSugerible,
} from '@/lib/platform/ninos/sugerir-salon'

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

// ── Salón rules (odd/tasks/ninos-checkin-pco.md, T1d, S5, S8.3, S8.4) ──

describe('sugerirSalon with the default rules', () => {
  // The values every salón reads before anyone edits its rules (column defaults of
  // 20261108100000_ninos_eventos.sql): open, no visitor quota, no fecha de corte.
  const conDefectos = SALONES.map((s) => ({ ...s, abierto: true, capacidad: 20, cupoVisitantes: 0, corteMes: null, corteDia: null, promocionMes: null, promocionDia: null }))

  it('suggests exactly what it suggested before the rules existed', () => {
    const casos = [
      { fechaNacimiento: '2026-01-01' },
      { fechaNacimiento: '2024-10-11' },
      { fechaNacimiento: '2023-06-01' },
      { fechaNacimiento: '2022-01-01' },
      { grado: 1, fechaNacimiento: '2020-01-01' },
      { grado: 6 },
      { grado: 0, fechaNacimiento: '2022-01-01' },
      { fechaNacimiento: '2024-10-11', necesidadesEspeciales: true },
      { fechaNacimiento: '2018-01-01', grado: 4, necesidadesEspeciales: true },
      {},
      { fechaNacimiento: '2010-01-01' },
    ]
    for (const caso of casos) {
      expect(sugerir({ ...caso, salones: conDefectos })).toBe(sugerir(caso))
    }
  })
})

describe('fechaReferencia (fecha de corte and promoción)', () => {
  const s = (o: Partial<SalonSugerible>) => salon({ id: 'x', area: 'waumba', ...o })

  it('is the service date without a rule', () => {
    expect(fechaReferencia(s({}), '2026-11-08')).toBe('2026-11-08')
  })

  it('is the corte date of the cycle that started on the last promoción', () => {
    const r = s({ corteMes: 12, corteDia: 1, promocionMes: 8, promocionDia: 1 })
    expect(fechaReferencia(r, '2026-11-08')).toBe('2026-12-01')
    expect(fechaReferencia(r, '2027-01-10')).toBe('2026-12-01')
    expect(fechaReferencia(r, '2027-08-01')).toBe('2027-12-01')
    expect(fechaReferencia(r, '2027-07-31')).toBe('2026-12-01')
  })

  it('is the last corte without a promoción, and the last promoción without a corte', () => {
    expect(fechaReferencia(s({ corteMes: 12, corteDia: 1 }), '2026-11-08')).toBe('2025-12-01')
    expect(fechaReferencia(s({ corteMes: 12, corteDia: 1 }), '2026-12-01')).toBe('2026-12-01')
    expect(fechaReferencia(s({ promocionMes: 8, promocionDia: 1 }), '2026-11-08')).toBe('2026-08-01')
  })

  it('reads 29 Feb as 28 Feb in a common year', () => {
    expect(fechaReferencia(s({ corteMes: 2, corteDia: 29 }), '2027-03-01')).toBe('2027-02-28')
    expect(fechaReferencia(s({ corteMes: 2, corteDia: 29 }), '2028-03-01')).toBe('2028-02-29')
  })
})

describe('sugerirSalon rules', () => {
  const corte = { corteMes: 12, corteDia: 1, promocionMes: 8, promocionDia: 1 }
  const preescolar = (o: Partial<SalonSugerible> = {}) => [
    salon({ id: 'pre2', area: 'waumba', edadMinMeses: 36, edadMaxMeses: 47, orden: 30, ...o }),
    salon({ id: 'pre3', area: 'waumba', edadMinMeses: 48, edadMaxMeses: 71, orden: 40, ...o }),
  ]
  const explicar = (input: Partial<Parameters<typeof explicarSalon>[0]>) =>
    explicarSalon({ fechaNacimiento: null, grado: null, necesidadesEspeciales: false, fechaServicio: SERVICIO, salones: SALONES, ...input })

  it('never suggests a closed salón and says so when it was the one', () => {
    const salones = SALONES.map((s) => (s.id === 'pre1' ? { ...s, abierto: false } : s))
    const r = explicar({ fechaNacimiento: '2024-10-11', salones })
    expect(r).toMatchObject({ salon: null, estado: 'cerrado', criterio: 'edad' })
    expect(r.candidatos.map((s) => s.id)).toEqual(['pre1'])
  })

  it('goes to the other open salón of the same age', () => {
    const salones = [...SALONES.map((s) => (s.id === 'pre1' ? { ...s, abierto: false } : s)), salon({ id: 'pre1b', area: 'waumba', edadMinMeses: 24, edadMaxMeses: 35, orden: 25 })]
    expect(sugerir({ fechaNacimiento: '2024-10-11', salones })).toBe('pre1b')
  })

  it('places by the age on the fecha de corte: a birthday before the corte moves up for the whole cycle', () => {
    // Born 20 nov 2022: 47 months on 8 nov 2026, 48 on 1 dic 2026.
    expect(sugerir({ fechaNacimiento: '2022-11-20', salones: preescolar() })).toBe('pre2')
    expect(sugerirSalon({ fechaNacimiento: '2022-11-20', grado: null, necesidadesEspeciales: false, fechaServicio: '2026-11-08', salones: preescolar(corte) })?.id).toBe('pre3')
  })

  it('keeps a child whose birthday is after the corte in the younger salón until the next promoción', () => {
    // Born 15 dic 2022: 48 months on 10 ene 2027, but 47 on 1 dic 2026.
    const fecha = (fechaServicio: string, o: Partial<SalonSugerible>) =>
      sugerirSalon({ fechaNacimiento: '2022-12-15', grado: null, necesidadesEspeciales: false, fechaServicio, salones: preescolar(o) })?.id
    expect(fecha('2027-01-10', {})).toBe('pre3')
    expect(fecha('2027-01-10', corte)).toBe('pre2')
    expect(fecha('2027-08-01', corte)).toBe('pre3')
  })

  it('counts a baby born after the last corte as 0 months', () => {
    const salones = [salon({ id: 'maternal', area: 'waumba', edadMinMeses: 0, edadMaxMeses: 23, corteMes: 12, corteDia: 1 })]
    expect(sugerirSalon({ fechaNacimiento: '2026-01-10', grado: null, necesidadesEspeciales: false, fechaServicio: '2026-11-08', salones })?.id).toBe('maternal')
  })

  it('fills the regulars quota, then the next salón that fits', () => {
    const salones = [
      salon({ id: 'a', area: 'waumba', edadMinMeses: 24, edadMaxMeses: 35, orden: 10, capacidad: 2, cupoVisitantes: 1 }),
      salon({ id: 'b', area: 'waumba', edadMinMeses: 24, edadMaxMeses: 35, orden: 20, capacidad: 2, cupoVisitantes: 0 }),
    ]
    const base = { fechaNacimiento: '2024-10-11', salones }
    expect(explicar({ ...base, ocupados: { a: 1 } }).salon?.id).toBe('a')
    expect(explicar({ ...base, ocupados: { a: 2 } }).salon?.id).toBe('b')
    expect(explicar({ ...base, ocupados: { a: 2, b: 2 } })).toMatchObject({ salon: null, estado: 'lleno' })
  })

  it('keeps the visitor places for visitors (S8.3): a visitor still fits when the regulars are full', () => {
    const salones = [salon({ id: 'a', area: 'waumba', edadMinMeses: 24, edadMaxMeses: 35, capacidad: 2, cupoVisitantes: 1 })]
    const base = { fechaNacimiento: '2024-10-11', salones, ocupados: { a: 2 } }
    expect(explicar({ ...base, visitante: false })).toMatchObject({ salon: null, estado: 'lleno' })
    expect(explicar({ ...base, visitante: true }).salon?.id).toBe('a')
    expect(explicar({ ...base, visitante: true, ocupados: { a: 3 } })).toMatchObject({ salon: null, estado: 'lleno' })
  })

  it('ignores the capacity when nobody says how many are inside', () => {
    const salones = [salon({ id: 'a', area: 'waumba', edadMinMeses: 24, edadMaxMeses: 35, capacidad: 1 })]
    expect(explicar({ fechaNacimiento: '2024-10-11', salones }).salon?.id).toBe('a')
  })

  // S9.5 (L34): placement is by age and grade, never balanced across salones; the
  // carpeta "distribución" is gone and the salones that fit fill in order.
  it('always fills in order: the lowest orden with room among the salones that fit', () => {
    const salones = [
      salon({ id: 'a', area: 'upstreet', gradoMin: 1, gradoMax: 1, orden: 10, capacidad: 20 }),
      salon({ id: 'b', area: 'upstreet', gradoMin: 1, gradoMax: 1, orden: 20, capacidad: 20 }),
      salon({ id: 'c', area: 'upstreet', gradoMin: 1, gradoMax: 1, orden: 30, capacidad: 20 }),
    ]
    const base = { grado: 1, salones, ocupados: { a: 9, b: 4, c: 4 } }
    const r = explicar(base)
    expect(r).toMatchObject({ estado: 'asignado', criterio: 'grado' })
    expect(r.salon?.id).toBe('a')
    expect(r).not.toHaveProperty('distribucion')
    // An old caller that still sends a distribution is not balanced.
    expect(explicar({ ...base, distribucion: { upstreet: 'equilibrada' } } as typeof base).salon?.id).toBe('a')
  })

  it('lists the open salones with room for the child', () => {
    const salones = [
      salon({ id: 'a', area: 'upstreet', gradoMin: 1, gradoMax: 1, orden: 10, capacidad: 2 }),
      salon({ id: 'b', area: 'upstreet', gradoMin: 1, gradoMax: 1, orden: 20, abierto: false }),
      salon({ id: 'c', area: 'upstreet', gradoMin: 1, gradoMax: 1, orden: 30, capacidad: 2 }),
    ]
    const r = explicar({ grado: 1, salones, ocupados: { a: 2 } })
    expect(r.candidatos.map((s) => s.id)).toEqual(['a', 'b', 'c'])
    expect(r.disponibles.map((s) => s.id)).toEqual(['c'])
    expect(r.salon?.id).toBe('c')
  })

  it('says nothing fits when no salón takes the child', () => {
    expect(explicar({ fechaNacimiento: '2010-01-01' })).toMatchObject({ salon: null, estado: 'ninguno', criterio: null, candidatos: [] })
  })
})

describe('edadParaSalon', () => {
  it('is the age on the reference date of the salón', () => {
    const s = salon({ id: 'x', area: 'waumba', corteMes: 12, corteDia: 1, promocionMes: 8, promocionDia: 1 })
    expect(edadParaSalon('2022-11-20', '2026-11-08', s)).toBe(48)
    expect(edadParaSalon('2022-11-20', '2026-11-08', salon({ id: 'y', area: 'waumba' }))).toBe(47)
    expect(edadParaSalon(null, '2026-11-08', s)).toBeNull()
    expect(edadParaSalon('2027-01-01', '2026-11-08', s)).toBeNull()
  })
})

describe('salonesQueCorresponden (S9.5: a child only goes to a salón that admits them)', () => {
  const corresponden = (input: { fechaNacimiento?: string | null; grado?: number | null; necesidadesEspeciales?: boolean; salones?: SalonSugerible[] }) =>
    salonesQueCorresponden({
      fechaNacimiento: input.fechaNacimiento ?? null,
      grado: input.grado ?? null,
      necesidadesEspeciales: input.necesidadesEspeciales ?? false,
      fechaServicio: SERVICIO,
      salones: input.salones ?? SALONES,
    })
  const ids = (r: { salones: readonly SalonSugerible[] }) => r.salones.map((s) => s.id)

  it('by age: only the Waumba salones of that age, never maternal for an older child or the reverse', () => {
    expect(corresponden({ fechaNacimiento: '2025-06-01' })).toMatchObject({ motivo: 'reglas' })
    expect(ids(corresponden({ fechaNacimiento: '2025-06-01' }))).toEqual(['maternal'])
    expect(ids(corresponden({ fechaNacimiento: '2022-06-01' }))).toEqual(['pre3'])
  })

  it('by grade, and special needs go to the assignment salón, by the same steps as the suggestion', () => {
    expect(ids(corresponden({ fechaNacimiento: '2019-06-01', grado: 1 }))).toEqual(['g1'])
    expect(ids(corresponden({ fechaNacimiento: '2024-06-01', necesidadesEspeciales: true }))).toEqual(['plus'])
  })

  it('keeps closed and full salones that fit (the desk marks them) and drops inactive ones', () => {
    const salones = [
      salon({ id: 'm1', area: 'waumba', edadMinMeses: 0, edadMaxMeses: 23, orden: 20, abierto: false }),
      salon({ id: 'm2', area: 'waumba', edadMinMeses: 0, edadMaxMeses: 23, orden: 10, capacidad: 1 }),
      salon({ id: 'm3', area: 'waumba', edadMinMeses: 0, edadMaxMeses: 23, orden: 30, activo: false }),
      salon({ id: 'p', area: 'waumba', edadMinMeses: 24, edadMaxMeses: 35, orden: 40 }),
    ]
    expect(ids(corresponden({ fechaNacimiento: '2025-06-01', salones }))).toEqual(['m2', 'm1'])
  })

  it('without birth date and grade the child cannot be checked: every active salón, by orden', () => {
    const salones = [...SALONES, salon({ id: 'viejo', area: 'waumba', edadMinMeses: 0, edadMaxMeses: 23, orden: 5, activo: false })]
    const r = corresponden({ fechaNacimiento: null, grado: null, salones })
    expect(r.motivo).toBe('sin_datos')
    expect(ids(r)).toEqual(SALONES.map((s) => s.id))
    // A birth date after the service is no age either.
    expect(corresponden({ fechaNacimiento: '2027-01-01' }).motivo).toBe('sin_datos')
  })

  it('with age or grade but no salón that admits the child: every active salón, so the desk is never stuck', () => {
    const r = corresponden({ fechaNacimiento: '2015-01-01' })
    expect(r.motivo).toBe('ninguno')
    expect(ids(r)).toEqual(SALONES.map((s) => s.id))
  })
})
