import {
  columnasTurno,
  csvSalones,
  familiasPorEstado,
  fechaCorta,
  formatoPromedio,
  leerReporte,
  ninosDeArea,
  ninosDeTurno,
  nombreMes,
  rangoPorDefecto,
  rangosRapidos,
  unirNombres,
  type DiaReporte,
  type FilaSalonReporte,
  type NinoNuevo,
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
  checkins: 10,
  pico: 8,
  ...p,
})

const nuevo = (p: Partial<NinoNuevo>): NinoNuevo => ({
  nino_id: 'n',
  nombre: 'Niño',
  fecha: '2026-10-04',
  salon: 'Maternal',
  visita_id: 'v',
  padres: [],
  estado: 'no_volvio',
  estado_familia: 'no_volvio',
  visitas: 1,
  ultima_fecha: '2026-10-04',
  ...p,
})

// One child in both services of the Sunday, in UpStreet: 1 child, 2 check-ins.
const dia: DiaReporte = {
  fecha: '2026-10-04',
  ninos: 1,
  checkins: 2,
  turnos: [
    { turno_id: 't11', turno: '11:00', turno_orden: 2, ninos: 1, checkins: 1 },
    { turno_id: 't9', turno: '9:00', turno_orden: 1, ninos: 1, checkins: 1 },
  ],
  areas: [{ area: 'upstreet', ninos: 1, checkins: 2 }],
}

describe('rangoPorDefecto', () => {
  it('covers the last 8 Sundays ending on the last Sunday up to today', () => {
    expect(rangoPorDefecto('2026-10-09')).toEqual({ desde: '2026-08-16', hasta: '2026-10-04' })
  })
  it('ends today when today is a Sunday', () => {
    expect(rangoPorDefecto('2026-10-11')).toEqual({ desde: '2026-08-23', hasta: '2026-10-11' })
  })
})

describe('rangosRapidos', () => {
  it('builds the four quick ranges from today', () => {
    expect(rangosRapidos('2026-10-10')).toEqual([
      { clave: 'domingos', etiqueta: 'Últimos 8 domingos', desde: '2026-08-16', hasta: '2026-10-04' },
      { clave: 'este-mes', etiqueta: 'Este mes', desde: '2026-10-01', hasta: '2026-10-10' },
      { clave: 'mes-anterior', etiqueta: 'Mes anterior', desde: '2026-09-01', hasta: '2026-09-30' },
      { clave: 'seis-meses', etiqueta: 'Últimos 6 meses', desde: '2026-05-01', hasta: '2026-10-10' },
    ])
  })
  it('crosses the year in January and knows leap Februaries', () => {
    const enero = rangosRapidos('2027-01-15')
    expect(enero.find((r) => r.clave === 'mes-anterior')).toMatchObject({ desde: '2026-12-01', hasta: '2026-12-31' })
    expect(enero.find((r) => r.clave === 'seis-meses')).toMatchObject({ desde: '2026-08-01', hasta: '2027-01-15' })
    expect(rangosRapidos('2028-03-05').find((r) => r.clave === 'mes-anterior')).toMatchObject({
      desde: '2028-02-01',
      hasta: '2028-02-29',
    })
  })
})

describe('leerReporte', () => {
  it('fills missing lists and totals with empty values', () => {
    const r = leerReporte({ domingo_referencia: '2026-10-04' })
    expect(r.salones).toEqual([])
    expect(r.nuevos).toEqual([])
    expect(r.ausentes).toEqual([])
    expect(r.dias).toEqual([])
    expect(r.meses).toEqual([])
    expect(r.totales).toEqual({
      ninos: 0,
      checkins: 0,
      dias: 0,
      promedio: null,
      nuevos: 0,
      familias_nuevas: 0,
      turnos: [],
      areas: [],
    })
  })
  it('returns an empty report for null', () => {
    expect(leerReporte(null).salones).toEqual([])
    expect(leerReporte(null).totales.ninos).toBe(0)
  })
  it('gives every day, month and the totals their service and area lists', () => {
    const r = leerReporte({
      dias: [{ fecha: '2026-10-04', ninos: 3, checkins: 4 }],
      meses: [{ mes: '2026-10-01', ninos: 3, turnos: null }],
      totales: { ninos: 3, areas: 'x' },
    })
    expect(r.dias[0]).toMatchObject({ ninos: 3, turnos: [], areas: [] })
    expect(r.meses[0]).toMatchObject({ ninos: 3, turnos: [], areas: [] })
    expect(r.totales).toMatchObject({ ninos: 3, checkins: 0, turnos: [], areas: [] })
  })
  it('keeps a known return state and reads an unknown one as a recent first visit', () => {
    const r = leerReporte({
      nuevos: [
        { nino_id: 'a', estado: 'volvio', estado_familia: 'volvio' },
        { nino_id: 'b', estado: 'otro' },
      ],
    })
    expect(r.nuevos.map((n) => [n.estado, n.estado_familia])).toEqual([
      ['volvio', 'volvio'],
      ['pendiente', 'pendiente'],
    ])
  })
})

