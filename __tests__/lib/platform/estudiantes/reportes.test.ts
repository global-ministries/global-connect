/**
 * Estudiantes — the pure view model of /estudiantes/reportes (C6d3 of
 * odd/tasks/estudiantes-fase-b.md, S17–S20, L48, L49; artboards 11 / 12 of
 * design/estudiantes-asistencia): reading the three report RPCs, which campus
 * and ámbitos the caller may report on, the date ranges, the URL, the
 * thresholds of L48 (baja < 50 %, 3+ seguidas, estable ±3 puntos), the lists,
 * the «Embudo de conexión» and the detail drawers. Every name is fictitious.
 */
import {
  MENSAJES_ERROR_REPORTES,
  ambitosDeCampus,
  asistenciaBaja,
  calcularVistaReportes,
  campusDeReportes,
  codigoErrorReportes,
  faltanSeguidas,
  leerDetalleGrupo,
  leerDetallePersona,
  leerEmbudo,
  leerFiltrosReportes,
  leerReporteAsistencia,
  mensajeErrorReportes,
  opcionesReportes,
  pasosEmbudo,
  rangosReportes,
  resolverRango,
  resumenReporte,
  tarjetaAmbito,
  tendencia,
  textoPorcentaje,
  tonoPorcentaje,
  urlReportes,
  validarRango,
  vistaDetalleGrupo,
  vistaDetallePersona,
  vistaEtapa,
  FILTROS_REPORTES,
  type FiltrosReportes,
  type ReporteAsistencia,
} from '@/lib/platform/estudiantes/reportes'
import type { FilaMisGrupos, FilaSubarea } from '@/lib/platform/estudiantes/grupos-datos'

const HOY = '2026-11-02'
const CAMPUS = 'c0000000-0000-4000-8000-000000000001'
const TRANSIT = 'a0000000-0000-4000-8000-000000000001'
const IO = 'a0000000-0000-4000-8000-000000000002'
const TLR = 'a0000000-0000-4000-8000-000000000003'
const CHICAS = 's0000000-0000-4000-8000-000000000001'
const CHICOS = 's0000000-0000-4000-8000-000000000002'
const IO_CHICAS = 's0000000-0000-4000-8000-000000000003'
const TLR_CHICOS = 's0000000-0000-4000-8000-000000000004'

const grupoRpc = (parche: Record<string, unknown> = {}) => ({
  grupo_id: 'g1',
  nombre: '1er año · Chicas',
  subarea_id: CHICAS,
  subarea: 'Grupos de Chicas',
  anio: 1,
  anio_etiqueta: '1er año',
  dia_semana: null,
  hora: null,
  lideres: ['Fernanda Ochoa', 'Diana Peraza'],
  miembros: 14,
  reuniones: 8,
  reuniones_esperadas: 8,
  sin_marcar: 0,
  sin_marcar_fechas: [],
  presentes: 94,
  ausentes: 18,
  visitantes: 4,
  promedio_presentes: 11.8,
  porcentaje: 83.9,
  reuniones_previas: 8,
  porcentaje_previo: 80,
  delta: 3.9,
  ...parche,
})

const personaRpc = (parche: Record<string, unknown> = {}) => ({
  persona_id: 'p1',
  nombre: 'Ana Lucía',
  apellido: 'Briceño',
  anio_etiqueta: '1er año',
  grupo_id: 'g1',
  grupo: '1er año · Chicas',
  miembro_desde: '2026-07-12',
  reuniones: 8,
  presentes: 7,
  ausentes: 1,
  sin_marcar: 0,
  porcentaje: 87.5,
  ausencias_seguidas: 0,
  ultima_presente: '2026-11-01',
  grupos_en_rango: ['1er año · Chicas'],
  ...parche,
})

const asistenciaRpc = (parche: Record<string, unknown> = {}) => ({
  ambito_id: TRANSIT,
  campus_id: CAMPUS,
  subarea_id: null,
  desde: '2026-09-08',
  hasta: HOY,
  previo_desde: '2026-07-14',
  previo_hasta: '2026-09-07',
  subareas: [
    { subarea_id: CHICAS, label: 'Grupos de Chicas', grupos: 2 },
    { subarea_id: CHICOS, label: 'Grupos de Chicos', grupos: 1 },
  ],
  resumen: { grupos: 3, reuniones: 23, presentes: 200, ausentes: 90, porcentaje: 69, visitantes: 9, sin_marcar: 1, personas: 4 },
  grupos: [
    grupoRpc(),
    grupoRpc({ grupo_id: 'g2', nombre: '2do año · Chicas', anio: 2, anio_etiqueta: '2do año', lideres: ['Andrea Molina'], miembros: 12, porcentaje: 46.2, delta: -17.4, sin_marcar: 1, sin_marcar_fechas: ['2026-10-18'], reuniones: 7, promedio_presentes: 5.5 }),
    grupoRpc({ grupo_id: 'g3', nombre: '1er año · Chicos', subarea_id: CHICOS, subarea: 'Grupos de Chicos', lideres: [], miembros: 4, reuniones: 0, presentes: 0, ausentes: 0, visitantes: 0, promedio_presentes: null, porcentaje: null, reuniones_previas: 0, porcentaje_previo: null, delta: null }),
  ],
  personas: [
    personaRpc(),
    personaRpc({ persona_id: 'p2', nombre: 'Camila', apellido: 'Herrera', grupo_id: 'g2', grupo: '2do año · Chicas', porcentaje: 37.5, presentes: 3, ausentes: 5, ausencias_seguidas: 3, ultima_presente: '2026-10-11', sin_marcar: 1, reuniones: 9 }),
    personaRpc({ persona_id: 'p3', nombre: 'Daniela', apellido: 'Colmenares', grupo_id: 'g2', grupo: '2do año · Chicas', grupos_en_rango: ['1er año · Chicas', '2do año · Chicas'], miembro_desde: '2026-10-11', porcentaje: 62.5, ausencias_seguidas: 1 }),
    personaRpc({ persona_id: 'p4', nombre: 'Bárbara', apellido: 'Toro', grupo_id: 'g3', grupo: '1er año · Chicos', reuniones: 0, presentes: 0, ausentes: 0, porcentaje: null, ultima_presente: null, miembro_desde: '2026-10-27' }),
  ],
  ...parche,
})

