/**
 * The new-season assistant's season rules (T8b of odd/tasks/planner-gdv.md;
 * S18, S19, S20; design/planner-gdv README A14): the cohort of a name ("-I"
 * starts in February, "-II" in October, each lasts about a year), the next
 * name and dates of a cohort, the season a new one closes (the latest of its
 * cohort that starts before it, as planner_temporada_origen) and the checks
 * planner_crear_temporada makes, with its words.
 */
import {
  anioTemporada,
  cohorteDe,
  mismoNombreTemporada,
  sugerirSiguienteTemporada,
  sugerirTemporada,
  temporadaQueCierra,
  validarNuevaTemporada,
} from '@/lib/platform/grupos-vida/planner/temporada-nueva'
import type { TemporadaPlanner } from '@/lib/platform/grupos-vida/planner'

const temporada = (nombre: string, fecha_inicio: string, fecha_fin: string | null, parcial: Partial<TemporadaPlanner> = {}): TemporadaPlanner => ({
  id: `t-${nombre}`,
  nombre,
  fecha_inicio,
  fecha_fin,
  estado: 'activa',
  activa: true,
  cohorte: cohorteDe(nombre),
  origen_id: null,
  origen_nombre: null,
  ...parcial,
})

/** Production on 4 nov 2026 (A12, A14). */
const T2025_I = temporada('2025-I', '2025-02-01', '2026-01-31', { estado: 'finalizada', activa: false })
const T2025_II = temporada('2025 - II', '2025-10-13', '2026-10-11', { estado: 'finalizada', activa: false })
const T2026_I = temporada('2026-I', '2026-02-16', '2027-02-05')
const T2026_II = temporada('2026-II', '2026-10-12', '2027-10-10', { estado: 'planificacion', activa: false })
const PRODUCCION = [T2026_II, T2026_I, T2025_II, T2025_I]
const HOY = '2026-11-07'

describe('cohorteDe and anioTemporada', () => {
  it.each([
    ['2026-I', 'I'],
    ['2026-II', 'II'],
    ['2025 - II', 'II'],
    ['2026 ii', 'II'],
    ['  2027-I ', 'I'],
    ['Temporada 2026', null],
    ['2026-III', null],
    ['2026-XI', null],
  ])('%s → %s', (nombre, cohorte) => {
    expect(cohorteDe(nombre)).toBe(cohorte)
  })

  it('reads the year of the name, spaced or not', () => {
    expect(anioTemporada('2025 - II')).toBe(2025)
    expect(anioTemporada('2027-I')).toBe(2027)
    expect(anioTemporada('Segunda')).toBeNull()
  })

  it('compares names without case, accents, spaces or signs, like planner_crear_temporada', () => {
    expect(mismoNombreTemporada('2026-II', '2026 - ii')).toBe(true)
    expect(mismoNombreTemporada('2026 II', '2026-II')).toBe(true)
    expect(mismoNombreTemporada('2026-I', '2026-II')).toBe(false)
  })
})