describe('ninosDeTurno and ninosDeArea', () => {
  it('read the distinct children computed by the server, never the check-ins', () => {
    expect(ninosDeTurno(dia, 't9')).toBe(1)
    expect(ninosDeTurno(dia, 't11')).toBe(1)
    expect(ninosDeArea(dia, 'upstreet')).toBe(1)
  })
  it('are 0 for a service or area nobody came to', () => {
    expect(ninosDeTurno(dia, 'otro')).toBe(0)
    expect(ninosDeArea(dia, 'waumba')).toBe(0)
  })
})

describe('columnasTurno', () => {
  it('lists every service seen in any period once, in service order', () => {
    const otro = { ...dia, turnos: [{ turno_id: 't9', turno: '9:00', turno_orden: 1, ninos: 5, checkins: 5 }] }
    expect(columnasTurno([otro, dia])).toEqual([
      { turno_id: 't9', turno: '9:00' },
      { turno_id: 't11', turno: '11:00' },
    ])
  })
})

describe('formats', () => {
  it('fechaCorta writes DD/MM/YYYY', () => {
    expect(fechaCorta('2026-10-04')).toBe('04/10/2026')
  })
  it('nombreMes names the month in Spanish', () => {
    expect(nombreMes('2026-01-01')).toBe('Enero 2026')
    expect(nombreMes('2026-10-01')).toBe('Octubre 2026')
  })
  it('formatoPromedio keeps one decimal with a comma and a dash without service days', () => {
    expect(formatoPromedio(2.7)).toBe('2,7')
    expect(formatoPromedio(3)).toBe('3')
    expect(formatoPromedio(null)).toBe('—')
  })
  it('unirNombres joins names the Spanish way', () => {
    expect(unirNombres(['Ana'])).toBe('Ana')
    expect(unirNombres(['Ana', 'Beto'])).toBe('Ana y Beto')
    expect(unirNombres(['Ana', 'Beto', 'Caro'])).toBe('Ana, Beto y Caro')
  })
})

describe('familiasPorEstado', () => {
  it('groups one family per first visit by the family state, siblings together', () => {
    const grupos = familiasPorEstado([
      nuevo({ nino_id: 'a', nombre: 'Ana', visita_id: 'v1', estado: 'volvio', estado_familia: 'volvio', padres: ['Pedro'] }),
      nuevo({ nino_id: 'b', nombre: 'Beto', visita_id: 'v1', estado_familia: 'volvio', padres: ['Pedro', 'María'] }),
      nuevo({ nino_id: 'c', nombre: 'Caro', visita_id: 'v2' }),
      nuevo({ nino_id: 'd', nombre: 'Dani', visita_id: 'v3', fecha: '2026-10-11', estado: 'pendiente', estado_familia: 'pendiente' }),
    ])
    expect(grupos.volvio.map((f) => f.ninos.map((n) => n.nombre))).toEqual([['Ana', 'Beto']])
    expect(grupos.volvio[0]).toMatchObject({ visita_id: 'v1', fecha: '2026-10-04', padres: ['Pedro', 'María'] })
    expect(grupos.no_volvio.map((f) => f.visita_id)).toEqual(['v2'])
    expect(grupos.pendiente.map((f) => f.visita_id)).toEqual(['v3'])
  })
  it('returns empty groups without new children', () => {
    expect(familiasPorEstado([])).toEqual({ volvio: [], no_volvio: [], pendiente: [] })
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