const reporte = (parche: Record<string, unknown> = {}): ReporteAsistencia => leerReporteAsistencia(asistenciaRpc(parche))!

const filtros = (parche: Partial<FiltrosReportes> = {}): FiltrosReportes => ({ ...FILTROS_REPORTES, ...parche })

// ── Reading the RPCs ────────────────────────────────────────────────

describe('leerReporteAsistencia', () => {
  it('reads the range, sub-áreas, summary, groups and people', () => {
    const r = reporte()
    expect(r).toMatchObject({ desde: '2026-09-08', hasta: HOY, previoDesde: '2026-07-14', previoHasta: '2026-09-07' })
    expect(r.subareas).toEqual([
      { subareaId: CHICAS, label: 'Grupos de Chicas', grupos: 2 },
      { subareaId: CHICOS, label: 'Grupos de Chicos', grupos: 1 },
    ])
    expect(r.resumen).toEqual({ grupos: 3, reuniones: 23, presentes: 200, ausentes: 90, porcentaje: 69, visitantes: 9, sinMarcar: 1, personas: 4 })
    expect(r.grupos[1]).toMatchObject({
      grupoId: 'g2',
      nombre: '2do año · Chicas',
      subarea: 'Grupos de Chicas',
      anio: 2,
      lideres: ['Andrea Molina'],
      miembros: 12,
      sinMarcar: 1,
      sinMarcarFechas: ['2026-10-18'],
      porcentaje: 46.2,
      delta: -17.4,
    })
    expect(r.grupos[2]).toMatchObject({ porcentaje: null, delta: null, promedioPresentes: null })
    expect(r.personas[0]).toMatchObject({
      personaId: 'p1',
      nombre: 'Ana Lucía Briceño',
      grupoId: 'g1',
      grupo: '1er año · Chicas',
      reuniones: 8,
      presentes: 7,
      porcentaje: 87.5,
      ausenciasSeguidas: 0,
      ultimaPresente: '2026-11-01',
      gruposEnRango: ['1er año · Chicas'],
    })
  })

  it('is null for a payload that is not a report', () => {
    expect(leerReporteAsistencia(null)).toBeNull()
    expect(leerReporteAsistencia([1])).toBeNull()
    expect(leerReporteAsistencia({ grupos: [] })).toBeNull()
  })

  it('drops malformed rows and keeps the rest', () => {
    const r = leerReporteAsistencia(asistenciaRpc({ grupos: [grupoRpc(), { nombre: 'sin id' }, 'x'], personas: [personaRpc(), {}] }))!
    expect(r.grupos.map((g) => g.grupoId)).toEqual(['g1'])
    expect(r.personas.map((p) => p.personaId)).toEqual(['p1'])
  })
})

const embudoRpc = () => ({
  ambito_id: TRANSIT,
  campus_id: CAMPUS,
  subarea_id: null,
  fecha: HOY,
  sin_grupo: {
    cantidad: 3,
    personas: [
      { persona_id: 'f1', nombre: 'Sofía', apellido: 'Linares', tipo: 'visitante', grupo: '2do año · Chicas', anio_etiqueta: '2do año' },
      { persona_id: 'f2', nombre: 'Abril', apellido: 'Chacón', tipo: 'ficha', grupo: null, anio_etiqueta: '1er año' },
      { persona_id: 'f3', nombre: 'Joaquín', apellido: 'Mena', tipo: 'antes_en_grupo', grupo: '1er año · Chicos', anio_etiqueta: null },
    ],
  },
  en_grupo: {
    cantidad: 9,
    personas: [
      { persona_id: 'p1', nombre: 'Ana Lucía', apellido: 'Briceño', grupo_id: 'g1', grupo: '1er año · Chicas', servicio: 'Bienvenida' },
      { persona_id: 'p2', nombre: 'Camila', apellido: 'Herrera', grupo_id: 'g2', grupo: '2do año · Chicas', servicio: null },
    ],
  },
  sirviendo: {
    cantidad: 1,
    personas: [{ persona_id: 'p1', nombre: 'Ana Lucía', apellido: 'Briceño', grupo_id: 'g1', grupo: '1er año · Chicas', servicio: 'Bienvenida' }],
  },
})

describe('leerEmbudo', () => {
  it('reads the three steps of today', () => {
    const e = leerEmbudo(embudoRpc())!
    expect(e.fecha).toBe(HOY)
    expect(e.sinGrupo.cantidad).toBe(3)
    expect(e.sinGrupo.personas[0]).toEqual({ personaId: 'f1', nombre: 'Sofía Linares', tipo: 'visitante', grupoId: null, grupo: '2do año · Chicas', anioEtiqueta: '2do año', servicio: null })
    expect(e.enGrupo.personas[0]).toMatchObject({ personaId: 'p1', grupoId: 'g1', servicio: 'Bienvenida' })
    expect(e.sirviendo.cantidad).toBe(1)
  })

  it('is null for anything else', () => {
    expect(leerEmbudo(null)).toBeNull()
    expect(leerEmbudo({ sin_grupo: {} })).toBeNull()
  })
})

const detalleGrupoRpc = (parche: Record<string, unknown> = {}) => ({
  grupo: {
    grupo_id: 'g2',
    nombre: '2do año · Chicas',
    ambito_id: TRANSIT,
    ambito: 'Transit',
    subarea_id: CHICAS,
    subarea: 'Grupos de Chicas',
    anio: 2,
    anio_etiqueta: '2do año',
    dia_semana: null,
    hora: null,
    activo: true,
    lideres: ['Andrea Molina', 'Paola Ruiz'],
  },
  desde: '2026-09-08',
  hasta: HOY,
  resumen: grupoRpc({ reuniones: 7, sin_marcar: 1, sin_marcar_fechas: ['2026-10-18'], porcentaje: 46.2, porcentaje_previo: 63.6, delta: -17.4, promedio_presentes: 5.5, visitantes: 1 }),
  reuniones: [
    { fecha: '2026-11-01', reunion_id: 'r8', turno_id: 't1', turno: 'Domingo 9:00', lugar: null, presentes: 7, ausentes: 5, visitantes: 1, porcentaje: 58.3, sin_marcar: false },
    { fecha: '2026-10-18', reunion_id: null, turno_id: null, turno: null, lugar: null, presentes: 0, ausentes: 0, visitantes: 0, porcentaje: null, sin_marcar: true },
  ],
  integrantes: [
    { persona_id: 'p2', nombre: 'Camila', apellido: 'Herrera', miembro_desde: '2026-07-12', reuniones: 8, presentes: 3, ausentes: 5, sin_marcar: 0, porcentaje: 37.5, ausencias_seguidas: 3, ultima_presente: '2026-10-11', grupos_en_rango: ['2do año · Chicas'] },
  ],
  ...parche,
})

