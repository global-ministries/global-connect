import {
  esCedulaReconocible,
  formatearCedula,
  normalizarCedula,
} from '@/lib/utils/cedula'

const MARCA_INICIO = String.fromCharCode(0x202a)
const MARCA_FIN = String.fromCharCode(0x202c)

// Table of cases: THE SAME as supabase/tests/usuarios-cedula-normalizada.test.sql.
// Keep both lists in sync.
const PARES: ReadonlyArray<readonly [string | null, string | null]> = [
  ['22.328.215', '22328215'],
  ['V-18423291', '18423291'],
  ['v18423291', '18423291'],
  ['V9220603', '9220603'],
  [' 7.485477 ', '7485477'],
  ['23.488.709 ', '23488709'],
  ['E 81110494', 'E81110494'],
  ['E-23159262', 'E23159262'],
  ['e81110494', 'E81110494'],
  ['17640068', '17640068'],
  [`${MARCA_INICIO}22328215${MARCA_FIN}`, '22328215'],
  // untouched: returned exactly as given
  ['04245136686', '04245136686'],
  ['1710514955', '1710514955'],
  ['141292738', '141292738'],
  ['0000000000', '0000000000'],
  ['09876', '09876'],
  ['12345', '12345'],
  ['ABC123', 'ABC123'],
  ['', ''],
  [null, null],
]

describe('normalizarCedula', () => {
  it.each(PARES)('%j -> %j', (entrada, esperado) => {
    expect(normalizarCedula(entrada)).toBe(esperado)
  })

  it.each(PARES)('is idempotent for %j', (entrada) => {
    const una = normalizarCedula(entrada)
    expect(normalizarCedula(una)).toBe(una)
  })

  it('treats undefined like null', () => {
    expect(normalizarCedula(undefined)).toBeNull()
  })

  it('returns a blank value exactly as given', () => {
    expect(normalizarCedula('   ')).toBe('   ')
  })
})

describe('esCedulaReconocible', () => {
  it('accepts Venezuelan and foreign formats', () => {
    expect(esCedulaReconocible('22.328.215')).toBe(true)
    expect(esCedulaReconocible('V-18423291')).toBe(true)
    expect(esCedulaReconocible('E 81110494')).toBe(true)
  })
  it('rejects phones, filler, short values, text and empty', () => {
    expect(esCedulaReconocible('04245136686')).toBe(false)
    expect(esCedulaReconocible('0000000000')).toBe(false)
    expect(esCedulaReconocible('12345')).toBe(false)
    expect(esCedulaReconocible('ABC123')).toBe(false)
    expect(esCedulaReconocible('')).toBe(false)
    expect(esCedulaReconocible(null)).toBe(false)
  })
})

describe('formatearCedula', () => {
  it('shows Venezuelan cedulas with thousands dots', () => {
    expect(formatearCedula('22328215')).toBe('22.328.215')
    expect(formatearCedula('V-18423291')).toBe('18.423.291')
    expect(formatearCedula('9220603')).toBe('9.220.603')
    expect(formatearCedula('7485477')).toBe('7.485.477')
  })
  it('shows foreign cedulas as E-digits', () => {
    expect(formatearCedula('E81110494')).toBe('E-81110494')
    expect(formatearCedula('e 81110494')).toBe('E-81110494')
  })
  it('returns unrecognized values as given and empty as empty string', () => {
    expect(formatearCedula('04245136686')).toBe('04245136686')
    expect(formatearCedula('ABC123')).toBe('ABC123')
    expect(formatearCedula(null)).toBe('')
    expect(formatearCedula('')).toBe('')
  })
})
