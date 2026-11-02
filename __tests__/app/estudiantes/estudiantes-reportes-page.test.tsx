/**
 * /estudiantes/reportes (RSC, C6d3): who gets the screen (level >= 2 from
 * estudiantes_subareas_gestionables or estudiantes_mis_grupos, S19), which
 * campus, ámbito, sub-área and range open, which RPCs it asks (named
 * parameters, S20 order) and what it hands the client island. The Supabase
 * client is a double that answers each RPC by name and ámbito. Every name is
 * fictitious.
 */
import React from 'react'

const notFound = jest.fn(() => {
  throw new Error('NEXT_NOT_FOUND')
})
const redirect = jest.fn((to: string) => {
  throw new Error(`NEXT_REDIRECT:${to}`)
})
jest.mock('next/navigation', () => ({ notFound: () => notFound(), redirect: (to: string) => redirect(to) }))
jest.mock('@/lib/platform/ninos/fecha', () => ({ hoyEnCaracas: () => '2026-11-02' }))

type Respuesta = { data: unknown; error: null | { code?: string; message: string } }
const CAMPUS = 'c0000000-0000-4000-8000-000000000001'
const OTRO = 'c0000000-0000-4000-8000-000000000002'
const TRANSIT = 'a0000000-0000-4000-8000-000000000001'
const IO = 'a0000000-0000-4000-8000-000000000002'
const TLR = 'a0000000-0000-4000-8000-000000000003'
const T_CHICAS = 'b0000000-0000-4000-8000-000000000001'
const T_CHICOS = 'b0000000-0000-4000-8000-000000000002'
const IO_CHICAS = 'b0000000-0000-4000-8000-000000000003'
const TLR_CHICOS = 'b0000000-0000-4000-8000-000000000004'

let gestionables: Respuesta = { data: [], error: null }
let misGrupos: Respuesta = { data: [], error: null }
let asistencia: Record<string, Respuesta> = {}
let embudo: Respuesta = { data: null, error: null }
let campusTabla: { id: string; nombre: string }[] = []
const rpc = jest.fn(async (nombre: string, args?: { p_ambito_id?: string }) => {
  if (nombre === 'estudiantes_subareas_gestionables') return gestionables
  if (nombre === 'estudiantes_mis_grupos') return misGrupos
  if (nombre === 'estudiantes_reporte_asistencia') return asistencia[args?.p_ambito_id ?? ''] ?? { data: null, error: null }
  if (nombre === 'estudiantes_reporte_embudo') return embudo
  return { data: null, error: null }
})
const enCampus = jest.fn((_columna: string, ids: string[]) => Promise.resolve({ data: campusTabla.filter((c) => ids.includes(c.id)), error: null }))
const from = jest.fn((_tabla: string) => ({ select: () => ({ in: enCampus }) }))
let usuario: { id: string } | null = { id: 'auth-1' }

jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: usuario } }) },
    rpc: (nombre: string, args?: { p_ambito_id?: string }) => rpc(nombre, args),
    from: (tabla: string) => from(tabla),
  }),
}))

jest.mock('@/components/estudiantes/reportes/reportes-client', () => ({
  ReportesClient: (props: unknown) => <div data-props={JSON.stringify(props)} />,
}))

import EstudiantesReportesPage from '@/app/(auth)/estudiantes/reportes/page'

const gestionable = (ambito_id: string, ambito: string, subarea_id: string, subarea = 'Grupos de Chicas', experiencia = 'estudiantes') => ({
  subarea_id,
  subarea,
  ambito_id,
  ambito,
  experiencia,
  campus_id: CAMPUS,
  campus: 'Barquisimeto',
  responsables: [],
})

const reporte = (parche: Record<string, unknown> = {}) => ({
  desde: '2026-09-08',
  hasta: '2026-11-02',
  previo_desde: '2026-07-14',
  previo_hasta: '2026-09-07',
  subareas: [],
  resumen: { grupos: 1, reuniones: 8, presentes: 40, ausentes: 10, porcentaje: 80, visitantes: 2, sin_marcar: 0, personas: 5 },
  grupos: [],
  personas: [],
  ...parche,
})

const embudoOk = {
  fecha: '2026-11-02',
  sin_grupo: { cantidad: 0, personas: [] },
  en_grupo: { cantidad: 0, personas: [] },
  sirviendo: { cantidad: 0, personas: [] },
}