const detallePersonaRpc = (parche: Record<string, unknown> = {}) => ({
  persona: { persona_id: 'p3', nombre: 'Daniela', apellido: 'Colmenares', anio_etiqueta: '3er año', egresado: false },
  desde: '2026-09-08',
  hasta: HOY,
  resumen: { reuniones: 8, presentes: 5, ausentes: 3, sin_marcar: 0, porcentaje: 62.5, ausencias_seguidas: 3, ultima_presente: '2026-10-11', grupos_en_rango: ['2do año · Chicas', '3er año · Chicas'] },
  membresias: [
    { grupo_id: 'g2', grupo: '2do año · Chicas', ambito_id: TRANSIT, estado: 'miembro', desde: '2026-07-12', retirado_at: '2026-10-11T14:00:00+00:00', activo: false },
    { grupo_id: 'g4', grupo: '3er año · Chicas', ambito_id: TRANSIT, estado: 'miembro', desde: '2026-10-11', retirado_at: null, activo: true },
  ],
  reuniones: [
    { fecha: '2026-11-01', grupo_id: 'g4', grupo: '3er año · Chicas', reunion_id: 'r1', turno_id: 't1', turno: 'Domingo 9:00', estado: 'ausente' },
    { fecha: '2026-10-25', grupo_id: 'g4', grupo: '3er año · Chicas', reunion_id: 'r2', turno_id: 't1', turno: 'Domingo 9:00', estado: 'sin_marcar' },
    { fecha: '2026-10-18', grupo_id: 'g4', grupo: '3er año · Chicas', reunion_id: null, turno_id: null, turno: null, estado: 'nadie_marco' },
    { fecha: '2026-10-04', grupo_id: 'g2', grupo: '2do año · Chicas', reunion_id: 'r3', turno_id: 't1', turno: 'Domingo 9:00', estado: 'presente' },
  ],
  ...parche,
})

describe('leerDetalleGrupo / leerDetallePersona', () => {
  it('reads a group detail', () => {
    const d = leerDetalleGrupo(detalleGrupoRpc())!
    expect(d.grupo).toMatchObject({ grupoId: 'g2', ambito: 'Transit', subarea: 'Grupos de Chicas', lideres: ['Andrea Molina', 'Paola Ruiz'] })
    expect(d.resumen).toMatchObject({ reuniones: 7, porcentaje: 46.2, porcentajePrevio: 63.6, delta: -17.4 })
    expect(d.reuniones.map((r) => [r.fecha, r.sinMarcar])).toEqual([
      ['2026-11-01', false],
      ['2026-10-18', true],
    ])
    expect(d.integrantes[0]).toMatchObject({ personaId: 'p2', nombre: 'Camila Herrera', ausenciasSeguidas: 3 })
  })

  it('reads a person detail', () => {
    const d = leerDetallePersona(detallePersonaRpc())!
    expect(d.persona).toEqual({ personaId: 'p3', nombre: 'Daniela Colmenares', anioEtiqueta: '3er año', egresado: false })
    expect(d.resumen).toMatchObject({ presentes: 5, ausenciasSeguidas: 3, ultimaPresente: '2026-10-11' })
    expect(d.membresias.map((m) => [m.grupo, m.activo])).toEqual([
      ['2do año · Chicas', false],
      ['3er año · Chicas', true],
    ])
    expect(d.reuniones.map((r) => r.estado)).toEqual(['ausente', 'sin_marcar', 'nadie_marco', 'presente'])
  })

  it('tells a group from a person and rejects anything else', () => {
    expect(leerDetalleGrupo(detallePersonaRpc())).toBeNull()
    expect(leerDetallePersona(detalleGrupoRpc())).toBeNull()
    expect(leerDetalleGrupo(null)).toBeNull()
  })
})

// ── Errors ──────────────────────────────────────────────────────────

describe('codigoErrorReportes / mensajeErrorReportes', () => {
  it('turns every RPC code into Spanish (tuteo)', () => {
    for (const codigo of ['sin_autoridad', 'rango_invalido', 'ambito_invalido', 'subarea_invalida', 'parametros_invalidos', 'grupo_invalido', 'persona_invalida'] as const) {
      expect(codigoErrorReportes({ code: '22023', message: codigo })).toBe(codigo)
      expect(mensajeErrorReportes({ code: '22023', message: codigo })).toBe(MENSAJES_ERROR_REPORTES[codigo])
    }
    expect(MENSAJES_ERROR_REPORTES.sin_autoridad).toBe('No tienes acceso a los reportes de este ámbito.')
    expect(MENSAJES_ERROR_REPORTES.rango_invalido).toBe('Revisa las fechas: «Desde» debe ser anterior a «Hasta» y el rango no puede pasar de un año.')
  })

  it('reads SQLSTATE 42501 as sin_autoridad and falls back for the rest', () => {
    expect(codigoErrorReportes({ code: '42501', message: 'permission denied' })).toBe('sin_autoridad')
    expect(codigoErrorReportes({ code: 'XX000', message: 'boom' })).toBeNull()
    expect(mensajeErrorReportes({ message: 'boom' })).toBe('No se pudo cargar el reporte. Recarga la página.')
  })

  it('never uses voseo or "acá"', () => {
    const todo = Object.values(MENSAJES_ERROR_REPORTES).join(' ')
    expect(todo).not.toMatch(/\b(tenés|podés|revisá|elegí|recargá|acá)\b/i)
  })
})

// ── Who may report: campus and ámbitos ──────────────────────────────

const gestionable = (parche: Record<string, unknown> = {}): FilaSubarea => ({
  subarea_id: CHICAS,
  subarea: 'Grupos de Chicas',
  ambito_id: TRANSIT,
  ambito: 'Transit',
  experiencia: 'estudiantes',
  campus_id: CAMPUS,
  campus: 'Barquisimeto',
  responsables: [],
  ...parche,
}) as unknown as FilaSubarea

