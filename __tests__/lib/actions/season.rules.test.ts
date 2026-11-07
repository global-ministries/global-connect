/**
 * Season form rules (T9a of odd/tasks/planner-gdv.md; S19, S20): the admin
 * form cannot create or edit a season so that it takes another season's
 * place in its cohort (the origin that publishing closes).
 */
import { validarCreacionTemporada, validarEdicionTemporada, type TemporadaExistente } from '@/lib/actions/season.rules'
import { validarNuevaTemporada } from '@/lib/platform/grupos-vida/planner/temporada-nueva'
import type { TemporadaPlanner } from '@/lib/platform/grupos-vida/planner/tipos'

const TEMPORADAS: TemporadaExistente[] = [
  { id: 'v', nombre: 'Temporada 2024', fecha_inicio: '2024-01-01', fecha_fin: '2024-12-31' },
  { id: 'a0', nombre: 'Año 2023 - I', fecha_inicio: '2023-02-06', fecha_fin: '2024-02-04' },
  { id: 'a1', nombre: '2025 - I', fecha_inicio: '2025-02-10', fecha_fin: '2026-02-08' },
  { id: 'a2', nombre: '2025 - II', fecha_inicio: '2025-10-06', fecha_fin: '2026-10-04' },
  { id: 'a3', nombre: '2026-I', fecha_inicio: '2026-02-16', fecha_fin: '2027-02-05' },
  { id: 'a4', nombre: '2026-II', fecha_inicio: '2026-10-12T00:00:00+00:00', fecha_fin: '2027-10-10' },
  { id: 'a5', nombre: '2027-I', fecha_inicio: '2027-02-08', fecha_fin: '2028-02-06' },
]

const editar = (id: string, cambios: Partial<{ nombre: string; fecha_inicio: string; fecha_fin: string }>) => {
  const actual = TEMPORADAS.find((t) => t.id === id)!
  return validarEdicionTemporada(TEMPORADAS, id, {
    nombre: actual.nombre,
    fecha_inicio: (actual.fecha_inicio ?? '').slice(0, 10),
    fecha_fin: (actual.fecha_fin ?? '').slice(0, 10),
    ...cambios,
  })
}

