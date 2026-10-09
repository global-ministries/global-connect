import {
  csvSalones,
  familiasNuevas,
  leerReporte,
  rangoPorDefecto,
  resumenPorDia,
  type FilaSalonReporte,
} from '@/lib/platform/ninos/reportes'

const fila = (p: Partial<FilaSalonReporte>): FilaSalonReporte => ({
  fecha: '2026-10-04',
  turno_id: 't1',
  turno: '9:00',
  turno_orden: 1,
  salon_id: 's1',
  salon: 'Maternal',
  salon_orden: 1,
  area: 'waumba',
  capacidad: 20,
  ninos: 10,
  pico: 8,
  ...p,
})

describe('rangoPorDefecto', () => {
  it('covers the last 8 Sundays ending on the last Sunday up to today', () => {
    expect(rangoPorDefecto('2026-10-09')).toEqual({ desde: '2026-08-16', hasta: '2026-10-04' })
  })
  it('ends today when today is a Sunday', () => {
    expect(rangoPorDefecto('2026-10-11')).toEqual({ desde: '2026-08-23', hasta: '2026-10-11' })
  })
})

describe('leerReporte', () => {
  it('fills missing lists with empty arrays', () => {
    const r = leerReporte({ domingo_referencia: '2026-10-04' })
    expect(r.salones).toEqual([])
    expect(r.nuevos).toEqual([])
    expect(r.ausentes).toEqual([])
    expect(r.dias).toEqual([])
  })
  it('returns an empty report for null', () => {
    expect(leerReporte(null).salones).toEqual([])
  })
})

describe('resumenPorDia', () => {
  it('sums per turno and per area and keeps the distinct total from the server', () => {
    const filas = [
      fila({}),
      fila({ salon_id: 's2', salon: '1º grado', area: 'upstreet', ninos: 5 }),
      fila({ turno_id: 't2', turno: '11:00', turno_orden: 2, ninos: 7 }),
      fila({ fecha: '2026-10-11', ninos: 3 }),
    ]
    const dias = [
      { fecha: '2026-10-04', ninos: 20, checkins: 22 },
      { fecha: '2026-10-11', ninos: 3, checkins: 3 },
    ]
    expect(resumenPorDia(filas, dias)).toEqual([
      {
        fecha: '2026-10-04',
        total: 20,
        turnos: [
          { turno: '9:00', ninos: 15 },
          { turno: '11:00', ninos: 7 },
        ],
        waumba: 17,
        upstreet: 5,
      },
      { fecha: '2026-10-11', total: 3, turnos: [{ turno: '9:00', ninos: 3 }], waumba: 3, upstreet: 0 },
    ])
  })
})

describe('familiasNuevas', () => {
  it('counts one family per first visit', () => {
    const n = (visita_id: string) => ({ nino_id: visita_id + 'n', nombre: 'x', fecha: '2026-10-04', salon: 'y', visita_id, padres: [] })
    expect(familiasNuevas([n('a'), n('a'), n('b')])).toBe(2)
  })
})

describe('csvSalones', () => {
  it('writes a header, one row per room and escapes quotes and separators', () => {
    const csv = csvSalones([fila({ salon: 'Sala "A", norte', ninos: 21, pico: 21 })])
    expect(csv.split('\r\n')).toEqual([
      'Fecha,Servicio,Área,Salón,Niños,Pico,Capacidad,Uso del pico (%)',
      '2026-10-04,9:00,Waumba Land,"Sala ""A"", norte",21,21,20,105',
    ])
  })
  it('neutralizes spreadsheet formulas', () => {
    expect(csvSalones([fila({ salon: '=HYPERLINK(1)' })])).toContain(`"'=HYPERLINK(1)"`)
  })
})