const miGrupo = (parche: Record<string, unknown> = {}): FilaMisGrupos => ({
  grupo_id: 'g9',
  nombre: 'Zona Este · Chicos',
  campus_id: CAMPUS,
  ambito_id: TLR,
  ambito: 'The Living Room',
  experiencia: 'the_living_room',
  subarea_id: TLR_CHICOS,
  subarea: 'Grupos de Chicos',
  anio: null,
  anio_etiqueta: null,
  zona: 'Zona Este',
  dia_semana: 4,
  hora: '19:30:00',
  activo: true,
  soy_lider: false,
  puede_ver_vivo: true,
  puede_gestionar: false,
  miembros: 10,
  visitantes: 1,
  lideres: [],
  ...parche,
}) as unknown as FilaMisGrupos

describe('opcionesReportes / campusDeReportes / ambitosDeCampus', () => {
  it('joins managed sub-áreas (level 3) and the groups seen at level 2, once each', () => {
    const opciones = opcionesReportes(
      [gestionable(), gestionable({ subarea_id: CHICOS, subarea: 'Grupos de Chicos' })],
      [miGrupo(), miGrupo({ grupo_id: 'g10' }), miGrupo({ grupo_id: 'g11', puede_ver_vivo: false, subarea_id: CHICAS, subarea: 'Grupos de Chicas' }), miGrupo({ grupo_id: 'g12', ambito_id: TRANSIT, ambito: 'Transit', experiencia: 'estudiantes', subarea_id: CHICAS })],
    )
    expect(opciones.map((o) => [o.ambito, o.subarea, o.campus])).toEqual([
      ['Transit', 'Grupos de Chicas', 'Barquisimeto'],
      ['Transit', 'Grupos de Chicos', 'Barquisimeto'],
      ['The Living Room', 'Grupos de Chicos', null],
    ])
  })

  it('has nothing for a leader (level 1 only)', () => {
    expect(opcionesReportes([], [miGrupo({ puede_ver_vivo: false, soy_lider: true })])).toEqual([])
  })

  it('names and sorts the campuses, with the loaded names for the level-2 ones', () => {
    const otro = 'c0000000-0000-4000-8000-000000000002'
    const opciones = opcionesReportes([gestionable()], [miGrupo({ campus_id: otro })])
    expect(campusDeReportes(opciones, { [otro]: 'Acarigua' })).toEqual([
      { id: otro, nombre: 'Acarigua' },
      { id: CAMPUS, nombre: 'Barquisimeto' },
    ])
    expect(campusDeReportes(opciones, {})).toEqual([
      { id: CAMPUS, nombre: 'Barquisimeto' },
      { id: otro, nombre: 'Campus' },
    ])
  })

  it('orders the ámbitos Transit → Inside Out → The Living Room (S20), with their sub-áreas', () => {
    const opciones = opcionesReportes(
      [
        gestionable({ ambito_id: TLR, ambito: 'The Living Room', experiencia: 'the_living_room', subarea_id: TLR_CHICOS }),
        gestionable({ ambito_id: IO, ambito: 'Inside Out', subarea_id: IO_CHICAS }),
        gestionable(),
        gestionable({ subarea_id: CHICOS, subarea: 'Grupos de Chicos' }),
      ],
      [],
    )
    const ambitos = ambitosDeCampus(opciones, CAMPUS)
    expect(ambitos.map((a) => a.nombre)).toEqual(['Transit', 'Inside Out', 'The Living Room'])
    expect(ambitos[0].subareas).toEqual([
      { id: CHICAS, label: 'Grupos de Chicas' },
      { id: CHICOS, label: 'Grupos de Chicos' },
    ])
    expect(ambitosDeCampus(opciones, 'otro')).toEqual([])
  })
})

// ── Date ranges ─────────────────────────────────────────────────────

describe('rangosReportes / resolverRango / validarRango', () => {
  it('offers the quick ranges in weeks and months, ending today', () => {
    expect(rangosReportes(HOY)).toEqual([
      { clave: '8sem', etiqueta: 'Últimas 8 semanas', desde: '2026-09-08', hasta: HOY },
      { clave: 'mes', etiqueta: 'Este mes', desde: '2026-11-01', hasta: HOY },
      { clave: 'anterior', etiqueta: 'Mes anterior', desde: '2026-10-01', hasta: '2026-10-31' },
      { clave: '6m', etiqueta: 'Últimos 6 meses', desde: '2026-05-03', hasta: HOY },
    ])
  })

  it('defaults to the last 8 weeks', () => {
    expect(resolverRango({}, HOY)).toEqual({ clave: '8sem', desde: '2026-09-08', hasta: HOY })
    expect(resolverRango({ rango: 'nada' }, HOY)).toEqual({ clave: '8sem', desde: '2026-09-08', hasta: HOY })
  })

  it('takes a quick range or valid custom dates', () => {
    expect(resolverRango({ rango: 'anterior' }, HOY)).toEqual({ clave: 'anterior', desde: '2026-10-01', hasta: '2026-10-31' })
    expect(resolverRango({ desde: '2026-06-01', hasta: '2026-06-30' }, HOY)).toEqual({ clave: 'fechas', desde: '2026-06-01', hasta: '2026-06-30' })
  })

  it('falls back to the default for dates the RPC would reject', () => {
    const porDefecto = { clave: '8sem', desde: '2026-09-08', hasta: HOY }
    expect(resolverRango({ desde: '2026-06-30', hasta: '2026-06-01' }, HOY)).toEqual(porDefecto)
    expect(resolverRango({ desde: '2025-01-01', hasta: '2026-06-01' }, HOY)).toEqual(porDefecto)
    expect(resolverRango({ desde: '2026-06-01', hasta: '2026-12-01' }, HOY)).toEqual(porDefecto)
    expect(resolverRango({ desde: '01/06/2026', hasta: '2026-06-30' }, HOY)).toEqual(porDefecto)
  })

  it('explains an invalid custom range (copy of Niños)', () => {
    expect(validarRango('2026-06-30', '2026-06-01', HOY)).toBe('Revisa las fechas: «Desde» debe ser anterior a «Hasta».')
    expect(validarRango('2025-01-01', '2026-06-01', HOY)).toBe('Elige un rango de hasta un año.')
    expect(validarRango('2026-06-01', '2026-12-01', HOY)).toBe('«Hasta» no puede ser después de hoy.')
    expect(validarRango('2026-06-01', '2026-06-30', HOY)).toBeNull()
  })
})

