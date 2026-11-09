/**
 * `<ReportesClient>` for The Living Room — the 4 connections (C7c of
 * odd/tasks/estudiantes-fase-b.md, S21 with L54 / L55; artboards 13 / 14,
 * A35–A47): the extra Personas columns and pill, and the «Conexiones» cards
 * of the person drawer, loaded through a server action. Transit and Inside
 * Out stay as in reportes-client.test.tsx. The server actions and the router
 * are mocked; without matchMedia the drawer is the desktop side panel. Every
 * person is fictitious.
 */
import React from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ReportesClient, type ReportesClientProps } from '@/components/estudiantes/reportes/reportes-client'
import { leerConexionesPersona, leerReporteConexiones } from '@/lib/platform/estudiantes/conexiones'
import { leerEmbudo, leerReporteAsistencia } from '@/lib/platform/estudiantes/reportes'
import * as acciones from '@/lib/actions/estudiantes-reportes.actions'

jest.mock('@/lib/actions/estudiantes-reportes.actions', () => ({ detalleGrupoReporte: jest.fn(), detallePersonaReporte: jest.fn(), conexionesPersonaReporte: jest.fn() }))

const replace = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: jest.fn(), refresh: jest.fn() }),
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
const TLR = 'a0000000-0000-4000-8000-000000000003'
const CHICAS = 's0000000-0000-4000-8000-000000000001'
const G1 = 'g0000000-0000-4000-8000-000000000001'
const P1 = 'p0000000-0000-4000-8000-000000000001'
const P2 = 'p0000000-0000-4000-8000-000000000002'

const persona = (parche: Record<string, unknown>) => ({
  persona_id: P1,
  nombre: 'Lucía',
  apellido: 'Mendoza',
  anio_etiqueta: null,
  grupo_id: G1,
  grupo: 'Zona Este · Chicas',
  miembro_desde: '2026-02-10',
  reuniones: 8,
  presentes: 7,
  ausentes: 1,
  sin_marcar: 0,
  porcentaje: 87.5,
  ausencias_seguidas: 0,
  ultima_presente: '2026-10-29',
  grupos_en_rango: ['Zona Este · Chicas'],
  ...parche,
})

const reporte = leerReporteAsistencia({
  desde: '2026-09-08',
  hasta: HOY,
  previo_desde: '2026-07-14',
  previo_hasta: '2026-09-07',
  subareas: [{ subarea_id: CHICAS, label: 'Grupos de Chicas', grupos: 1 }],
  resumen: { grupos: 1, reuniones: 8, presentes: 11, ausentes: 5, porcentaje: 68.8, visitantes: 0, sin_marcar: 0, personas: 2 },
  grupos: [
    {
      grupo_id: G1,
      nombre: 'Zona Este · Chicas',
      subarea_id: CHICAS,
      subarea: 'Grupos de Chicas',
      dia_semana: 4,
      hora: '19:30',
      lideres: ['Carla Suárez'],
      miembros: 2,
      reuniones: 8,
      reuniones_esperadas: 8,
      sin_marcar: 0,
      sin_marcar_fechas: [],
      presentes: 11,
      ausentes: 5,
      visitantes: 0,
      promedio_presentes: 1.4,
      porcentaje: 68.8,
      reuniones_previas: 8,
      porcentaje_previo: 70,
      delta: -1.2,
    },
  ],
  personas: [persona({}), persona({ persona_id: P2, nombre: 'Paola', apellido: 'Rangel', presentes: 4, ausentes: 4, porcentaje: 50 })],
})!

const conexionLucia = {
  persona_id: P1,
  nombre: 'Lucía',
  apellido: 'Mendoza',
  grupo_id: G1,
  grupo: 'Zona Este · Chicas',
  lider: { realizados: 3, por_semana: 0.4, ultimo: '2026-10-21', ultimo_con: 'Carla Suárez', lideres: ['Carla Suárez'], desconectado: false },
  otros: {
    grupo: { reuniones: 8, presentes: 7, ausentes: 1, sin_marcar: 0, porcentaje: 87.5 },
    sirve: true,
    servicios: [{ servicio_id: 'sv1', equipo: 'Luces', area: 'Producción', rol: 'Servidor', esperadas: 4, presentes: 3, justificados: 1, ausentes: 0, porcentaje: 75 }],
  },
  iglesia: { talleres: 2, lista: [{ taller: 'Fundamentos', fecha: '2025-06-20', anio: 2025 }, { taller: 'Identidad', fecha: '2026-03-14', anio: 2026 }] },
  jesus: { registrado: false },
}

