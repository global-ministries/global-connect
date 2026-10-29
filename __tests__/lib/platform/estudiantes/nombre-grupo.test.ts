/**
 * The suggested group name of "Crear grupo" (artboard 08, assumption A15 of
 * design/estudiantes-asistencia/README.md): "<año> · <Chicas|Chicos>" for
 * Transit / Inside Out, "<zona> · <Chicas|Chicos>" for The Living Room, and
 * "… B", "… C" when the name is taken in the sub-área.
 */
import {
  baseNombreGrupo,
  pistaNombre,
  sexoDeSubarea,
  sugerirNombreGrupo,
  validarNombreGrupo,
} from '@/lib/platform/estudiantes/nombre-grupo'

describe('sexoDeSubarea', () => {
  it('takes Chicas / Chicos from the sub-área label', () => {
    expect(sexoDeSubarea('Grupos de Chicas')).toBe('Chicas')
    expect(sexoDeSubarea('grupos de chicos')).toBe('Chicos')
    expect(sexoDeSubarea('Varones')).toBe('Varones')
  })
})

describe('baseNombreGrupo', () => {
  it('uses the año in Transit / Inside Out and the zona in The Living Room', () => {
    expect(baseNombreGrupo({ experiencia: 'estudiantes', anioEtiqueta: '2do año', zona: '', subarea: 'Grupos de Chicas' })).toBe(
      '2do año · Chicas',
    )
    expect(baseNombreGrupo({ experiencia: 'the_living_room', anioEtiqueta: null, zona: ' Zona Este ', subarea: 'Grupos de Chicos' })).toBe(
      'Zona Este · Chicos',
    )
  })

  it('suggests nothing without año or zona', () => {
    expect(baseNombreGrupo({ experiencia: 'estudiantes', anioEtiqueta: null, zona: '', subarea: 'Grupos de Chicas' })).toBeNull()
    expect(baseNombreGrupo({ experiencia: 'the_living_room', anioEtiqueta: null, zona: '  ', subarea: 'Grupos de Chicas' })).toBeNull()
  })
})

describe('sugerirNombreGrupo', () => {
  it('keeps the base when it is free', () => {
    expect(sugerirNombreGrupo('2do año · Chicas', ['1er año · Chicas'])).toBe('2do año · Chicas')
  })

  it('adds B, C… when the name exists (case and spaces ignored, like the database)', () => {
    expect(sugerirNombreGrupo('1er año · Chicos', ['1ER AÑO · CHICOS '])).toBe('1er año · Chicos B')
    expect(sugerirNombreGrupo('1er año · Chicos', ['1er año · Chicos', '1er año · Chicos B'])).toBe('1er año · Chicos C')
  })

  it('returns null without a base', () => {
    expect(sugerirNombreGrupo(null, [])).toBeNull()
  })
})

describe('pistaNombre', () => {
  it('explains the suggestion', () => {
    expect(pistaNombre({ experiencia: 'estudiantes', base: '2do año · Chicas', sugerido: '2do año · Chicas', editado: false })).toBe(
      'Sugerido por el año y la sub-área. Puedes cambiarlo.',
    )
    expect(pistaNombre({ experiencia: 'the_living_room', base: 'Zona Este · Chicas', sugerido: 'Zona Este · Chicas', editado: false })).toBe(
      'Sugerido por la zona y la sub-área. Puedes cambiarlo.',
    )
    expect(pistaNombre({ experiencia: 'estudiantes', base: '1er año · Chicos', sugerido: '1er año · Chicos B', editado: false })).toBe(
      'Ya existe «1er año · Chicos», por eso sugerimos «1er año · Chicos B».',
    )
  })

  it('says when the name is the user’s own or when nothing can be suggested', () => {
    expect(pistaNombre({ experiencia: 'estudiantes', base: '2do año · Chicas', sugerido: '2do año · Chicas', editado: true })).toBe(
      'Nombre propio. Bórralo para volver a la sugerencia.',
    )
    expect(pistaNombre({ experiencia: 'the_living_room', base: null, sugerido: null, editado: false })).toBe(
      'Escribe la zona y te sugerimos un nombre.',
    )
  })
})

describe('validarNombreGrupo', () => {
  it('requires a name of up to 80 characters that is not taken', () => {
    expect(validarNombreGrupo('  ', [])).toBe('Escribe un nombre para el grupo.')
    expect(validarNombreGrupo('x'.repeat(81), [])).toBe('El nombre admite hasta 80 caracteres.')
    expect(validarNombreGrupo('2do Año · Chicas', ['2do año · chicas'])).toBe(
      'Ya hay un grupo llamado «2do año · chicas» en esta sub-área. Elige otro nombre.',
    )
    expect(validarNombreGrupo(' 2do año · Chicas B ', ['2do año · Chicas'])).toBeNull()
  })
})
