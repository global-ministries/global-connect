/**
 * The view model of /estudiantes/grupos (C2a of odd/tasks/estudiantes-fase-b.md,
 * artboards 06 / 07): scope (ámbito → sub-área), attention metrics, search,
 * the año filter, sorting, the scope cards, the breadcrumbs and the URL.
 */
import {
  FILTROS_INICIALES,
  calcularVistaGrupos,
  escribirFiltrosEnUrl,
  horarioTexto,
  leerFiltrosDeUrl,
  parcheMetrica,
  textoVisita,
  type FiltrosGrupos,
} from '@/lib/platform/estudiantes/grupos-vista'
import {
  CAMPUS,
  CAMPUS_OTRO,
  CHICAS,
  CHICOS,
  GRUPOS_TRANSIT,
  INSIDE,
  SUBAREAS_TRANSIT,
  TLR,
  TLR_CHICAS,
  TRANSIT,
  grupo,
  subarea,
} from '@/lib/platform/estudiantes/__fixtures__/grupos'

const vista = (filtros: Partial<FiltrosGrupos> = {}, campusId: string | null = null) =>
  calcularVistaGrupos({
    grupos: GRUPOS_TRANSIT,
    subareas: SUBAREAS_TRANSIT,
    filtros: { ...FILTROS_INICIALES, ...filtros },
    campusId,
  })

const nombres = (v: ReturnType<typeof vista>) => v.visibles.map((g) => g.nombre)

describe('scope', () => {
  it('fixes the only ámbito and shows its sub-área cards', () => {
    const v = vista()
    expect(v.filtros.ambito).toBe(TRANSIT)
    expect(v.titulo).toBe('Grupos de Transit')
    expect(v.tarjetas.nivel).toBe('areas')
    expect(v.tarjetas.items.map((t) => t.label)).toEqual(['Grupos de Chicas', 'Grupos de Chicos'])
  })

  it('lists the active groups of the ámbito, deactivated ones hidden', () => {
    expect(nombres(vista())).toEqual([
      '1er año · Chicas',
      '1er año · Chicos',
      '2do año · Chicas',
      '2do año · Chicos',
      '3er año · Chicas',
    ])
  })

  it('narrows to a sub-área and hides the cards there', () => {
    const v = vista({ area: CHICOS })
    expect(v.titulo).toBe('Grupos de Chicos')
    expect(v.resumenPrefijo).toBe('Transit')
    expect(v.tarjetas.items).toEqual([])
    expect(nombres(v)).toEqual(['1er año · Chicos', '2do año · Chicos'])
  })

  it('fixes the sub-área of a directora de grupo (one sub-área): no cards, no link back', () => {
    const v = calcularVistaGrupos({
      grupos: GRUPOS_TRANSIT.filter((g) => g.subareaId === CHICAS),
      subareas: [SUBAREAS_TRANSIT[0]],
      filtros: FILTROS_INICIALES,
      campusId: null,
    })
    expect(v.filtros.area).toBe(CHICAS)
    expect(v.tarjetas.items).toEqual([])
    expect(v.migas.map((m) => [m.etiqueta, m.parche !== null])).toEqual([
      ['Estudiantes', false],
      ['Transit', false],
      ['Grupos de Chicas', false],
    ])
    expect(v.atras).toBeNull()
  })

  it('starts at the ámbito cards when the caller manages more than one ámbito', () => {
    const v = calcularVistaGrupos({
      grupos: [...GRUPOS_TRANSIT, grupo('t1', 'Zona Este · Chicas', { ambitoId: TLR, ambito: 'The Living Room', experiencia: 'the_living_room', subareaId: TLR_CHICAS, anio: null, anioEtiqueta: null, zona: 'Zona Este' })],
      subareas: [...SUBAREAS_TRANSIT, subarea(TLR_CHICAS, { ambitoId: TLR, ambito: 'The Living Room', experiencia: 'the_living_room' })],
      filtros: FILTROS_INICIALES,
      campusId: null,
    })
    expect(v.filtros.ambito).toBeNull()
    expect(v.titulo).toBe('Grupos de Estudiantes')
    expect(v.tarjetas.nivel).toBe('ambitos')
    expect(v.tarjetas.items.map((t) => [t.label, t.grupos, t.integrantes])).toEqual([
      ['The Living Room', 1, 0],
      ['Transit', 5, 7],
    ])
    expect(v.visibles).toHaveLength(6)
  })

  it('ignores an unknown ámbito or sub-área from the URL', () => {
    const v = vista({ ambito: 'otro', area: 'otra' })
    expect(v.filtros.ambito).toBe(TRANSIT)
    expect(v.filtros.area).toBeNull()
  })

  it('follows the campus chosen in the app when the caller manages it', () => {
    const otro = grupo('x1', '1er año · Chicas', { campusId: CAMPUS_OTRO })
    const base = {
      grupos: [...GRUPOS_TRANSIT, otro],
      subareas: [...SUBAREAS_TRANSIT, subarea(CHICAS, { campusId: CAMPUS_OTRO, campus: 'Cabudare' })],
      filtros: FILTROS_INICIALES,
    }
    expect(calcularVistaGrupos({ ...base, campusId: CAMPUS_OTRO }).visibles.map((g) => g.id)).toEqual(['x1'])
    expect(calcularVistaGrupos({ ...base, campusId: CAMPUS }).visibles).toHaveLength(5)
    // A campus the caller manages nothing in does not empty the screen.
    expect(calcularVistaGrupos({ ...base, campusId: 'c-ninguno' }).visibles).toHaveLength(6)
  })
})

