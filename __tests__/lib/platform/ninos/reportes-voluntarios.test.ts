import {
  conFaltasSeguidas,
  csvServiciosVoluntarios,
  csvVoluntarios,
  leerReporteVoluntarios,
  porcentajeAsistencia,
  resumenPorEquipo,
  resumenPorServicio,
  totalVoluntarios,
  urlPestanaReportes,
  type FilaServicioVoluntarios,
  type FilaVoluntarioReporte,
} from '@/lib/platform/ninos/reportes-voluntarios'

function servicio(parcial: Partial<FilaServicioVoluntarios>): FilaServicioVoluntarios {
  return {
    fecha: '2026-10-04',
    turno_id: 't9',
    turno: 'Domingo 9:00',
    turno_orden: 1,
    area_id: 'aw',
    area: 'Waumba Land',
    equipo_id: 'em',
    equipo: 'Maternal',
    esperados: 0,
    presentes: 0,
    avisos: 0,
    faltas: 0,
    sin_marcar: 0,
    extras: 0,
    ...parcial,
  }
}

function voluntario(parcial: Partial<FilaVoluntarioReporte>): FilaVoluntarioReporte {
  return {
    servicio_id: 's1',
    nombre: 'Ana Prueba',
    area: 'Waumba Land',
    equipo: 'Maternal',
    rol: 'Voluntario',
    esperados: 0,
    presentes: 0,
    avisos: 0,
    faltas: 0,
    sin_marcar: 0,
    extras: 0,
    faltas_seguidas: 0,
    ...parcial,
  }
}

const filas = [
  servicio({ fecha: '2026-10-04', turno_id: 't11', turno: 'Domingo 11:00', turno_orden: 2, esperados: 2, presentes: 2 }),
  servicio({ fecha: '2026-10-04', esperados: 3, presentes: 2, faltas: 1, extras: 1 }),
  servicio({ fecha: '2026-10-04', equipo_id: 'ep', equipo: 'Producción', esperados: 2, avisos: 1, sin_marcar: 1 }),
  servicio({ fecha: '2026-09-27', esperados: 3, presentes: 3 }),
  servicio({ fecha: '2026-09-27', area_id: 'au', area: 'UpStreet', equipo_id: 'el', equipo: 'Líderes', esperados: 1, faltas: 1 }),
]

describe('leerReporteVoluntarios', () => {
  it('reads both lists and tolerates missing or malformed data', () => {
    expect(leerReporteVoluntarios(null)).toEqual({ servicios: [], voluntarios: [] })
    const r = leerReporteVoluntarios({
      servicios: [{ fecha: '2026-10-04', turno: 'Domingo 9:00', esperados: '3', faltas: 1 }, null, 'x'],
      voluntarios: [{ nombre: 'Ana', faltas_seguidas: 2 }],
    })
    expect(r.servicios).toHaveLength(1)
    expect(r.servicios[0]).toMatchObject({ fecha: '2026-10-04', esperados: 3, faltas: 1, presentes: 0, equipo: '' })
    expect(r.voluntarios[0]).toMatchObject({ nombre: 'Ana', faltas_seguidas: 2, esperados: 0 })
  })
})

describe('totals', () => {
  it('adds every row up', () => {
    expect(totalVoluntarios(filas)).toEqual({ esperados: 11, presentes: 7, avisos: 1, faltas: 2, sinMarcar: 1, extras: 1 })
  })

  it('counts the attendance share without extras, null when nobody was expected', () => {
    expect(porcentajeAsistencia(totalVoluntarios(filas))).toBe(55)
    expect(porcentajeAsistencia(totalVoluntarios([]))).toBeNull()
  })
})

describe('resumenPorServicio', () => {
  it('adds the equipos of each fecha and turno, oldest first and by service order', () => {
    expect(resumenPorServicio(filas).map((r) => `${r.fecha} ${r.turno} ${r.esperados}/${r.presentes}/${r.faltas}`)).toEqual([
      '2026-09-27 Domingo 9:00 4/3/1',
      '2026-10-04 Domingo 9:00 5/2/1',
      '2026-10-04 Domingo 11:00 2/2/0',
    ])
  })
})

describe('resumenPorEquipo', () => {
  it('adds the whole range per equipo, by area and equipo name', () => {
    expect(resumenPorEquipo(filas).map((r) => `${r.area}/${r.equipo} ${r.esperados}`)).toEqual([
      'UpStreet/Líderes 1',
      'Waumba Land/Maternal 8',
      'Waumba Land/Producción 2',
    ])
  })
})

describe('conFaltasSeguidas', () => {
  it('keeps the volunteers with two or more misses in a row', () => {
    const lista = [voluntario({ nombre: 'A', faltas_seguidas: 3 }), voluntario({ nombre: 'B', faltas_seguidas: 1 }), voluntario({ nombre: 'C', faltas_seguidas: 2 })]
    expect(conFaltasSeguidas(lista).map((v) => v.nombre)).toEqual(['A', 'C'])
  })
})

describe('CSV', () => {
  it('exports one line per service and equipo with a header', () => {
    const lineas = csvServiciosVoluntarios([filas[1]]).split('\r\n')
    expect(lineas[0]).toBe('Fecha,Servicio,Área,Equipo,Esperados,Presentes,Avisó,Faltó,Sin marcar,Extras')
    expect(lineas[1]).toBe('2026-10-04,Domingo 9:00,Waumba Land,Maternal,3,2,0,1,0,1')
  })

  it('exports volunteers, quoting commas and neutralizing formulas', () => {
    const lineas = csvVoluntarios([voluntario({ nombre: '=HYPERLINK("x")', equipo: 'A, B', faltas: 2, faltas_seguidas: 2 })]).split('\r\n')
    expect(lineas[0]).toBe('Voluntario,Área,Equipo,Rol,Esperado,Presente,Avisó,Faltó,Sin marcar,Extras,Faltas seguidas')
    expect(lineas[1]).toBe('"\'=HYPERLINK(""x"")",Waumba Land,"A, B",Voluntario,0,0,0,2,0,0,2')
  })
})

describe('urlPestanaReportes', () => {
  const filtros = { desde: '2026-08-16', hasta: '2026-10-04', campusId: 'c1', turnoId: '' }

  it('keeps the shared filters and marks the volunteers tab', () => {
    expect(urlPestanaReportes('voluntarios', filtros)).toBe('/ninos/reportes?desde=2026-08-16&hasta=2026-10-04&campus=c1&reporte=voluntarios')
    expect(urlPestanaReportes('ninos', filtros)).toBe('/ninos/reportes?desde=2026-08-16&hasta=2026-10-04&campus=c1')
  })

  it('has no query without filters', () => {
    expect(urlPestanaReportes('ninos', {})).toBe('/ninos/reportes')
  })
})