async function renderizar(searchParams: Record<string, string> = {}) {
  const elemento = (await EstudiantesReportesPage({ searchParams: Promise.resolve(searchParams) })) as React.ReactElement<Record<string, unknown>>
  return elemento.props as Record<string, unknown> & { ambitos: { id: string; nombre: string }[] }
}

const llamadas = (nombre: string) => rpc.mock.calls.filter(([n]) => n === nombre).map(([, args]) => args)

beforeEach(() => {
  rpc.mockClear()
  from.mockClear()
  enCampus.mockClear()
  notFound.mockClear()
  usuario = { id: 'auth-1' }
  gestionables = {
    data: [
      gestionable(TLR, 'The Living Room', TLR_CHICOS, 'Grupos de Chicos', 'the_living_room'),
      gestionable(IO, 'Inside Out', IO_CHICAS),
      gestionable(TRANSIT, 'Transit', T_CHICAS),
      gestionable(TRANSIT, 'Transit', T_CHICOS, 'Grupos de Chicos'),
    ],
    error: null,
  }
  misGrupos = { data: [], error: null }
  asistencia = {
    [TRANSIT]: { data: reporte(), error: null },
    [IO]: { data: reporte({ resumen: { grupos: 6, reuniones: 30, presentes: 60, ausentes: 40, porcentaje: 60, visitantes: 0, sin_marcar: 0, personas: 40 } }), error: null },
    [TLR]: { data: reporte(), error: null },
  }
  embudo = { data: embudoOk, error: null }
  campusTabla = []
})