describe('validarEdicionTemporada', () => {
  it('accepts the season unchanged and returns the name with single spaces', () => {
    expect(editar('a3', {})).toEqual({ ok: true, valores: { nombre: '2026-I', fecha_inicio: '2026-02-16', fecha_fin: '2027-02-05' } })
    expect(editar('a3', { nombre: '  2026   -  I ' })).toEqual({ ok: true, valores: { nombre: '2026 - I', fecha_inicio: '2026-02-16', fecha_fin: '2027-02-05' } })
  })

  it('refuses an empty name and a name without cohort', () => {
    expect(editar('a3', { nombre: '   ' })).toEqual({ ok: false, campo: 'nombre', error: 'La temporada debe tener nombre.' })
    expect(editar('a3', { nombre: 'Temporada 2026' })).toEqual({
      ok: false,
      campo: 'nombre',
      error: 'El nombre debe terminar en la cohorte: I (empieza en febrero) o II (empieza en octubre), por ejemplo «2027 - I».',
    })
  })

  it('refuses changing the cohort (I ↔ II)', () => {
    expect(editar('a3', { nombre: '2026-II' })).toEqual({
      ok: false,
      campo: 'nombre',
      error: '«2026-I» es de la cohorte I: el nombre debe seguir terminando en I.',
    })
  })

  it('refuses a name that matches another season without punctuation, spaces, case or accents', () => {
    expect(editar('a3', { nombre: '2025 i' })).toEqual({ ok: false, campo: 'nombre', error: 'Ya existe una temporada llamada «2025 - I».' })
    expect(editar('a5', { nombre: '2026—I' })).toEqual({ ok: false, campo: 'nombre', error: 'Ya existe una temporada llamada «2026-I».' })
    expect(editar('a1', { nombre: 'ano 2023 i' })).toEqual({ ok: false, campo: 'nombre', error: 'Ya existe una temporada llamada «Año 2023 - I».' })
  })

  it('refuses a start on or before the previous season of its cohort', () => {
    expect(editar('a3', { fecha_inicio: '2025-02-10' })).toEqual({
      ok: false,
      campo: 'fecha_inicio',
      error: 'La temporada debe empezar después del 2025-02-10, inicio de «2025 - I», la anterior de la cohorte I.',
    })
    expect(editar('a3', { fecha_inicio: '2025-02-11' })).toMatchObject({ ok: true })
  })

  it('refuses a start on or after the next season of its cohort', () => {
    expect(editar('a3', { fecha_inicio: '2027-02-08', fecha_fin: '2028-03-01' })).toEqual({
      ok: false,
      campo: 'fecha_inicio',
      error: 'La temporada debe empezar antes del 2027-02-08, inicio de «2027-I», la siguiente de la cohorte I.',
    })
    expect(editar('a3', { fecha_inicio: '2027-02-07', fecha_fin: '2028-03-01' })).toMatchObject({ ok: true })
  })

  it('lets the other cohort move freely and the last of a cohort move later', () => {
    expect(editar('a4', { fecha_inicio: '2026-01-05' })).toMatchObject({ ok: true })
    expect(editar('a4', { fecha_inicio: '2025-10-06' })).toMatchObject({ ok: false, campo: 'fecha_inicio' })
    expect(editar('a5', { fecha_inicio: '2027-03-01' })).toMatchObject({ ok: true })
  })

  it('checks the dates', () => {
    expect(editar('a3', { fecha_inicio: '' })).toEqual({ ok: false, campo: 'fecha_inicio', error: 'Indica la fecha de inicio y la de fin.' })
    expect(editar('a3', { fecha_fin: '2026-02-16' })).toEqual({ ok: false, campo: 'fecha_fin', error: 'La fecha de fin debe ser posterior a la de inicio.' })
  })

  it('keeps a legacy season without cohort editable, but never gives it a cohort', () => {
    expect(editar('v', { nombre: 'Temporada 2024 bis', fecha_inicio: '2023-06-01' })).toMatchObject({ ok: true })
    expect(editar('v', { nombre: '2024 - I' })).toEqual({
      ok: false,
      campo: 'nombre',
      error: '«Temporada 2024» no tiene cohorte y no se le puede agregar una: cambiaría qué temporada cierra el planificador al publicar.',
    })
  })

  it('refuses an unknown season', () => {
    expect(validarEdicionTemporada(TEMPORADAS, 'x', { nombre: '2030-I', fecha_inicio: '2030-02-04', fecha_fin: '2031-02-02' }))
      .toEqual({ ok: false, campo: 'nombre', error: 'La temporada no existe.' })
  })
})

describe('validarCreacionTemporada', () => {
  const comoPlanner = (t: TemporadaExistente): TemporadaPlanner => ({
    id: t.id, nombre: t.nombre, fecha_inicio: (t.fecha_inicio ?? '').slice(0, 10), fecha_fin: t.fecha_fin ?? null,
    estado: null, activa: false, cohorte: null, origen_id: null, origen_nombre: null,
  })

  it.each([
    [{ nombre: '2028-I', fecha_inicio: '2028-02-07', fecha_fin: '2029-02-04' }, null],
    [{ nombre: 'Temporada 2028', fecha_inicio: '2028-02-07', fecha_fin: '2029-02-04' }, 'nombre'],
    [{ nombre: '2026 ii', fecha_inicio: '2028-02-07', fecha_fin: '2029-02-04' }, 'nombre'],
    [{ nombre: '2026b-II', fecha_inicio: '2026-01-05', fecha_fin: '2026-12-01' }, 'fecha_inicio'],
    [{ nombre: '2028-I', fecha_inicio: '', fecha_fin: '2029-02-04' }, 'fecha_inicio'],
    [{ nombre: '2028-I', fecha_inicio: '2028-02-07', fecha_fin: '2028-02-07' }, 'fecha_fin'],
  ])('says what planner_crear_temporada says (%#)', (datos, campo) => {
    const esperado = validarNuevaTemporada(TEMPORADAS.map(comoPlanner), datos)
    const resultado = validarCreacionTemporada(TEMPORADAS, datos)
    if ('error' in esperado) {
      expect(resultado).toEqual({ ok: false, campo, error: esperado.error })
    } else {
      expect(resultado).toEqual({ ok: true, valores: esperado.valores })
    }
  })
})