describe('sugerirTemporada (A14)', () => {
  it('after 2026-I (2026-02-16 → 2027-02-05) suggests 2027-I from the Monday after it ends, for 52 weeks', () => {
    expect(sugerirTemporada(PRODUCCION, 'I', HOY)).toEqual({
      nombre: '2027-I',
      cohorte: 'I',
      fecha_inicio: '2027-02-08',
      fecha_fin: '2028-02-06',
      anterior: T2026_I,
    })
  })

  it('follows the latest of the cohort even with spaced names ("2025 - II")', () => {
    expect(sugerirTemporada([T2026_I, T2025_II], 'II', HOY)).toMatchObject({
      nombre: '2026-II',
      fecha_inicio: '2026-10-12',
      fecha_fin: '2027-10-10',
      anterior: T2025_II,
    })
    expect(sugerirTemporada(PRODUCCION, 'II', HOY)).toMatchObject({ nombre: '2027-II', fecha_inicio: '2027-10-11', fecha_fin: '2028-10-08', anterior: T2026_II })
  })

  it('skips a year whose name already exists in any spelling', () => {
    const ya = temporada('2027 - I', '2026-01-05', '2026-01-20', { estado: 'cancelada', activa: false })
    expect(sugerirTemporada([T2026_I, ya], 'I', HOY).nombre).toBe('2028-I')
  })

  it('without an end date, starts a year after the last start', () => {
    const sinFin = temporada('2026-I', '2026-02-16', null)
    expect(sugerirTemporada([sinFin], 'I', HOY)).toMatchObject({ nombre: '2027-I', fecha_inicio: '2027-02-15' })
  })

  it('for a cohort without seasons, suggests its next first Monday of February or October', () => {
    expect(sugerirTemporada([T2025_II], 'I', HOY)).toEqual({
      nombre: '2027-I',
      cohorte: 'I',
      fecha_inicio: '2027-02-01',
      fecha_fin: '2028-01-30',
      anterior: null,
    })
    expect(sugerirTemporada([], 'II', '2026-03-01')).toMatchObject({ nombre: '2026-II', fecha_inicio: '2026-10-05' })
  })

  it('sugerirSiguienteTemporada picks the cohort whose next season starts first', () => {
    expect(sugerirSiguienteTemporada(PRODUCCION, HOY).nombre).toBe('2027-I')
    expect(sugerirSiguienteTemporada([T2026_I, T2025_II], HOY).nombre).toBe('2026-II')
  })
})

describe('temporadaQueCierra (S19)', () => {
  it('is the latest season of the same cohort that starts before the new one', () => {
    expect(temporadaQueCierra(PRODUCCION, '2027-I', '2027-02-08')).toBe(T2026_I)
    expect(temporadaQueCierra(PRODUCCION, '2026-II', '2026-10-12', T2026_II.id)).toBe(T2025_II)
  })

  it('never a season of the other cohort; none without a previous one or a cohort', () => {
    expect(temporadaQueCierra([T2026_II], '2027-I', '2027-02-08')).toBeNull()
    expect(temporadaQueCierra(PRODUCCION, 'Temporada nueva', '2027-02-08')).toBeNull()
    expect(temporadaQueCierra(PRODUCCION, '2027-I', '')).toBeNull()
  })
})

describe('validarNuevaTemporada', () => {
  const valida = { nombre: '2027-I', fecha_inicio: '2027-02-08', fecha_fin: '2028-02-06' }

  it('accepts the suggestion and returns the name with single spaces', () => {
    expect(validarNuevaTemporada(PRODUCCION, valida)).toEqual({ valores: valida })
    expect(validarNuevaTemporada(PRODUCCION, { ...valida, nombre: '  2027  -  I ' })).toEqual({ valores: { ...valida, nombre: '2027 - I' } })
  })

  it.each([
    [{ nombre: '  ' }, 'La temporada debe tener nombre.'],
    [{ nombre: '2027' }, 'El nombre debe terminar en la cohorte: I (empieza en febrero) o II (empieza en octubre), por ejemplo «2027 - I».'],
    [{ nombre: '2026 - i' }, 'Ya existe una temporada llamada «2026-I».'],
    [{ fecha_inicio: '' }, 'Indica la fecha de inicio y la de fin.'],
    [{ fecha_fin: '2027-02-08' }, 'La fecha de fin debe ser posterior a la de inicio.'],
    [{ fecha_inicio: '2026-02-16' }, 'La temporada debe empezar después del 2026-02-16, inicio de «2026-I», la última de la cohorte I.'],
  ])('refuses %o: %s', (cambio, error) => {
    expect(validarNuevaTemporada(PRODUCCION, { ...valida, ...cambio })).toEqual({ error })
  })

  it('refuses a name longer than 80 characters', () => {
    expect(validarNuevaTemporada(PRODUCCION, { ...valida, nombre: `${'x'.repeat(80)} I` })).toEqual({
      error: 'El nombre de la temporada puede tener hasta 80 caracteres.',
    })
  })
})