// ── URL ─────────────────────────────────────────────────────────────

describe('leerFiltrosReportes / urlReportes', () => {
  it('reads the list filters and ignores unknown values', () => {
    expect(leerFiltrosReportes({})).toEqual(FILTROS_REPORTES)
    expect(leerFiltrosReportes({ tab: 'personas', metrica: 'seguidas', orden: 'ultima', q: 'Ana' })).toEqual({
      tab: 'personas',
      metrica: 'seguidas',
      ordenGrupos: 'anio',
      ordenPersonas: 'ultima',
      q: 'Ana',
    })
    expect(leerFiltrosReportes({ tab: 'grupos', metrica: 'seguidas', orden: 'ultima' })).toEqual({ ...FILTROS_REPORTES, metrica: null })
    expect(leerFiltrosReportes({ tab: ['personas', 'grupos'] }).tab).toBe('personas')
  })

  it('writes only what differs from the default', () => {
    const base = { campusId: null, ambitoId: TRANSIT, subareaId: null, rango: { clave: '8sem' as const, desde: '2026-09-08', hasta: HOY } }
    expect(urlReportes(base, FILTROS_REPORTES)).toBe(`/estudiantes/reportes?ambito=${TRANSIT}`)
    expect(
      urlReportes(
        { campusId: CAMPUS, ambitoId: IO, subareaId: CHICOS, rango: { clave: 'fechas', desde: '2026-06-01', hasta: '2026-06-30' } },
        filtros({ tab: 'personas', metrica: 'baja', ordenPersonas: 'seguidas', q: 'Ana' }),
        { grupoId: null, personaId: 'p1' },
      ),
    ).toBe(`/estudiantes/reportes?campus=${CAMPUS}&ambito=${IO}&subarea=${CHICOS}&desde=2026-06-01&hasta=2026-06-30&tab=personas&metrica=baja&orden=seguidas&q=Ana&persona=p1`)
    expect(urlReportes({ ...base, rango: { clave: 'mes', desde: '2026-11-01', hasta: HOY } }, filtros({ ordenGrupos: 'asistencia' }), { grupoId: 'g1', personaId: null })).toBe(
      `/estudiantes/reportes?ambito=${TRANSIT}&rango=mes&orden=asistencia&grupo=g1`,
    )
  })
})

// ── Thresholds (L48) ────────────────────────────────────────────────

describe('tendencia (estable within ±3 points)', () => {
  it('rises, falls or stays', () => {
    expect(tendencia(6.4)).toEqual({ tipo: 'sube', texto: 'Sube 6', accesible: 'Sube 6 puntos frente al período anterior' })
    expect(tendencia(-17.4)).toEqual({ tipo: 'baja', texto: 'Baja 17', accesible: 'Baja 17 puntos frente al período anterior' })
    expect(tendencia(3)).toMatchObject({ tipo: 'sube', texto: 'Sube 3' })
    expect(tendencia(-3)).toMatchObject({ tipo: 'baja', texto: 'Baja 3' })
    expect(tendencia(2.9)).toEqual({ tipo: 'estable', texto: 'Estable', accesible: 'Estable frente al período anterior' })
    expect(tendencia(-2.9)).toMatchObject({ tipo: 'estable' })
    expect(tendencia(0)).toMatchObject({ tipo: 'estable' })
  })

  it('says when there is nothing to compare', () => {
    expect(tendencia(null)).toEqual({ tipo: 'sin_datos', texto: 'Sin datos previos', accesible: 'Sin datos del período anterior' })
  })
})

describe('asistenciaBaja / faltanSeguidas / tonoPorcentaje / textoPorcentaje', () => {
  it('flags attendance below 50 %', () => {
    expect(asistenciaBaja(49.9)).toBe(true)
    expect(asistenciaBaja(50)).toBe(false)
    expect(asistenciaBaja(null)).toBe(false)
  })

  it('flags 3 or more absences in a row', () => {
    expect(faltanSeguidas(3)).toBe(true)
    expect(faltanSeguidas(2)).toBe(false)
  })

  it('colours percentages on the patterns.md scale and rounds them', () => {
    expect([80, 79.9, 60, 59.9, 40, 39.9].map(tonoPorcentaje)).toEqual(['success', 'warning', 'warning', 'brand', 'brand', 'danger'])
    expect(textoPorcentaje(83.9)).toBe('84%')
    expect(textoPorcentaje(null)).toBe('—')
  })
})

// ── The lists ───────────────────────────────────────────────────────