describe('/estudiantes/reportes', () => {
  it('sends a visitor without a session to the login', async () => {
    usuario = null
    await expect(renderizar()).rejects.toThrow('NEXT_REDIRECT:/login')
  })

  it('answers not found to a leader (level 1) with nothing to report', async () => {
    gestionables = { data: [], error: null }
    misGrupos = { data: [{ grupo_id: 'g1', campus_id: CAMPUS, ambito_id: TRANSIT, ambito: 'Transit', experiencia: 'estudiantes', subarea_id: T_CHICAS, subarea: 'Grupos de Chicas', activo: true, puede_ver_vivo: false }], error: null }
    await expect(renderizar()).rejects.toThrow('NEXT_NOT_FOUND')
    expect(llamadas('estudiantes_reporte_asistencia')).toEqual([])
  })

  it('asks every ámbito in S20 order for the last 8 weeks and the funnel of the first', async () => {
    const props = await renderizar()
    expect(llamadas('estudiantes_reporte_asistencia')).toEqual([
      { p_ambito_id: TRANSIT, p_campus_id: CAMPUS, p_desde: '2026-09-08', p_hasta: '2026-11-02' },
      { p_ambito_id: IO, p_campus_id: CAMPUS, p_desde: '2026-09-08', p_hasta: '2026-11-02' },
      { p_ambito_id: TLR, p_campus_id: CAMPUS, p_desde: '2026-09-08', p_hasta: '2026-11-02' },
    ])
    expect(llamadas('estudiantes_reporte_embudo')).toEqual([{ p_ambito_id: TRANSIT, p_campus_id: CAMPUS }])
    expect(props.ambitos.map((a) => a.nombre)).toEqual(['Transit', 'Inside Out', 'The Living Room'])
    expect(props).toMatchObject({
      campus: [{ id: CAMPUS, nombre: 'Barquisimeto' }],
      campusId: CAMPUS,
      ambitoId: TRANSIT,
      subareaId: null,
      rango: { clave: '8sem', desde: '2026-09-08', hasta: '2026-11-02' },
      hoy: '2026-11-02',
      contenido: { tipo: 'reporte', reporte: { resumen: { porcentaje: 80 } } },
      embudo: { fecha: '2026-11-02' },
      errorEmbudo: null,
      filtrosIniciales: { tab: 'grupos', metrica: null },
      detalleInicial: { grupoId: null, personaId: null },
    })
    expect(from).not.toHaveBeenCalled()
  })

  it('opens the requested ámbito, sub-área, range, list filters and drawer', async () => {
    const G = 'e0000000-0000-4000-8000-000000000001'
    const props = await renderizar({ ambito: TRANSIT, subarea: T_CHICOS, desde: '2026-06-01', hasta: '2026-06-30', tab: 'personas', metrica: 'seguidas', grupo: G })
    expect(llamadas('estudiantes_reporte_asistencia')[0]).toEqual({ p_ambito_id: TRANSIT, p_campus_id: CAMPUS, p_desde: '2026-06-01', p_hasta: '2026-06-30', p_subarea_id: T_CHICOS })
    expect(llamadas('estudiantes_reporte_asistencia')[1]).not.toHaveProperty('p_subarea_id')
    expect(llamadas('estudiantes_reporte_embudo')).toEqual([{ p_ambito_id: TRANSIT, p_campus_id: CAMPUS, p_subarea_id: T_CHICOS }])
    expect(props).toMatchObject({ subareaId: T_CHICOS, rango: { clave: 'fechas' }, filtrosIniciales: { tab: 'personas', metrica: 'seguidas' }, detalleInicial: { grupoId: G, personaId: null } })
  })

  it('ignores a sub-área of another ámbito and an invalid range', async () => {
    const props = await renderizar({ ambito: IO, subarea: T_CHICAS, desde: '2026-06-30', hasta: '2026-06-01' })
    expect(llamadas('estudiantes_reporte_asistencia')[1]).toEqual({ p_ambito_id: IO, p_campus_id: CAMPUS, p_desde: '2026-09-08', p_hasta: '2026-11-02' })
    expect(props).toMatchObject({ ambitoId: IO, subareaId: null, rango: { clave: '8sem' } })
  })

  it('gives a The Living Room entrenador (level 2 through estudiantes_mis_grupos) the screen, with the campus name from `campus`', async () => {
    gestionables = { data: [], error: null }
    misGrupos = {
      data: [{ grupo_id: 'g9', campus_id: OTRO, ambito_id: TLR, ambito: 'The Living Room', experiencia: 'the_living_room', subarea_id: TLR_CHICOS, subarea: 'Grupos de Chicos', activo: true, puede_ver_vivo: true }],
      error: null,
    }
    campusTabla = [{ id: OTRO, nombre: 'Acarigua' }]
    const props = await renderizar()
    expect(from).toHaveBeenCalledWith('campus')
    expect(enCampus).toHaveBeenCalledWith('id', [OTRO])
    expect(llamadas('estudiantes_reporte_asistencia')).toEqual([{ p_ambito_id: TLR, p_campus_id: OTRO, p_desde: '2026-09-08', p_hasta: '2026-11-02' }])
    expect(props).toMatchObject({ campus: [{ id: OTRO, nombre: 'Acarigua' }], ambitoId: TLR })
  })

  it('leaves out the ámbitos that answer sin_autoridad and opens the first one left', async () => {
    asistencia[TRANSIT] = { data: null, error: { code: '42501', message: 'sin_autoridad' } }
    const props = await renderizar({ ambito: TRANSIT })
    expect(props.ambitos.map((a) => a.nombre)).toEqual(['Inside Out', 'The Living Room'])
    expect(props).toMatchObject({ ambitoId: IO, subareaId: null })
    expect(llamadas('estudiantes_reporte_embudo')).toEqual([{ p_ambito_id: IO, p_campus_id: CAMPUS }])
  })

  it('answers not found when every ámbito says sin_autoridad', async () => {
    for (const id of [TRANSIT, IO, TLR]) asistencia[id] = { data: null, error: { code: '42501', message: 'sin_autoridad' } }
    await expect(renderizar()).rejects.toThrow('NEXT_NOT_FOUND')
    expect(llamadas('estudiantes_reporte_embudo')).toEqual([])
  })

  it('hands other errors to the island in Spanish', async () => {
    asistencia[TRANSIT] = { data: null, error: { code: '22023', message: 'rango_invalido' } }
    embudo = { data: null, error: { code: 'XX000', message: 'boom' } }
    const errores = jest.spyOn(console, 'error').mockImplementation(() => {})
    const props = await renderizar()
    errores.mockRestore()
    expect(props).toMatchObject({
      contenido: { tipo: 'error', mensaje: 'Revisa las fechas: «Desde» debe ser anterior a «Hasta» y el rango no puede pasar de un año.' },
      embudo: null,
      errorEmbudo: 'No se pudo cargar el reporte. Recarga la página.',
    })
    expect(props.ambitos[0]).toEqual({ id: TRANSIT, nombre: 'Transit', grupos: 0, porcentaje: null, insignias: [] })
  })
})
