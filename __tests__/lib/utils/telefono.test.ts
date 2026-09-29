import {
  enlaceWhatsapp,
  esTelefonoReconocible,
  formatearTelefono,
  normalizarTelefono,
} from '@/lib/utils/telefono'

// Table of cases: THE SAME as supabase/tests/usuarios-telefono-normalizado.test.sql.
// Keep both lists in sync.
const PARES: ReadonlyArray<readonly [string | null, string | null]> = [
  ['04245512712', '04245512712'],
  ['0424-5616920', '04245616920'],
  ['+584120574200', '04120574200'],
  ['+58 412-5138681', '04125138681'],
  ['+5804126724853', '04126724853'],
  ['4121536111', '04121536111'],
  ['0424-548-9514', '04245489514'],
  ['04125041122 ', '04125041122'],
  [' 0424-5396867', '04245396867'],
  ['00584145663781', '04145663781'],
  ['02515551234', '02515551234'],
  ['+582515551234', '02515551234'],
  ['\u202A04140569935\u202C', '04140569935'],
  // untouched: returned exactly as given
  ['+17867312193', '+17867312193'],
  ['+00000000000', '+00000000000'],
  ['123', '123'],
  ['+58', '+58'],
  ['0424831126', '0424831126'],
  ['042455922826', '042455922826'],
  ['', ''],
  [null, null],
]

describe('normalizarTelefono', () => {
  it.each(PARES)('%j -> %j', (entrada, esperado) => {
    expect(normalizarTelefono(entrada)).toBe(esperado)
  })

  it.each(PARES)('is idempotent for %j', (entrada) => {
    const una = normalizarTelefono(entrada)
    expect(normalizarTelefono(una)).toBe(una)
  })

  it('leaves text with letters untouched', () => {
    expect(normalizarTelefono('0424 abc 5616920')).toBe('0424 abc 5616920')
  })

  it('covers the acceptance examples', () => {
    expect(normalizarTelefono('+58 424-5825358')).toBe('04245825358')
    expect(normalizarTelefono('+5804145020896')).toBe('04145020896')
  })
})

describe('esTelefonoReconocible', () => {
  it('accepts canonical and normalizable numbers', () => {
    expect(esTelefonoReconocible('04245512712')).toBe(true)
    expect(esTelefonoReconocible('+58 412-5138681')).toBe(true)
    expect(esTelefonoReconocible('02515551234')).toBe(true)
  })
  it('rejects foreign, incomplete, zero filler, empty and null', () => {
    for (const v of ['+17867312193', '123', '+00000000000', '0424831126', '', null, undefined]) {
      expect(esTelefonoReconocible(v)).toBe(false)
    }
  })
})

describe('formatearTelefono', () => {
  it('formats as 0412 545 7346', () => {
    expect(formatearTelefono('04125457346')).toBe('0412 545 7346')
    expect(formatearTelefono('+58 412-5457346')).toBe('0412 545 7346')
  })
  it('returns unrecognized values as given and empty as empty string', () => {
    expect(formatearTelefono('+17867312193')).toBe('+17867312193')
    expect(formatearTelefono('0424831126')).toBe('0424831126')
    expect(formatearTelefono(null)).toBe('')
    expect(formatearTelefono('')).toBe('')
  })
})

describe('enlaceWhatsapp', () => {
  it('links valid Venezuelan mobiles only', () => {
    expect(enlaceWhatsapp('04125457346')).toBe('https://wa.me/584125457346')
    expect(enlaceWhatsapp('+58 412-5457346')).toBe('https://wa.me/584125457346')
  })
  it('returns null for landlines, foreign, unrecognized and empty', () => {
    expect(enlaceWhatsapp('02515551234')).toBeNull()
    expect(enlaceWhatsapp('+17867312193')).toBeNull()
    expect(enlaceWhatsapp('123')).toBeNull()
    expect(enlaceWhatsapp('')).toBeNull()
    expect(enlaceWhatsapp(null)).toBeNull()
  })
})