describe('calcularVistaReportes', () => {
  it('lists the groups in the RPC order (año escolar) with the attention pills', () => {
    const v = calcularVistaReportes({ reporte: reporte(), filtros: FILTROS_REPORTES })
    expect(v.hayReuniones).toBe(true)
    expect(v.grupos.map((g) => g.grupoId)).toEqual(['g1', 'g2', 'g3'])
    expect(v.pastillas.map((p) => [p.id, p.etiqueta, p.cantidad])).toEqual([
      [null, 'Todos', 3],
      ['baja', 'Asistencia baja (<50%)', 1],
      ['bajando', 'Bajando', 1],
      ['sinmarcar', 'Reuniones sin marcar', 1],
    ])
    expect(v.pie).toEqual({ resumen: '3 de 3 grupos · 30 integrantes', orden: 'Orden: año escolar' })
    expect(v.tabs).toEqual({ grupos: 3, personas: 4 })
  })

  it('filters by one pill and sorts', () => {
    const baja = calcularVistaReportes({ reporte: reporte(), filtros: filtros({ metrica: 'baja' }) })
    expect(baja.grupos.map((g) => g.grupoId)).toEqual(['g2'])
    const orden = calcularVistaReportes({ reporte: reporte(), filtros: filtros({ ordenGrupos: 'asistencia' }) })
    expect(orden.grupos.map((g) => g.grupoId)).toEqual(['g2', 'g1', 'g3'])
    expect(orden.pie.orden).toBe('Orden: asistencia más baja primero')
    expect(calcularVistaReportes({ reporte: reporte(), filtros: filtros({ ordenGrupos: 'tendencia' }) }).grupos.map((g) => g.grupoId)).toEqual(['g2', 'g1', 'g3'])
    expect(calcularVistaReportes({ reporte: reporte(), filtros: filtros({ ordenGrupos: 'miembros' }) }).grupos.map((g) => g.grupoId)).toEqual(['g1', 'g2', 'g3'])
  })

  it('searches groups by name, leader or member and people by name, group or leader', () => {
    expect(calcularVistaReportes({ reporte: reporte(), filtros: filtros({ q: 'molina' }) }).grupos.map((g) => g.grupoId)).toEqual(['g2'])
    expect(calcularVistaReportes({ reporte: reporte(), filtros: filtros({ q: 'barbara' }) }).grupos.map((g) => g.grupoId)).toEqual(['g3'])
    const personas = calcularVistaReportes({ reporte: reporte(), filtros: filtros({ tab: 'personas', q: 'andrea' }) })
    expect(personas.personas.map((p) => p.personaId)).toEqual(['p2', 'p3'])
  })

  it('lists people with their pills, the move in the range and the footer', () => {
    const v = calcularVistaReportes({ reporte: reporte(), filtros: filtros({ tab: 'personas' }) })
    expect(v.personas.map((p) => p.personaId)).toEqual(['p1', 'p4', 'p2', 'p3'])
    expect(v.pastillas.map((p) => [p.id, p.etiqueta, p.cantidad])).toEqual([
      [null, 'Todas', 4],
      ['seguidas', 'Faltan 3+ seguidas', 1],
      ['baja', 'Asistencia baja (<50%)', 1],
      ['sinmarcar', 'Sin marcar', 1],
    ])
    const daniela = v.personas.find((p) => p.personaId === 'p3')!
    expect(daniela.antesEn).toBe('1er año · Chicas')
    const barbara = v.personas.find((p) => p.personaId === 'p4')!
    expect(barbara.entro).toBe('Entró el 27 oct')
    expect(v.pie).toEqual({ resumen: '4 de 4 personas · el % cuenta desde que cada uno entró', orden: 'Orden: nombre A–Z' })
    const orden = calcularVistaReportes({ reporte: reporte(), filtros: filtros({ tab: 'personas', ordenPersonas: 'nombre' }) })
    expect(orden.personas.map((p) => p.nombre)).toEqual(['Ana Lucía Briceño', 'Bárbara Toro', 'Camila Herrera', 'Daniela Colmenares'])
    expect(calcularVistaReportes({ reporte: reporte(), filtros: filtros({ tab: 'personas', ordenPersonas: 'seguidas' }) }).personas[0].personaId).toBe('p2')
    expect(calcularVistaReportes({ reporte: reporte(), filtros: filtros({ tab: 'personas', ordenPersonas: 'ultima' }) }).personas.map((p) => p.personaId)).toEqual(['p4', 'p2', 'p1', 'p3'])
  })

  it('has no pills and says so when the range has no meetings', () => {
    const vacio = reporte({ grupos: [grupoRpc({ reuniones: 0, presentes: 0, ausentes: 0, porcentaje: null, delta: null })], personas: [] })
    const v = calcularVistaReportes({ reporte: vacio, filtros: filtros({ metrica: 'baja' }) })
    expect(v.hayReuniones).toBe(false)
    expect(v.pastillas).toEqual([])
    expect(v.grupos).toHaveLength(1)
  })
})

describe('calcularVistaReportes with the connections of The Living Room (S21, A37–A40)', () => {
  const conexiones = new Map([
    ['p1', { unos: 3, desconectado: false, servicio: { porcentaje: 75, presentes: 3, esperadas: 4 }, talleres: 2 }],
    ['p2', { unos: 0, desconectado: true, servicio: null, talleres: 0 }],
    ['p3', { unos: 1, desconectado: true, servicio: { porcentaje: null, presentes: 0, esperadas: 0 }, talleres: 1 }],
    ['p4', { unos: 0, desconectado: false, servicio: { porcentaje: 40, presentes: 2, esperadas: 5 }, talleres: 0 }],
  ])
  const personas = (parche: Partial<FiltrosReportes> = {}) => calcularVistaReportes({ reporte: reporte(), filtros: filtros({ tab: 'personas', ...parche }), conexiones })

  it('puts each person\'s figures on the row and «Sin 1:1 en 2 meses» first after Todas', () => {
    const v = personas()
    expect(v.personas.find((p) => p.personaId === 'p1')?.conexion).toEqual(conexiones.get('p1'))
    expect(v.pastillas.map((p) => [p.id, p.etiqueta, p.cantidad])).toEqual([
      [null, 'Todas', 4],
      ['sin11', 'Sin 1:1 en 2 meses', 2],
      ['seguidas', 'Faltan 3+ seguidas', 1],
      ['baja', 'Asistencia baja (<50%)', 1],
      ['sinmarcar', 'Sin marcar', 1],
    ])
    expect(v.pie.resumen).toBe('4 de 4 personas · grupo, 1:1 y servicio cuentan en el rango; talleres, en total')
    expect(personas({ metrica: 'sin11' }).personas.map((p) => p.personaId)).toEqual(['p2', 'p3'])
  })

  it('sorts by fewest 1:1, lowest service (not serving last) and fewest talleres', () => {
    expect(personas({ ordenPersonas: 'unos' }).personas.map((p) => p.personaId)).toEqual(['p4', 'p2', 'p3', 'p1'])
    const servicio = personas({ ordenPersonas: 'servicio' })
    expect(servicio.personas.map((p) => p.personaId)).toEqual(['p4', 'p1', 'p3', 'p2'])
    expect(servicio.pie.orden).toBe('Orden: servicio más bajo primero (sin servicio al final)')
    expect(personas({ ordenPersonas: 'talleres' }).personas.map((p) => p.personaId)).toEqual(['p4', 'p2', 'p3', 'p1'])
  })

  it('ignores the connection pill and sorts without the connections (Transit, Inside Out or a failed call)', () => {
    const v = calcularVistaReportes({ reporte: reporte(), filtros: filtros({ tab: 'personas', metrica: 'sin11', ordenPersonas: 'unos' }) })
    expect(v.pastillas.map((p) => p.id)).toEqual([null, 'seguidas', 'baja', 'sinmarcar'])
    expect(v.personas).toHaveLength(4)
    expect(v.personas.every((p) => p.conexion === null)).toBe(true)
    expect(v.pie).toEqual({ resumen: '4 de 4 personas · el % cuenta desde que cada uno entró', orden: 'Orden: nombre A–Z' })
  })

  it('reads the connection pill and sorts from the URL', () => {
    expect(leerFiltrosReportes({ tab: 'personas', metrica: 'sin11', orden: 'servicio' })).toMatchObject({ metrica: 'sin11', ordenPersonas: 'servicio' })
    expect(leerFiltrosReportes({ tab: 'grupos', metrica: 'sin11', orden: 'talleres' })).toMatchObject({ metrica: null, ordenGrupos: 'anio' })
  })
})

