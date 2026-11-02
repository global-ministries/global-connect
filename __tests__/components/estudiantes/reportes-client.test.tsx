/**
 * `<ReportesClient>` — /estudiantes/reportes (C6d3 of
 * odd/tasks/estudiantes-fase-b.md, S17–S20, L48, L49; artboards 11 / 12).
 * The server actions and the router are mocked; each flow checks what the
 * screen shows and what it asks for. Without matchMedia the drawer is the
 * desktop side panel. Every person is fictitious.
 */
import React from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ReportesClient, type ReportesClientProps } from '@/components/estudiantes/reportes/reportes-client'
import { leerEmbudo, leerReporteAsistencia, type ReporteAsistencia } from '@/lib/platform/estudiantes/reportes'
import * as acciones from '@/lib/actions/estudiantes-reportes.actions'

jest.mock('@/lib/actions/estudiantes-reportes.actions', () => ({ detalleGrupoReporte: jest.fn(), detallePersonaReporte: jest.fn() }))

const replace = jest.fn()
const push = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push, refresh: jest.fn() }),
  usePathname: () => '/estudiantes/reportes',
}))

jest.mock('@/components/ui/desktop-header', () => ({
  DesktopHeader: ({ breadcrumbs }: { breadcrumbs?: React.ReactNode }) => <header>{breadcrumbs}</header>,
}))

jest.setTimeout(15_000)

const mock = acciones as jest.Mocked<typeof acciones>
const HOY = '2026-11-02'
const CAMPUS = 'c0000000-0000-4000-8000-000000000001'
const TRANSIT = 'a0000000-0000-4000-8000-000000000001'
const IO = 'a0000000-0000-4000-8000-000000000002'
const TLR = 'a0000000-0000-4000-8000-000000000003'
const CHICAS = 's0000000-0000-4000-8000-000000000001'
const CHICOS = 's0000000-0000-4000-8000-000000000002'
const G1 = 'g0000000-0000-4000-8000-000000000001'
const G2 = 'g0000000-0000-4000-8000-000000000002'
const P1 = 'p0000000-0000-4000-8000-000000000001'
const P2 = 'p0000000-0000-4000-8000-000000000002'