describe('attention metrics', () => {
  it('counts visitors to confirm, groups without a leader and deactivated groups', () => {
    const v = vista()
    expect(v.totales).toEqual({ grupos: 5, integrantes: 7, visitantes: 3, porConfirmar: 2, sinLider: 2, desactivados: 1 })
    expect(v.metricas.map((m) => [m.id, m.valor, m.total ?? null, m.activa])).toEqual([
      ['confirmar', 2, null, false],
      ['sinLider', 2, 5, false],
      ['desactivados', 1, null, false],
    ])
  })

  it('filters by the pressed metric; a second press clears it', () => {
    expect(nombres(vista({ metrica: 'confirmar' }))).toEqual(['1er año · Chicos', '2do año · Chicas'])
    expect(nombres(vista({ metrica: 'sinLider' }))).toEqual(['2do año · Chicos', '3er año · Chicas'])
    expect(nombres(vista({ metrica: 'desactivados' }))).toEqual(['Nuevos · Chicos'])
    expect(parcheMetrica({ ...FILTROS_INICIALES, metrica: 'sinLider' }, 'sinLider')).toEqual({ metrica: null })
    expect(parcheMetrica(FILTROS_INICIALES, 'sinLider')).toEqual({ metrica: 'sinLider' })
  })

  it('keeps the metrics on the whole scope while a search or año filter is on', () => {
    expect(vista({ q: 'zzz', anio: 3 }).totales.grupos).toBe(5)
  })
})