describe('resumenReporte', () => {
  const base = { campus: 'Barquisimeto', ambito: 'Transit', subarea: null, rango: { desde: '2026-09-08', hasta: HOY } }

  it('says the scope, range and key numbers', () => {
    expect(resumenReporte({ ...base, reporte: reporte() })).toEqual({
      prefijo: 'Barquisimeto · Transit · 8 sep – 2 nov',
      cifras: { grupos: 3, reuniones: 23, porcentaje: '69%' },
    })
    expect(resumenReporte({ ...base, subarea: 'Grupos de Chicas', reporte: reporte() }).prefijo).toBe('Barquisimeto · Transit · Grupos de Chicas · 8 sep – 2 nov')
  })

  it('has no figures without meetings', () => {
    const vacio = reporte({ resumen: { grupos: 3, reuniones: 0, presentes: 0, ausentes: 0, porcentaje: null, visitantes: 0, sin_marcar: 0, personas: 0 } })
    expect(resumenReporte({ ...base, reporte: vacio }).cifras).toBeNull()
  })
})

describe('tarjetaAmbito', () => {
  it('counts the groups under 50 % and the people missing 3+ in a row', () => {
    expect(tarjetaAmbito({ id: TRANSIT, nombre: 'Transit' }, reporte())).toEqual({
      id: TRANSIT,
      nombre: 'Transit',
      grupos: 3,
      porcentaje: 69,
      insignias: [
        { texto: '1 grupo bajo 50%', tono: 'warning' },
        { texto: '1 falta 3+ seguidas', tono: 'info' },
      ],
    })
  })

  it('has no flags and no percentage for an empty range', () => {
    const vacio = reporte({ grupos: [], personas: [], resumen: { grupos: 0, reuniones: 0, presentes: 0, ausentes: 0, porcentaje: null, visitantes: 0, sin_marcar: 0, personas: 0 } })
    expect(tarjetaAmbito({ id: IO, nombre: 'Inside Out' }, vacio)).toEqual({ id: IO, nombre: 'Inside Out', grupos: 0, porcentaje: null, insignias: [] })
  })
})

// ── The «Embudo de conexión» (L49) ──────────────────────────────────

describe('pasosEmbudo / vistaEtapa', () => {
  it('names the steps Sin grupo → En grupo → Sirviendo with their conversions', () => {
    const pasos = pasosEmbudo(leerEmbudo(embudoRpc())!)
    expect(pasos).toEqual([
      { id: 'sin_grupo', nombre: 'Sin grupo', definicion: 'Conocidos que hoy no están en un grupo', cantidad: 3, conversion: 25, conversionTexto: 'de los conocidos' },
      { id: 'en_grupo', nombre: 'En grupo', definicion: 'Miembros de un grupo activo', cantidad: 9, conversion: 75, conversionTexto: 'de los conocidos' },
      { id: 'sirviendo', nombre: 'Sirviendo', definicion: 'En un grupo y sirviendo en el Dream Team', cantidad: 1, conversion: 11.1, conversionTexto: 'de los que están en grupo' },
    ])
    expect(JSON.stringify(pasos)).not.toMatch(/Foyer|Kitchen|Living Room/)
  })

  it('has no conversion when nobody is known', () => {
    const vacio = leerEmbudo({ fecha: HOY, sin_grupo: { cantidad: 0, personas: [] }, en_grupo: { cantidad: 0, personas: [] }, sirviendo: { cantidad: 0, personas: [] } })!
    expect(pasosEmbudo(vacio).map((p) => p.conversion)).toEqual([null, null, null])
  })

  it('describes each step and its people', () => {
    const e = leerEmbudo(embudoRpc())!
    const sin = vistaEtapa(e, 'sin_grupo', 'Transit')
    expect(sin.titulo).toBe('Sin grupo')
    expect(sin.descripcion).toBe('Conocidos de Transit sin grupo: visitantes que todavía no son integrantes y fichas sin grupo. No cuenta a quienes egresaron.')
    expect(sin.filas.map((f) => [f.nombre, f.detalle, f.insignia, f.navegable])).toEqual([
      ['Sofía Linares', 'Visita 2do año · Chicas', 'Visitante', false],
      ['Abril Chacón', '1er año · sin grupo', 'Ficha', false],
      ['Joaquín Mena', 'Antes en 1er año · Chicos', null, false],
    ])
    const sirviendo = vistaEtapa(e, 'sirviendo', 'Transit · Grupos de Chicas')
    expect(sirviendo.descripcion).toBe('Integrantes de un grupo de Transit · Grupos de Chicas que además sirven en el Dream Team.')
    expect(sirviendo.filas).toEqual([{ personaId: 'p1', nombre: 'Ana Lucía Briceño', detalle: 'Sirve en Bienvenida · 1er año · Chicas', insignia: null, navegable: true }])
    expect(vistaEtapa(e, 'en_grupo', 'Transit').filas[0].detalle).toBe('1er año · Chicas · sirve en Bienvenida')
    expect(vistaEtapa(e, 'en_grupo', 'Transit').vacio).toEqual({ titulo: 'Nadie está en un grupo', subtitulo: 'No hay personas en este paso.' })
  })
})

// ── The detail drawers ──────────────────────────────────────────────