const conexionPaola = {
  persona_id: P2,
  nombre: 'Paola',
  apellido: 'Rangel',
  grupo_id: G1,
  grupo: 'Zona Este · Chicas',
  lider: { realizados: 0, por_semana: 0, ultimo: '2026-08-13', ultimo_con: 'Carla Suárez', lideres: ['Carla Suárez'], desconectado: true },
  otros: { grupo: { reuniones: 8, presentes: 4, ausentes: 4, sin_marcar: 0, porcentaje: 50 }, sirve: false, servicios: [] },
  iglesia: { talleres: 0, lista: [] },
  jesus: { registrado: false },
}

const conexionesRpc = {
  ambito_id: TLR,
  campus_id: CAMPUS,
  desde: '2026-09-08',
  hasta: HOY,
  semanas: 8,
  desconectado_si_antes_de: '2026-09-03',
  resumen: { personas: 2, desconectados: 1, sin_servicio: 1, con_talleres: 1 },
  personas: [conexionLucia, conexionPaola],
}

const embudo = leerEmbudo({ fecha: HOY, sin_grupo: { cantidad: 0, personas: [] }, en_grupo: { cantidad: 2, personas: [] }, sirviendo: { cantidad: 1, personas: [] } })!

const props = (parche: Partial<ReportesClientProps> = {}): ReportesClientProps => ({
  campus: [{ id: CAMPUS, nombre: 'Barquisimeto' }],
  campusId: CAMPUS,
  ambitos: [
    { id: TRANSIT, nombre: 'Transit', grupos: 2, porcentaje: 72.2, insignias: [] },
    { id: TLR, nombre: 'The Living Room', grupos: 1, porcentaje: 68.8, insignias: [] },
  ],
  ambitoId: TLR,
  subareaId: null,
  rango: { clave: '8sem', desde: '2026-09-08', hasta: HOY },
  hoy: HOY,
  contenido: { tipo: 'reporte', reporte },
  embudo,
  livingRoom: true,
  conexiones: leerReporteConexiones(conexionesRpc),
  filtrosIniciales: { tab: 'personas', metrica: null, ordenGrupos: 'anio', ordenPersonas: 'nombre', q: '' },
  ...parche,
})

const detallePersona = (personaId: string, nombre: string) => ({
  persona: { personaId, nombre, anioEtiqueta: null, egresado: false },
  desde: '2026-09-08',
  hasta: HOY,
  resumen: { reuniones: 8, presentes: 4, ausentes: 4, sinMarcar: 0, porcentaje: 50, ausenciasSeguidas: 0, ultimaPresente: '2026-10-29', gruposEnRango: ['Zona Este · Chicas'] },
  membresias: [{ grupoId: G1, grupo: 'Zona Este · Chicas', desde: '2026-02-10', retiradoAt: null, activo: true }],
  reuniones: [{ fecha: '2026-10-29', grupoId: G1, grupo: 'Zona Este · Chicas', reunionId: 'r1', turno: null, estado: 'presente' as const }],
})

beforeEach(() => {
  replace.mockReset()
  mock.detalleGrupoReporte.mockReset()
  mock.detallePersonaReporte.mockReset()
  mock.conexionesPersonaReporte.mockReset()
  window.history.replaceState(null, '', '/estudiantes/reportes')
})

