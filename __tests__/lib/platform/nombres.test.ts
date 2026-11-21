/**
 * `nombreCorto` — the short name the Dream Team org chart shows (S1 of
 * odd/tasks/dream-team-estructura-correcciones.md): first word of the nombre
 * plus the first surname, «de / del / de la» particles included.
 * `nombreCortoDeCompleto` is the fallback for names that only arrive joined
 * (the Grupos de Vida branch).
 */
import { nombreCorto, nombreCortoDeCompleto } from '@/lib/platform/nombres'

describe('nombreCorto', () => {
  it('takes the first name and the first surname of two names and two surnames', () => {
    expect(nombreCorto('Isaac José', 'Paez Cordero')).toBe('Isaac Paez')
  })

  it('keeps a single name and a single surname as they are', () => {
    expect(nombreCorto('Kelly', 'Chaviel')).toBe('Kelly Chaviel')
  })

  it('keeps the particles of a compound first surname', () => {
    expect(nombreCorto('Ana María', 'De la Cruz Pérez')).toBe('Ana De la Cruz')
    expect(nombreCorto('Luis', 'del Valle Rojas')).toBe('Luis del Valle')
    expect(nombreCorto('Rosa', 'de los Santos')).toBe('Rosa de los Santos')
  })

  it('ignores extra spaces', () => {
    expect(nombreCorto('  Isaac   José ', '  Paez    Cordero  ')).toBe('Isaac Paez')
  })

  it('shows only the first name when the apellido is empty or missing', () => {
    expect(nombreCorto('Isaac José', '')).toBe('Isaac')
    expect(nombreCorto('Isaac José', null)).toBe('Isaac')
    expect(nombreCorto('Isaac', undefined)).toBe('Isaac')
  })

  it('shows only the first surname when the nombre is empty', () => {
    expect(nombreCorto('', 'Paez Cordero')).toBe('Paez')
    expect(nombreCorto(null, 'Paez Cordero')).toBe('Paez')
  })

  it('returns an empty text when both parts are empty', () => {
    expect(nombreCorto('', '  ')).toBe('')
    expect(nombreCorto(null, null)).toBe('')
  })

  it('keeps a couple whole, as before', () => {
    expect(nombreCorto('Carlos y Ana', 'Pérez')).toBe('Carlos y Ana Pérez')
    expect(nombreCorto('Carlos y Ana', '')).toBe('Carlos y Ana')
  })
})

describe('nombreCortoDeCompleto', () => {
  it('takes the first name and the third word of a four-word name', () => {
    expect(nombreCortoDeCompleto('Isaac José Paez Cordero')).toBe('Isaac Paez')
  })

  it('keeps one or two words as they are', () => {
    expect(nombreCortoDeCompleto('Lidia Líder')).toBe('Lidia Líder')
    expect(nombreCortoDeCompleto('Kelly')).toBe('Kelly')
  })

  it('takes the first and the last word of a three-word name, as before', () => {
    expect(nombreCortoDeCompleto('Antholy Ludovic Gómez')).toBe('Antholy Gómez')
  })

  it('keeps a couple whole and ignores extra spaces', () => {
    expect(nombreCortoDeCompleto('Carlos  y Ana Pérez')).toBe('Carlos y Ana Pérez')
    expect(nombreCortoDeCompleto('  ')).toBe('')
  })
})