describe('vistaDetalleGrupo', () => {
  it('builds the meta, the unmarked callout, the figures, the trend and the meetings', () => {
    const v = vistaDetalleGrupo(leerDetalleGrupo(detalleGrupoRpc())!)
    expect(v.titulo).toBe('2do año · Chicas')
    expect(v.meta).toBe('Transit · Grupos de Chicas · Andrea Molina y Paola Ruiz')
    expect(v.sinMarcar).toEqual({ titulo: '1 reunión sin marcar', texto: 'Domingo 18 oct: nadie marcó la lista. No cuenta en el promedio.' })
    expect(v.datos).toEqual([
      { etiqueta: 'Reuniones', valor: '7' },
      { etiqueta: 'Promedio de presentes', valor: '5,5 de 1' },
      { etiqueta: 'Asistencia', valor: '46%' },
      { etiqueta: 'Visitantes nuevos', valor: '1' },
    ])
    expect(v.tendencia).toBe('Baja 17 puntos frente al período anterior (14 jul – 7 sep: 64%).')
    expect(v.reuniones).toEqual([
      { clave: '2026-11-01|r8', fecha: 'Domingo 1 nov', detalle: '7 presentes · 5 ausentes · 1 visitante', porcentaje: '58%', sinMarcar: false },
      { clave: '2026-10-18|', fecha: 'Domingo 18 oct', detalle: 'Nadie marcó la lista', porcentaje: null, sinMarcar: true },
    ])
    expect(v.integrantes).toEqual([{ personaId: 'p2', nombre: 'Camila Herrera', detalle: '38% · 3 de 8 · faltó 3 seguidas', seguidas: 3 }])
  })

  it('says the weekly day of a The Living Room group, "Sin líder" and no previous period', () => {
    const d = leerDetalleGrupo(
      detalleGrupoRpc({
        grupo: { grupo_id: 'g9', nombre: 'Zona Este · Chicos', ambito_id: TLR, ambito: 'The Living Room', subarea_id: CHICOS, subarea: 'Grupos de Chicos', anio: null, anio_etiqueta: null, dia_semana: 4, hora: '19:30:00', activo: true, lideres: [] },
        resumen: grupoRpc({ delta: null, porcentaje_previo: null, sin_marcar: 0, sin_marcar_fechas: [] }),
        reuniones: [{ fecha: '2026-10-29', reunion_id: 'r1', turno_id: null, turno: null, lugar: 'Casa de Gabriel Ortega', presentes: 8, ausentes: 2, visitantes: 0, porcentaje: 80, sin_marcar: false }],
      }),
    )!
    const v = vistaDetalleGrupo(d)
    expect(v.meta).toBe('The Living Room · Grupos de Chicos · Sin líder · cada jueves, 19:30')
    expect(v.sinMarcar).toBeNull()
    expect(v.tendencia).toBe('No hay reuniones del período anterior para comparar.')
    expect(v.reuniones[0].detalle).toBe('8 presentes · 2 ausentes · Casa de Gabriel Ortega')
  })
})

describe('vistaDetallePersona', () => {
  it('names the group on each meeting when the range spans two groups (L48)', () => {
    const v = vistaDetallePersona(leerDetallePersona(detallePersonaRpc())!, { ambito: 'Transit', lideres: ['Karla Mujica'], servicio: 'Bienvenida' })
    expect(v.titulo).toBe('Daniela Colmenares')
    expect(v.meta).toBe('3er año · Chicas · Transit')
    expect(v.grupoActual).toEqual({ grupoId: 'g4', nombre: '3er año · Chicas' })
    expect(v.alerta).toEqual({ titulo: 'Faltó las últimas 3 reuniones', texto: 'Vino por última vez el domingo 11 oct. Su líder: Karla Mujica.' })
    expect(v.datos).toEqual([
      { etiqueta: 'Asistencia', valor: '63%' },
      { etiqueta: 'Presentes', valor: '5 de 8' },
      { etiqueta: 'Faltas seguidas', valor: '3' },
      { etiqueta: 'Última vez', valor: '11 oct' },
    ])
    expect(v.nota).toBe('Pasó de 2do año · Chicas a 3er año · Chicas el 11 oct. Cuenta todas sus reuniones del 8 sep al 2 nov, en los dos grupos. Sirve en el Dream Team: Bienvenida.')
    expect(v.reuniones).toEqual([
      { clave: '2026-11-01|g4|r1', fecha: 'Domingo 1 nov', detalle: '3er año · Chicas · Domingo 9:00', estado: { tono: 'danger', etiqueta: 'Ausente' } },
      { clave: '2026-10-25|g4|r2', fecha: 'Domingo 25 oct', detalle: '3er año · Chicas · Domingo 9:00', estado: { tono: 'muted', etiqueta: 'Sin marcar' } },
      { clave: '2026-10-18|g4|', fecha: 'Domingo 18 oct', detalle: '3er año · Chicas', estado: { tono: 'muted', etiqueta: 'Nadie marcó' } },
      { clave: '2026-10-04|g2|r3', fecha: 'Domingo 4 oct', detalle: '2do año · Chicas · Domingo 9:00', estado: { tono: 'success', etiqueta: 'Presente' } },
    ])
  })

  it('leaves the group out of each meeting with one group and counts from the day they joined', () => {
    const d = leerDetallePersona(
      detallePersonaRpc({
        resumen: { reuniones: 2, presentes: 1, ausentes: 0, sin_marcar: 1, porcentaje: 100, ausencias_seguidas: 0, ultima_presente: '2026-11-01', grupos_en_rango: ['3er año · Chicas'] },
        membresias: [{ grupo_id: 'g4', grupo: '3er año · Chicas', ambito_id: TRANSIT, estado: 'miembro', desde: '2026-10-25', retirado_at: null, activo: true }],
        reuniones: [
          { fecha: '2026-11-01', grupo_id: 'g4', grupo: '3er año · Chicas', reunion_id: 'r1', turno_id: 't1', turno: 'Domingo 9:00', estado: 'presente' },
          { fecha: '2026-10-25', grupo_id: 'g4', grupo: '3er año · Chicas', reunion_id: 'r2', turno_id: null, turno: null, estado: 'sin_marcar' },
        ],
      }),
    )!
    const v = vistaDetallePersona(d, { ambito: 'Transit', lideres: [], servicio: null })
    expect(v.alerta).toBeNull()
    expect(v.nota).toBe('Cuenta desde que entró, el 25 oct. La reunión sin marcar no cuenta en el porcentaje.')
    expect(v.reuniones.map((r) => r.detalle)).toEqual(['Domingo 9:00', 'Reunión del grupo'])
  })
})