const grupo = (parche: Record<string, unknown>) => ({
  grupo_id: G1,
  nombre: '1er año · Chicas',
  subarea_id: CHICAS,
  subarea: 'Grupos de Chicas',
  anio: 1,
  anio_etiqueta: '1er año',
  lideres: ['Fernanda Ochoa'],
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

const persona = (parche: Record<string, unknown>) => ({
  persona_id: P1,
  nombre: 'Ana Lucía',
  apellido: 'Briceño',
  anio_etiqueta: '1er año',
  grupo_id: G1,
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

const reporteRpc = (parche: Record<string, unknown> = {}) => ({
  desde: '2026-09-08',
  hasta: HOY,
  previo_desde: '2026-07-14',
  previo_hasta: '2026-09-07',
  subareas: [
    { subarea_id: CHICAS, label: 'Grupos de Chicas', grupos: 2 },
    { subarea_id: CHICOS, label: 'Grupos de Chicos', grupos: 0 },
  ],
  resumen: { grupos: 2, reuniones: 15, presentes: 130, ausentes: 50, porcentaje: 72.2, visitantes: 5, sin_marcar: 1, personas: 2 },
  grupos: [
    grupo({}),
    grupo({ grupo_id: G2, nombre: '2do año · Chicas', anio: 2, lideres: ['Andrea Molina'], miembros: 12, reuniones: 7, porcentaje: 46.2, delta: -17.4, sin_marcar: 1, sin_marcar_fechas: ['2026-10-18'] }),
  ],
  personas: [
    persona({}),
    persona({ persona_id: P2, nombre: 'Daniela', apellido: 'Colmenares', grupo_id: G2, grupo: '2do año · Chicas', grupos_en_rango: ['1er año · Chicas', '2do año · Chicas'], porcentaje: 37.5, presentes: 3, ausentes: 5, ausencias_seguidas: 3, ultima_presente: '2026-10-11' }),
  ],
  ...parche,
})

const embudo = leerEmbudo({
  fecha: HOY,
  sin_grupo: {
    cantidad: 2,
    personas: [
      { persona_id: 'f0000000-0000-4000-8000-000000000001', nombre: 'Sofía', apellido: 'Linares', tipo: 'visitante', grupo: '2do año · Chicas', anio_etiqueta: '2do año' },
      { persona_id: 'f0000000-0000-4000-8000-000000000002', nombre: 'Abril', apellido: 'Chacón', tipo: 'ficha', grupo: null, anio_etiqueta: '1er año' },
    ],
  },
  en_grupo: {
    cantidad: 2,
    personas: [
      { persona_id: P1, nombre: 'Ana Lucía', apellido: 'Briceño', grupo_id: G1, grupo: '1er año · Chicas', servicio: 'Bienvenida' },
      { persona_id: P2, nombre: 'Daniela', apellido: 'Colmenares', grupo_id: G2, grupo: '2do año · Chicas', servicio: null },
    ],
  },
  sirviendo: { cantidad: 1, personas: [{ persona_id: P1, nombre: 'Ana Lucía', apellido: 'Briceño', grupo_id: G1, grupo: '1er año · Chicas', servicio: 'Bienvenida' }] },
})!

const ambitos: ReportesClientProps['ambitos'] = [
  { id: TRANSIT, nombre: 'Transit', grupos: 2, porcentaje: 72.2, insignias: [{ texto: '1 grupo bajo 50%', tono: 'warning' }] },
  { id: IO, nombre: 'Inside Out', grupos: 6, porcentaje: 64, insignias: [] },
  { id: TLR, nombre: 'The Living Room', grupos: 6, porcentaje: null, insignias: [] },
]

const props = (parche: Partial<ReportesClientProps> = {}, reporte: ReporteAsistencia = leerReporteAsistencia(reporteRpc())!): ReportesClientProps => ({
  campus: [{ id: CAMPUS, nombre: 'Barquisimeto' }],
  campusId: CAMPUS,
  ambitos,
  ambitoId: TRANSIT,
  subareaId: null,
  rango: { clave: '8sem', desde: '2026-09-08', hasta: HOY },
  hoy: HOY,
  contenido: { tipo: 'reporte', reporte },
  embudo,
  ...parche,
})

const detalleGrupo = {
  grupo: { grupoId: G2, nombre: '2do año · Chicas', ambitoId: TRANSIT, ambito: 'Transit', subarea: 'Grupos de Chicas', anioEtiqueta: '2do año', diaSemana: null, hora: null, lideres: ['Andrea Molina'] },
  desde: '2026-09-08',
  hasta: HOY,
  resumen: { reuniones: 7, reunionesEsperadas: 8, sinMarcar: 1, sinMarcarFechas: ['2026-10-18'], presentes: 40, ausentes: 30, visitantes: 1, promedioPresentes: 5.7, porcentaje: 46.2, reunionesPrevias: 8, porcentajePrevio: 63.6, delta: -17.4 },
  reuniones: [
    { fecha: '2026-11-01', reunionId: 'r1', turno: 'Domingo 9:00', lugar: null, presentes: 7, ausentes: 5, visitantes: 1, porcentaje: 58.3, sinMarcar: false },
    { fecha: '2026-10-18', reunionId: null, turno: null, lugar: null, presentes: 0, ausentes: 0, visitantes: 0, porcentaje: null, sinMarcar: true },
  ],
  integrantes: [
    { personaId: P2, nombre: 'Daniela Colmenares', miembroDesde: '2026-10-11', reuniones: 8, presentes: 3, ausentes: 5, sinMarcar: 0, porcentaje: 37.5, ausenciasSeguidas: 3, ultimaPresente: '2026-10-11', gruposEnRango: [] },
  ],
}

const detallePersona = {
  persona: { personaId: P2, nombre: 'Daniela Colmenares', anioEtiqueta: '2do año', egresado: false },
  desde: '2026-09-08',
  hasta: HOY,
  resumen: { reuniones: 8, presentes: 3, ausentes: 5, sinMarcar: 0, porcentaje: 37.5, ausenciasSeguidas: 3, ultimaPresente: '2026-10-11', gruposEnRango: ['1er año · Chicas', '2do año · Chicas'] },
  membresias: [
    { grupoId: G1, grupo: '1er año · Chicas', desde: '2026-07-12', retiradoAt: '2026-10-11T14:00:00+00:00', activo: false },
    { grupoId: G2, grupo: '2do año · Chicas', desde: '2026-10-11', retiradoAt: null, activo: true },
  ],
  reuniones: [
    { fecha: '2026-11-01', grupoId: G2, grupo: '2do año · Chicas', reunionId: 'r1', turno: 'Domingo 9:00', estado: 'ausente' as const },
    { fecha: '2026-10-04', grupoId: G1, grupo: '1er año · Chicas', reunionId: 'r0', turno: 'Domingo 9:00', estado: 'presente' as const },
  ],
}

beforeEach(() => {
  replace.mockReset()
  push.mockReset()
  mock.detalleGrupoReporte.mockReset()
  mock.detallePersonaReporte.mockReset()
  window.history.replaceState(null, '', '/estudiantes/reportes')
})

describe('the screen', () => {
  it('shows the hero, the ámbitos in S20 order, the funnel steps of L49 and the groups', () => {
    render(<ReportesClient {...props()} />)
    expect(screen.getAllByText('Reportes de asistencia').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Barquisimeto · Transit · 8 sep – 2 nov/).length).toBeGreaterThan(0)
    const tarjetas = within(screen.getByRole('group', { name: 'Ámbitos' })).getAllByRole('button')
    expect(tarjetas.map((b) => b.textContent)).toEqual([expect.stringContaining('Transit'), expect.stringContaining('Inside Out'), expect.stringContaining('The Living Room')])
    expect(tarjetas[0]).toHaveAttribute('aria-pressed', 'true')

    const pasos = within(screen.getByRole('list', { name: 'Embudo de conexión' })).getAllByRole('button')
    expect(pasos.map((b) => b.getAttribute('aria-label'))).toEqual([
      expect.stringMatching(/^Sin grupo: 2 personas, conocidos que hoy no están en un grupo\. 50% de los conocidos/),
      expect.stringMatching(/^En grupo: 2 personas/),
      expect.stringMatching(/^Sirviendo: 1 persona, en un grupo y sirviendo en el Dream Team\. 50% de los que están en grupo/),
    ])
    expect(document.body.textContent).not.toMatch(/Foyer|Kitchen/)

    expect(screen.getByRole('tab', { name: /Grupos 2/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getAllByText('2do año · Chicas').length).toBeGreaterThan(0)
    expect(screen.getAllByRole('img', { name: 'Baja 17 puntos frente al período anterior' }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('img', { name: 'Sube 4 puntos frente al período anterior' }).length).toBeGreaterThan(0)
    expect(screen.getByRole('status')).toHaveTextContent('2 de 2 grupos · 26 integrantes')
  })

  it('filters with one attention pill, a second tap clears it, and the URL follows', async () => {
    const user = userEvent.setup()
    render(<ReportesClient {...props()} />)
    await user.click(screen.getByRole('button', { name: /Asistencia baja \(<50%\) 1/ }))
    expect(screen.getByRole('status')).toHaveTextContent('1 de 2 grupos')
    expect(window.location.search).toContain('metrica=baja')
    await user.click(screen.getByRole('button', { name: /Asistencia baja \(<50%\) 1/ }))
    expect(screen.getByRole('status')).toHaveTextContent('2 de 2 grupos')
    expect(window.location.search).not.toContain('metrica')
  })

  it('lists people with "Antes en" after a move and the 3+ absences', async () => {
    const user = userEvent.setup()
    render(<ReportesClient {...props()} />)
    await user.click(screen.getByRole('tab', { name: /Personas 2/ }))
    expect(screen.getAllByText('Antes en 1er año · Chicas').length).toBeGreaterThan(0)
    expect(screen.getAllByText('3 seguidas').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /Faltan 3\+ seguidas 1/ })).toBeInTheDocument()
    expect(window.location.search).toContain('tab=personas')
  })

  it('reloads the data for another range or ámbito', async () => {
    const user = userEvent.setup()
    render(<ReportesClient {...props({ subareaId: CHICAS })} />)
    await user.click(within(screen.getByRole('group', { name: 'Rango de fechas' })).getByRole('button', { name: 'Este mes' }))
    expect(replace).toHaveBeenLastCalledWith(`/estudiantes/reportes?ambito=${TRANSIT}&subarea=${CHICAS}&rango=mes`, { scroll: false })
    await user.click(within(screen.getByRole('group', { name: 'Ámbitos' })).getByRole('button', { name: /Inside Out/ }))
    expect(replace).toHaveBeenLastCalledWith(`/estudiantes/reportes?ambito=${IO}`, { scroll: false })
    replace.mockClear()
    await user.click(within(screen.getByRole('group', { name: 'Ámbitos' })).getByRole('button', { name: /Transit/ }))
    expect(replace).not.toHaveBeenCalled()
  })

  it('says when the range has no meetings and offers the default range', async () => {
    const user = userEvent.setup()
    const vacio = leerReporteAsistencia(
      reporteRpc({ resumen: { grupos: 1, reuniones: 0, presentes: 0, ausentes: 0, porcentaje: null, visitantes: 0, sin_marcar: 0, personas: 0 }, grupos: [grupo({ reuniones: 0, presentes: 0, ausentes: 0, porcentaje: null, delta: null })], personas: [] }),
    )!
    render(<ReportesClient {...props({ rango: { clave: 'fechas', desde: '2026-06-01', hasta: '2026-06-30' } }, vacio)} />)
    expect(screen.getAllByText(/sin reuniones en este rango/).length).toBeGreaterThan(0)
    expect(screen.getByText('No hay reuniones en este rango')).toBeInTheDocument()
    expect(screen.getByText('Del 1 jun al 30 jun ningún grupo de Transit marcó asistencia.')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Necesitan atención' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Quitar 1 jun – 30 jun' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Ver las últimas 8 semanas' }))
    expect(replace).toHaveBeenLastCalledWith(`/estudiantes/reportes?ambito=${TRANSIT}`, { scroll: false })
  })

  it('hides the ámbito cards and the sub-área filter for a fixed scope (the entrenadora)', async () => {
    const user = userEvent.setup()
    const soloChicas = leerReporteAsistencia(reporteRpc({ subareas: [{ subarea_id: CHICAS, label: 'Grupos de Chicas', grupos: 2 }] }))!
    render(<ReportesClient {...props({ ambitos: [ambitos[0]] }, soloChicas)} />)
    expect(screen.queryByRole('group', { name: 'Ámbitos' })).not.toBeInTheDocument()
    expect(screen.getAllByText(/Barquisimeto · Transit · Grupos de Chicas · 8 sep – 2 nov/).length).toBeGreaterThan(0)
    await user.click(screen.getAllByRole('button', { name: 'Filtros' })[0])
    const hoja = await screen.findByRole('dialog')
    expect(within(hoja).queryByText('Sub-área')).not.toBeInTheDocument()
    expect(within(hoja).getByText('Rango de fechas')).toBeInTheDocument()
  })

  it('applies a valid custom range from the sheet and explains an invalid one', async () => {
    const user = userEvent.setup()
    render(<ReportesClient {...props()} />)
    await user.click(screen.getByRole('button', { name: 'Elegir fechas' }))
    const hoja = await screen.findByRole('dialog')
    const desde = within(hoja).getByLabelText('Desde')
    await user.clear(desde)
    await user.type(desde, '2026-11-05')
    expect(within(hoja).getByText('Revisa las fechas: «Desde» debe ser anterior a «Hasta».')).toBeInTheDocument()
    expect(replace).not.toHaveBeenCalled()
    await user.clear(desde)
    await user.type(desde, '2026-10-01')
    expect(replace).toHaveBeenLastCalledWith(`/estudiantes/reportes?ambito=${TRANSIT}&desde=2026-10-01&hasta=${HOY}`, { scroll: false })
  })
})

describe('the drawer', () => {
  it('loads a group, then one of its members with the group of each meeting (L48), and goes back', async () => {
    const user = userEvent.setup()
    mock.detalleGrupoReporte.mockResolvedValue({ ok: true, data: detalleGrupo })
    mock.detallePersonaReporte.mockResolvedValue({ ok: true, data: detallePersona })
    render(<ReportesClient {...props()} />)

    await user.click(screen.getByRole('button', { name: 'Abrir 2do año · Chicas' }))
    expect(mock.detalleGrupoReporte).toHaveBeenCalledWith({ grupoId: G2, desde: '2026-09-08', hasta: HOY })
    const panel = await screen.findByRole('dialog')
    expect(await within(panel).findByText('1 reunión sin marcar')).toBeInTheDocument()
    expect(within(panel).getByText('Baja 17 puntos frente al período anterior (14 jul – 7 sep: 64%).')).toBeInTheDocument()
    expect(within(panel).getByText('7 presentes · 5 ausentes · 1 visitante')).toBeInTheDocument()
    expect(within(panel).getByText('Sin marcar')).toBeInTheDocument()
    expect(window.location.search).toContain(`grupo=${G2}`)

    await user.click(within(panel).getByRole('button', { name: 'Ver la asistencia de Daniela Colmenares' }))
    expect(mock.detallePersonaReporte).toHaveBeenCalledWith({ personaId: P2, ambitoId: TRANSIT, desde: '2026-09-08', hasta: HOY })
    expect(await within(panel).findByText('Faltó las últimas 3 reuniones')).toBeInTheDocument()
    expect(within(panel).getByText('Vino por última vez el domingo 11 oct. Su líder: Andrea Molina.')).toBeInTheDocument()
    expect(within(panel).getByText('2do año · Chicas · Domingo 9:00')).toBeInTheDocument()
    expect(within(panel).getByText('1er año · Chicas · Domingo 9:00')).toBeInTheDocument()
    expect(within(panel).getByText('Presente')).toBeInTheDocument()
    // Opened from its own group: no "Ver 2do año · Chicas".
    expect(within(panel).queryByRole('button', { name: 'Ver 2do año · Chicas' })).not.toBeInTheDocument()
    expect(window.location.search).toContain(`persona=${P2}`)

    await user.click(within(panel).getByRole('button', { name: 'Volver a 2do año · Chicas' }))
    expect(await within(panel).findByText('1 reunión sin marcar')).toBeInTheDocument()
    expect(mock.detalleGrupoReporte).toHaveBeenCalledTimes(1)
  })

  it('says why a detail could not load and retries', async () => {
    const user = userEvent.setup()
    mock.detallePersonaReporte.mockResolvedValueOnce({ ok: false, message: 'No tienes acceso a los reportes de este ámbito.', codigo: 'sin_autoridad' })
    mock.detallePersonaReporte.mockResolvedValueOnce({ ok: true, data: detallePersona })
    render(<ReportesClient {...props({ detalleInicial: { grupoId: null, personaId: P2 } })} />)
    const panel = await screen.findByRole('dialog')
    expect(await within(panel).findByRole('alert')).toHaveTextContent('No tienes acceso a los reportes de este ámbito.')
    await user.click(within(panel).getByRole('button', { name: 'Reintentar' }))
    expect(await within(panel).findByRole('heading', { name: 'Reunión por reunión · 2' })).toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: 'Ver 2do año · Chicas' })).toBeInTheDocument()
  })

  it('lists a funnel step: Sin grupo rows open nothing, En grupo rows open the person', async () => {
    const user = userEvent.setup()
    mock.detallePersonaReporte.mockResolvedValue({ ok: true, data: detallePersona })
    render(<ReportesClient {...props()} />)

    await user.click(screen.getByRole('button', { name: /^Sin grupo: 2 personas/ }))
    let panel = await screen.findByRole('dialog')
    expect(within(panel).getByRole('heading', { name: 'Sin grupo · 2' })).toBeInTheDocument()
    expect(within(panel).getByText('Visitante')).toBeInTheDocument()
    expect(within(panel).getByText('Ficha')).toBeInTheDocument()
    expect(within(panel).queryByRole('button', { name: /Ver la asistencia/ })).not.toBeInTheDocument()

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /^En grupo: 2 personas/ }))
    panel = await screen.findByRole('dialog')
    expect(within(panel).getByText('1er año · Chicas · sirve en Bienvenida')).toBeInTheDocument()
    await user.click(within(panel).getByRole('button', { name: 'Ver la asistencia de Daniela Colmenares' }))
    expect(await within(panel).findByRole('button', { name: 'Volver a En grupo' })).toBeInTheDocument()
  })
})
