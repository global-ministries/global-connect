import {
  proximoDomingoDeServicio,
  semanaDeAncla,
  sirveEnDomingo,
  textoFrecuencia,
  validarFrecuencia,
} from '@/lib/platform/dream-team/frecuencia-turno'

// 2026-10-04 and every date below ending in a Sunday are Sundays.
const QUINCENAL = { frecuencia: 'quincenal', fechaAncla: '2026-10-04' } as const
const SEMANAL = { frecuencia: 'semanal', fechaAncla: null } as const

describe('sirveEnDomingo', () => {
  it('a weekly volunteer serves every Sunday', () => {
    expect(sirveEnDomingo(SEMANAL, '2026-10-11')).toBe(true)
    expect(sirveEnDomingo(SEMANAL, '2026-10-18')).toBe(true)
  })

  it('a biweekly volunteer serves on the anchor and every other Sunday', () => {
    expect(sirveEnDomingo(QUINCENAL, '2026-10-04')).toBe(true)
    expect(sirveEnDomingo(QUINCENAL, '2026-10-11')).toBe(false)
    expect(sirveEnDomingo(QUINCENAL, '2026-10-18')).toBe(true)
    expect(sirveEnDomingo(QUINCENAL, '2027-01-03')).toBe(false) // 13 weeks
  })

  it('counts whole weeks before the anchor too', () => {
    expect(sirveEnDomingo(QUINCENAL, '2026-09-27')).toBe(false)
    expect(sirveEnDomingo(QUINCENAL, '2026-09-20')).toBe(true)
  })

  it('crosses a daylight-saving or year boundary without drifting', () => {
    expect(sirveEnDomingo(QUINCENAL, '2026-12-27')).toBe(true) // 12 weeks
    expect(sirveEnDomingo(QUINCENAL, '2027-03-21')).toBe(true) // 24 weeks
  })
})

describe('proximoDomingoDeServicio', () => {
  it('weekly: the coming Sunday, or today when today is Sunday', () => {
    expect(proximoDomingoDeServicio(SEMANAL, '2026-10-08')).toBe('2026-10-11')
    expect(proximoDomingoDeServicio(SEMANAL, '2026-10-11')).toBe('2026-10-11')
  })

  it('biweekly: skips the Sunday off', () => {
    expect(proximoDomingoDeServicio(QUINCENAL, '2026-10-08')).toBe('2026-10-18')
    expect(proximoDomingoDeServicio(QUINCENAL, '2026-10-18')).toBe('2026-10-18')
    expect(proximoDomingoDeServicio(QUINCENAL, '2026-10-12')).toBe('2026-10-18')
  })
})

describe('semanaDeAncla', () => {
  it('names the anchor week A or B by the weeks since 2026-01-04', () => {
    expect(semanaDeAncla('2026-01-04')).toBe('A')
    expect(semanaDeAncla('2026-01-11')).toBe('B')
    expect(semanaDeAncla('2026-10-04')).toBe('B') // 39 weeks
  })
})

describe('textoFrecuencia', () => {
  it('weekly reads "Semanal"', () => {
    expect(textoFrecuencia(SEMANAL, '2026-10-08')).toBe('Semanal')
  })

  it('biweekly names the week and the next Sunday it serves', () => {
    expect(textoFrecuencia(QUINCENAL, '2026-10-08')).toBe('Quincenal (semana B) · próximo 18 oct')
  })
})

describe('validarFrecuencia', () => {
  it('defaults to weekly with no anchor', () => {
    expect(validarFrecuencia(undefined)).toEqual({ ok: true, valor: SEMANAL })
    expect(validarFrecuencia({ frecuencia: 'semanal', fechaAncla: '2026-10-04' })).toEqual({ ok: true, valor: SEMANAL })
  })

  it('accepts biweekly with a Sunday anchor', () => {
    expect(validarFrecuencia({ frecuencia: 'quincenal', fechaAncla: '2026-10-04' })).toEqual({ ok: true, valor: QUINCENAL })
  })

  it('rejects biweekly without a Sunday anchor, and unknown frequencies', () => {
    expect(validarFrecuencia({ frecuencia: 'quincenal' }).ok).toBe(false)
    expect(validarFrecuencia({ frecuencia: 'quincenal', fechaAncla: '2026-10-05' }).ok).toBe(false)
    expect(validarFrecuencia({ frecuencia: 'quincenal', fechaAncla: '2026-02-30' }).ok).toBe(false)
    expect(validarFrecuencia({ frecuencia: 'mensual' }).ok).toBe(false)
  })
})