describe('the Personas tab of The Living Room', () => {
  it('adds the 1:1, Servicio and Talleres columns, the «Sin 1:1» chip and its pill (L55)', async () => {
    const user = userEvent.setup()
    render(<ReportesClient {...props()} />)
    const tabla = screen.getByRole('table', { name: 'Asistencia por persona' })
    for (const nombre of [/^1:1/, /^Servicio/, /^Talleres/]) expect(within(tabla).getByRole('columnheader', { name: nombre })).toBeInTheDocument()
    expect(within(tabla).getAllByText('Sin 1:1').length).toBeGreaterThan(0)
    expect(within(tabla).getByText('No sirve')).toBeInTheDocument()
    expect(within(tabla).getByText('Ninguno')).toBeInTheDocument()
    expect(within(tabla).getAllByText('3 de 4').length).toBeGreaterThan(0)
    // D8: the Grupo stays under the name, no Grupo column.
    expect(within(tabla).queryByRole('columnheader', { name: /^Grupo/ })).not.toBeInTheDocument()
    expect(within(tabla).getAllByText(/^Zona Este · Chicas/).length).toBeGreaterThan(0)
    expect(screen.getByRole('status')).toHaveTextContent('2 de 2 personas · grupo, 1:1 y servicio cuentan en el rango; talleres, en total')

    const pastillas = within(screen.getByRole('group', { name: 'Necesitan atención' })).getAllByRole('button')
    expect(pastillas[1]).toHaveTextContent('Sin 1:1 en 2 meses')
    await user.click(pastillas[1])
    expect(screen.getByRole('status')).toHaveTextContent('1 de 2 personas')
    expect(window.location.search).toContain('metrica=sin11')
    expect(screen.getByRole('button', { name: 'Ver las conexiones de Paola Rangel' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ver las conexiones de Lucía Mendoza' })).not.toBeInTheDocument()
  })

  it('sorts by the connection columns from the table header', async () => {
    const user = userEvent.setup()
    render(<ReportesClient {...props()} />)
    const tabla = screen.getByRole('table', { name: 'Asistencia por persona' })
    await user.click(within(tabla).getByRole('button', { name: /^Servicio/ }))
    expect(within(tabla).getByRole('columnheader', { name: /^Servicio/ })).toHaveAttribute('aria-sort', 'ascending')
    expect(window.location.search).toContain('orden=servicio')
    expect(screen.getByText('Orden: servicio más bajo primero (sin servicio al final)')).toBeInTheDocument()
  })

  it('keeps the attendance columns when the connections did not load (fail soft)', () => {
    render(<ReportesClient {...props({ conexiones: null })} />)
    const tabla = screen.getByRole('table', { name: 'Asistencia por persona' })
    expect(within(tabla).queryByRole('columnheader', { name: /^1:1/ })).not.toBeInTheDocument()
    expect(within(tabla).getByRole('columnheader', { name: /^Presentes/ })).toBeInTheDocument()
    expect(screen.queryByText('Sin 1:1 en 2 meses')).not.toBeInTheDocument()
  })

  it('never shows the plan names or voseo (L49)', () => {
    render(<ReportesClient {...props()} />)
    expect(document.body.textContent).not.toMatch(/Foyer|Kitchen|\bacá\b|\bvos\b/)
  })
})

describe('The Living Room on a phone (artboard 16)', () => {
  const original = window.matchMedia
  beforeEach(() => {
    window.matchMedia = jest.fn().mockImplementation((consulta: string) => ({
      matches: false,
      media: consulta,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    })) as unknown as typeof window.matchMedia
  })
  afterEach(() => {
    window.matchMedia = original
  })

  it('tags each person row with its connections (A40) and has no scope bar', () => {
    render(<ReportesClient {...props()} />)
    expect(screen.queryByRole('complementary', { name: 'Ámbito y embudo' })).not.toBeInTheDocument()
    const tabla = screen.getByRole('table', { name: 'Asistencia por persona' })
    expect(within(tabla).getByText('3 · 1:1')).toBeInTheDocument()
    expect(within(tabla).getByText('Sirve 75%')).toBeInTheDocument()
    expect(within(tabla).getByText('2 talleres')).toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'Ámbito' })).getByRole('button', { name: /The Living Room/ })).toHaveAttribute('aria-pressed', 'true')
    expect(within(screen.getByRole('list', { name: 'Embudo de conexión' })).getAllByRole('button')).toHaveLength(3)
  })

  it('offers the connection sorts in the filters sheet', async () => {
    const user = userEvent.setup()
    render(<ReportesClient {...props()} />)
    // The nav bar's Filtros (the toolbar's own one hides below md).
    await user.click(screen.getAllByRole('button', { name: 'Filtros' })[0])
    const hoja = await screen.findByRole('dialog')
    // The bottom sheet (vaul) needs pointer capture, which jsdom lacks: a plain click.
    fireEvent.click(within(hoja).getByRole('button', { name: 'Servicio más bajo' }))
    expect(window.location.search).toContain('orden=servicio')
  })
})