describe('search, año and order', () => {
  it('searches group, leader and student names, ignoring accents and case', () => {
    expect(nombres(vista({ q: 'pao' }))).toEqual(['2do año · Chicas'])
    expect(nombres(vista({ q: 'matias' }))).toEqual(['1er año · Chicos'])
    expect(nombres(vista({ q: '3ER' }))).toEqual(['3er año · Chicas'])
  })

  it('offers the años of the scope with their counts and filters by one', () => {
    const v = vista({ anio: 1 })
    expect(v.anios).toEqual([
      { numero: 1, etiqueta: '1er año', cantidad: 2 },
      { numero: 2, etiqueta: '2do año', cantidad: 2 },
      { numero: 3, etiqueta: '3er año', cantidad: 1 },
    ])
    expect(nombres(v)).toEqual(['1er año · Chicas', '1er año · Chicos'])
    expect(v.filtrosEnHoja).toBe(1)
  })

  it('has no año filter in The Living Room', () => {
    const v = calcularVistaGrupos({
      grupos: [grupo('t1', 'Zona Este · Chicas', { ambitoId: TLR, ambito: 'The Living Room', experiencia: 'the_living_room', subareaId: TLR_CHICAS, anio: null, anioEtiqueta: null })],
      subareas: [subarea(TLR_CHICAS, { ambitoId: TLR, ambito: 'The Living Room', experiencia: 'the_living_room' })],
      filtros: { ...FILTROS_INICIALES, anio: 2 },
      campusId: null,
    })
    expect(v.filtros.anio).toBeNull()
    expect(v.anios).toEqual([])
    expect(v.columnaAnio).toBe('Zona')
  })

  it('sorts by año (default), name or most members', () => {
    expect(nombres(vista({ orden: 'nombre' }))[0]).toBe('1er año · Chicas')
    expect(nombres(vista({ orden: 'integrantes' }))[0]).toBe('1er año · Chicos')
    expect(vista({ orden: 'integrantes' }).filtrosEnHoja).toBe(1)
  })

  it('writes the footer for the list and for the deactivated groups', () => {
    expect(vista({ anio: 1 }).pie).toEqual({ resumen: '2 de 5 grupos activos · 7 integrantes', orden: 'Orden: año escolar' })
    expect(vista({ metrica: 'desactivados', orden: 'nombre' }).pie).toEqual({
      resumen: '1 de 1 grupo desactivado',
      orden: 'Orden: grupo A–Z',
    })
  })
})

describe('area cards', () => {
  it('carry groups, members, flags and who directs the sub-área', () => {
    expect(vista().tarjetas.items).toEqual([
      { id: CHICAS, label: 'Grupos de Chicas', grupos: 3, integrantes: 4, sinLider: 1, porConfirmar: 1, responsable: 'Lorena Salas' },
      { id: CHICOS, label: 'Grupos de Chicos', grupos: 2, integrantes: 3, sinLider: 1, porConfirmar: 1, responsable: 'Raúl Gómez' },
    ])
  })
})

describe('breadcrumbs and back', () => {
  it('links the ámbito back from a sub-área', () => {
    const v = vista({ area: CHICAS })
    expect(v.migas.map((m) => m.etiqueta)).toEqual(['Estudiantes', 'Transit', 'Grupos de Chicas'])
    expect(v.migas[1].parche).toEqual({ area: null })
    expect(v.atras).toEqual({ etiqueta: 'Transit', parche: { area: null } })
  })

  it('has no back at the root of the only ámbito', () => {
    expect(vista().atras).toBeNull()
  })
})

describe('URL', () => {
  it('round-trips the filters and drops defaults', () => {
    const filtros: FiltrosGrupos = { ambito: INSIDE, area: CHICAS, metrica: 'confirmar', anio: 4, orden: 'nombre', q: 'ana' }
    const consulta = escribirFiltrosEnUrl(filtros)
    expect(consulta).toBe('ambito=a-inside&area=s-transit-chicas&metrica=confirmar&anio=4&orden=nombre&q=ana')
    expect(leerFiltrosDeUrl(Object.fromEntries(new URLSearchParams(consulta)))).toEqual(filtros)
    expect(escribirFiltrosEnUrl(FILTROS_INICIALES)).toBe('')
  })

  it('ignores invalid values', () => {
    expect(leerFiltrosDeUrl({ metrica: 'baja', anio: 'x', orden: 'asistencia' })).toEqual(FILTROS_INICIALES)
  })
})

describe('texts', () => {
  it('writes the weekly meeting of a The Living Room group', () => {
    expect(horarioTexto(4, '19:30:00')).toBe('Jueves · 19:30')
    expect(horarioTexto(0, null)).toBe('Domingo')
    expect(horarioTexto(null, null)).toBeNull()
  })

  it('writes the visit count of a visitor', () => {
    expect(textoVisita(1)).toBe('1.ª visita')
    expect(textoVisita(2)).toBe('2.ª visita · se sugiere desde la 3.ª')
    expect(textoVisita(0)).toBe('Aún sin visitas marcadas')
  })
})