describe('the docked person panel of The Living Room (S7, from 1280px)', () => {
  const original = window.matchMedia
  beforeEach(() => {
    window.matchMedia = jest.fn().mockImplementation((consulta: string) => ({
      matches: true,
      media: consulta,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    })) as unknown as typeof window.matchMedia
  })
  afterEach(() => {
    window.matchMedia = original
  })

  it('folds the scope bar while open and repeats the ámbito and the range in its header', async () => {
    const user = userEvent.setup()
    mock.detallePersonaReporte.mockResolvedValue({ ok: true, data: detallePersona(P1, 'Lucía Mendoza') })
    mock.conexionesPersonaReporte.mockResolvedValue({ ok: true, data: leerConexionesPersona(conexionesRpc, P1)! })
    render(<ReportesClient {...props()} />)
    expect(screen.getByRole('complementary', { name: 'Ámbito y embudo' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Ver las conexiones de Lucía Mendoza' }))
    const panel = await screen.findByRole('complementary', { name: 'Lucía Mendoza' })
    expect(within(panel).getByText('The Living Room · Últimas 8 semanas · 8 sep – 2 nov')).toBeInTheDocument()
    expect(screen.queryByRole('complementary', { name: 'Ámbito y embudo' })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.click(within(panel).getByRole('button', { name: 'Cerrar' }))
    expect(screen.getByRole('complementary', { name: 'Ámbito y embudo' })).toBeInTheDocument()
  })
})

describe('the person drawer of The Living Room', () => {
  it('loads the «Conexiones» cards with the campus and shows what is not recorded yet', async () => {
    const user = userEvent.setup()
    mock.detallePersonaReporte.mockResolvedValue({ ok: true, data: detallePersona(P1, 'Lucía Mendoza') })
    mock.conexionesPersonaReporte.mockResolvedValue({ ok: true, data: leerConexionesPersona(conexionesRpc, P1)! })
    render(<ReportesClient {...props()} />)

    await user.click(screen.getByRole('button', { name: 'Ver las conexiones de Lucía Mendoza' }))
    expect(mock.conexionesPersonaReporte).toHaveBeenCalledWith({ personaId: P1, ambitoId: TLR, campusId: CAMPUS, desde: '2026-09-08', hasta: HOY })
    const panel = await screen.findByRole('dialog')
    const seccion = await within(panel).findByRole('region', { name: 'Conexiones' })
    expect(within(seccion).getByText('8 sep – 2 nov · talleres en total')).toBeInTheDocument()
    const tarjetas = within(seccion).getAllByRole('article')
    expect(tarjetas.map((t) => within(t).getByRole('heading').textContent)).toEqual(['Con su líder', 'Con otros', 'Con la Iglesia', 'Con Jesús'])

    const lider = within(seccion).getByRole('article', { name: 'Con su líder' })
    expect(within(lider).getByText('1:1 realizados en el rango')).toBeInTheDocument()
    expect(within(lider).getByText('0,4')).toBeInTheDocument()
    expect(within(lider).getByText('21 oct · hace 1 semana')).toBeInTheDocument()
    expect(within(lider).getByText('Los temas del 1:1 todavía no se registran.')).toBeInTheDocument()
    expect(within(lider).queryByText('Sin 1:1 en 2 meses')).not.toBeInTheDocument()

    const otros = within(seccion).getByRole('article', { name: 'Con otros' })
    expect(within(otros).getByText('Producción · Luces')).toBeInTheDocument()
    // A justificado is shown apart, never as a presente (O6).
    expect(within(otros).getByText('3 de 4 fechas · 1 justificada')).toBeInTheDocument()
    expect(within(otros).getByText('7 de 8 reuniones')).toBeInTheDocument()

    const iglesia = within(seccion).getByRole('article', { name: 'Con la Iglesia' })
    expect(within(within(iglesia).getByRole('list', { name: 'Talleres completados' })).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Fundamentos2025', 'Identidad2026'])
    expect(within(iglesia).getByText('Retiros, CGL e Irresistibles')).toBeInTheDocument()
    expect(within(iglesia).getByText('Aún no se registran.')).toBeInTheDocument()

    const jesus = within(seccion).getByRole('article', { name: 'Con Jesús' })
    expect(within(jesus).getByText('Aún no se registra')).toBeInTheDocument()
    expect(within(jesus).getByText('Las disciplinas privadas que su líder conversa en el 1:1 todavía no se guardan en la app.')).toBeInTheDocument()

    // The attendance view of the drawer stays (A41).
    expect(within(panel).getByRole('heading', { name: 'Reunión por reunión · 1' })).toBeInTheDocument()
  })

  it('warns «Sin 1:1 en 2 meses» for someone disconnected and says they do not serve', async () => {
    mock.detallePersonaReporte.mockResolvedValue({ ok: true, data: detallePersona(P2, 'Paola Rangel') })
    mock.conexionesPersonaReporte.mockResolvedValue({ ok: true, data: leerConexionesPersona(conexionesRpc, P2)! })
    render(<ReportesClient {...props({ detalleInicial: { grupoId: null, personaId: P2 } })} />)
    const panel = await screen.findByRole('dialog')
    const lider = await within(panel).findByRole('article', { name: 'Con su líder' })
    expect(within(lider).getByText('Sin 1:1 en 2 meses')).toBeInTheDocument()
    expect(within(lider).getByText('13 ago · antes del rango')).toBeInTheDocument()
    expect(within(panel).getByText('No sirve todavía en el Dream Team')).toBeInTheDocument()
    expect(within(panel).getByText('Todavía no completó un taller.')).toBeInTheDocument()
  })

  it('says why the connections could not load, keeps the attendance and retries', async () => {
    const user = userEvent.setup()
    mock.detallePersonaReporte.mockResolvedValue({ ok: true, data: detallePersona(P2, 'Paola Rangel') })
    mock.conexionesPersonaReporte.mockResolvedValueOnce({ ok: false, message: 'No tienes acceso a los reportes de este ámbito.', codigo: 'sin_autoridad' })
    mock.conexionesPersonaReporte.mockResolvedValueOnce({ ok: true, data: leerConexionesPersona(conexionesRpc, P2)! })
    render(<ReportesClient {...props({ conexiones: null, detalleInicial: { grupoId: null, personaId: P2 } })} />)
    const panel = await screen.findByRole('dialog')
    const seccion = await within(panel).findByRole('region', { name: 'Conexiones' })
    expect(await within(seccion).findByRole('alert')).toHaveTextContent('No tienes acceso a los reportes de este ámbito.')
    expect(within(panel).getByRole('heading', { name: 'Reunión por reunión · 1' })).toBeInTheDocument()
    await user.click(within(seccion).getByRole('button', { name: 'Reintentar' }))
    expect(await within(seccion).findByRole('article', { name: 'Con Jesús' })).toBeInTheDocument()
  })

  it('never asks for the connections outside The Living Room', async () => {
    mock.detallePersonaReporte.mockResolvedValue({ ok: true, data: detallePersona(P2, 'Paola Rangel') })
    render(<ReportesClient {...props({ ambitoId: TRANSIT, livingRoom: false, conexiones: null, detalleInicial: { grupoId: null, personaId: P2 } })} />)
    const panel = await screen.findByRole('dialog')
    expect(await within(panel).findByRole('heading', { name: 'Reunión por reunión · 1' })).toBeInTheDocument()
    expect(within(panel).queryByRole('region', { name: 'Conexiones' })).not.toBeInTheDocument()
    expect(mock.conexionesPersonaReporte).not.toHaveBeenCalled()
  })
})
