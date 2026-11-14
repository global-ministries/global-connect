/**
 * `<ProgramacionClient>` with the service notices (odd/tasks/dps-asistencia-pco.md,
 * T15b; S13.2, S13.3; artboard design/dps-avisos/03): a state mark per
 * person in Productor, Host, Comunicador and Cantantes (✓ confirmó, clock
 * pendiente, ✕ no puede, dot sin avisar) with an accessible label and a
 * tooltip, «Sin cuenta» neutral without a mark, the legend, the «Avisos»
 * indicator per row and the «Enviar avisos» bar scoped to the visible
 * future plans. The server actions are mocked; every name is fictitious.
 */
import React from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ProgramacionClient, type ProgramacionClientProps } from '@/components/dps/programacion-client'
import * as acciones from '@/lib/actions/dps-programacion.actions'
import * as avisos from '@/lib/actions/dps-avisos.actions'
import { leerEnvioAvisos, leerEstadoAvisos, leerPendientesAvisos } from '@/lib/platform/dps/avisos'
import { leerPlanesHoja } from '@/lib/platform/dps/programacion'

jest.mock('@/lib/actions/dps-programacion.actions', () => ({
  cargarProgramacionDps: jest.fn(),
  guardarCeldaDps: jest.fn(),
  crearSerieDps: jest.fn(),
}))
jest.mock('@/lib/actions/dps-plan.actions', () => ({ cambiarPortadaDps: jest.fn() }))
jest.mock('@/lib/actions/dps-avisos.actions', () => ({
  cargarEstadoAvisosDps: jest.fn(),
  cargarAvisosPendientesDps: jest.fn(),
  enviarAvisosDps: jest.fn(),
  cargarPersonasBloqueadasDps: jest.fn(),
}))

const toast = { success: jest.fn(), error: jest.fn(), info: jest.fn() }
jest.mock('@/hooks/use-notificaciones', () => ({ useNotificaciones: () => toast }))

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), refresh: jest.fn(), push: jest.fn() }),
  usePathname: () => '/dps/programacion',
}))

jest.mock('@/components/ui/desktop-header', () => ({
  DesktopHeader: ({ breadcrumbs }: { breadcrumbs?: React.ReactNode }) => <header>{breadcrumbs}</header>,
}))

const mock = <T extends (...args: never[]) => unknown>(f: T) => f as unknown as jest.MockedFunction<T>
const guardar = mock(acciones.guardarCeldaDps)
const cargarEstado = mock(avisos.cargarEstadoAvisosDps)
const cargarPendientes = mock(avisos.cargarAvisosPendientesDps)
const enviar = mock(avisos.enviarAvisosDps)

beforeAll(() => {
  global.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

const id = (n: number) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, '0')}`
const P1 = '11111111-1111-4111-8111-000000000001' // 1 nov, past
const P15 = '11111111-1111-4111-8111-000000000015'
const P22 = '11111111-1111-4111-8111-000000000022'
const P6D = '11111111-1111-4111-8111-000000000206' // 6 dic
const XR = id(1)
const AV = id(2)
const PO = id(3)
const SV = id(4)
const RD = id(5)

const fichas = (...personas: [string, string][]) => personas.map(([personaId, nombre]) => ({ persona_id: personaId, texto: null, nombre }))
const json = (planId: string, fecha: string, personas: Record<string, unknown> = {}) => ({
  id: planId,
  fecha,
  tipo: 'domingo',
  titulo: null,
  semana: null,
  serie: null,
  horarios: ['09:00', '11:30'],
  llegada: '07:30',
  campos: {},
  personas,
})
const PLANES = [
  json(P1, '2026-11-01', { productor: fichas([XR, 'Ximena Rangel']) }),
  json(P15, '2026-11-15', {
    productor: fichas([XR, 'Ximena Rangel']),
    host: fichas([AV, 'Andrés Valero']),
    comunicador: fichas([PO, 'Patricia Olmedo']),
    cantantes: [...fichas([SV, 'Sara Villegas']), { persona_id: null, texto: 'Gabriela Nieves', nombre: 'Gabriela Nieves' }],
  }),
  json(P22, '2026-11-22', { host: fichas([RD, 'Rafael Duarte']) }),
  json(P6D, '2026-12-06', { host: fichas([RD, 'Rafael Duarte']) }),
]

const persona = (personaId: string, nombre: string, estado: string, claves: string[], parche: Record<string, unknown> = {}) => ({
  persona_id: personaId,
  nombre,
  iniciales: 'XX',
  tiene_cuenta: true,
  estado,
  por_enviar: estado === 'sin_avisar' ? 'nueva' : null,
  claves,
  roles_antes: null,
  estado_aviso: null,
  motivo: null,
  respondido_at: null,
  enviado_at: null,
  ...parche,
})
const resumen = (r: Record<string, number> = {}) => ({ sin_avisar: 0, pendiente: 0, confirmo: 0, no_puede: 0, quitado: 0, sin_cuenta: 0, ...r })
const ESTADO = leerEstadoAvisos({
  por_enviar: 4,
  planes: [
    { plan_id: P1, fecha: '2026-11-01', pasado: true, por_enviar: 0, resumen: resumen({ confirmo: 1 }), personas: [persona(XR, 'Ximena Rangel', 'confirmo', ['c:productor'])] },
    {
      plan_id: P15,
      fecha: '2026-11-15',
      pasado: false,
      por_enviar: 0,
      resumen: resumen({ confirmo: 2, pendiente: 1, no_puede: 1, sin_cuenta: 1 }),
      personas: [
        persona(XR, 'Ximena Rangel', 'confirmo', ['c:productor']),
        persona(AV, 'Andrés Valero', 'pendiente', ['c:host']),
        persona(PO, 'Patricia Olmedo', 'confirmo', ['c:comunicador']),
        persona(SV, 'Sara Villegas', 'no_puede', ['c:cantantes'], { motivo: 'Viaje familiar a Mérida' }),
      ],
    },
    {
      plan_id: P22,
      fecha: '2026-11-22',
      pasado: false,
      por_enviar: 2,
      resumen: resumen({ sin_avisar: 1, quitado: 1 }),
      personas: [persona(RD, 'Rafael Duarte', 'sin_avisar', ['c:host']), persona(id(9), 'Gerardo Silva', 'quitado', ['c:host'], { por_enviar: 'quitado' })],
    },
    { plan_id: P6D, fecha: '2026-12-06', pasado: false, por_enviar: 1, resumen: resumen({ sin_avisar: 1 }), personas: [persona(RD, 'Rafael Duarte', 'sin_avisar', ['c:host'])] },
  ],
})

const item = (planId: string, fecha: string, personaId: string, nombre: string) => ({
  plan_id: planId,
  fecha,
  tipo: 'domingo',
  titulo: null,
  serie: null,
  persona_id: personaId,
  nombre,
  iniciales: 'XX',
  tiene_cuenta: true,
  roles: [{ origen: 'columna', puesto_id: null, columna: 'host', nombre: 'Host', equipo: 'Producción Creativa', direccion: 'Producción Creativa', automatico: false }],
})
const PENDIENTES = leerPendientesAvisos({
  total: 3,
  nuevas: [
    { ...item(P22, '2026-11-22', RD, 'Rafael Duarte'), automatico: false, reemplaza: [] },
    { ...item(P6D, '2026-12-06', RD, 'Rafael Duarte'), automatico: false, reemplaza: [] },
  ],
  cambios: [],
  quitados: [item(P22, '2026-11-22', id(9), 'Gerardo Silva')],
  no_reciben: {},
})

const props = (parche: Partial<ProgramacionClientProps> = {}): ProgramacionClientProps => ({
  anio: 2026,
  hoy: '2026-11-09',
  planes: leerPlanesHoja(PLANES),
  editable: true,
  error: null,
  ...parche,
})

const celda = (fecha: string, columna: string): HTMLElement => {
  const td = document.querySelector<HTMLElement>(`[data-fecha="${fecha}"][data-columna="${columna}"]`)
  if (!td) throw new Error(`sin celda ${fecha} ${columna}`)
  return td
}

beforeEach(() => {
  jest.clearAllMocks()
  cargarEstado.mockResolvedValue({ ok: true, data: ESTADO })
  cargarPendientes.mockResolvedValue({ ok: true, data: PENDIENTES })
  enviar.mockResolvedValue({ ok: true, data: leerEnvioAvisos({ enviados: 3, nuevas: 2, cambios: 0, quitados: 1, cerrados: 0, por_correo: 3, solo_panel: 0 }) })
})

describe('the marks of the people', () => {
  it('reads the states of every plan of the year', async () => {
    render(<ProgramacionClient {...props()} />)
    await waitFor(() => expect(cargarEstado).toHaveBeenCalledWith({ planIds: [P1, P15, P22, P6D] }))
  })

  it('marks each person with their state, an accessible label and a tooltip', async () => {
    render(<ProgramacionClient {...props()} />)
    const productor = celda('2026-11-15', 'productor')
    expect(await within(productor).findByText(', confirmó')).toHaveClass('sr-only')
    expect(within(productor).getByTitle('Ximena Rangel: confirmó')).toBeInTheDocument()
    expect(within(celda('2026-11-15', 'host')).getByTitle('Andrés Valero: pendiente')).toHaveTextContent('Andrés Valero, pendiente')
    expect(within(celda('2026-11-15', 'cantantes')).getByTitle('Sara Villegas: no puede · «Viaje familiar a Mérida»')).toHaveTextContent('Sara Villegas, no puede')
    expect(within(celda('2026-11-22', 'host')).getByTitle('Rafael Duarte: sin avisar')).toHaveTextContent('Rafael Duarte, sin avisar')
  })

  it('leaves «Sin cuenta» neutral, without a mark', async () => {
    render(<ProgramacionClient {...props()} />)
    const cantantes = celda('2026-11-15', 'cantantes')
    await within(cantantes).findByText(', no puede')
    expect(within(cantantes).getByText('Sin cuenta')).toBeInTheDocument()
    expect(within(cantantes).queryByTitle(/Gabriela Nieves:/)).not.toBeInTheDocument()
    expect(cantantes.querySelectorAll('[data-marca-aviso]')).toHaveLength(1)
  })

  it('shows the legend in the toolbar', async () => {
    render(<ProgramacionClient {...props()} />)
    const leyenda = await screen.findByRole('list', { name: 'Leyenda de respuestas' })
    for (const texto of ['Confirmó', 'Pendiente', 'No puede', 'Sin avisar', 'Sin cuenta']) expect(leyenda).toHaveTextContent(texto)
    expect(leyenda).toHaveTextContent('no recibe avisos')
  })
})

describe('the «Avisos» column', () => {
  it('says per row what is pending, what failed and what passed', async () => {
    render(<ProgramacionClient {...props()} />)
    await screen.findByRole('columnheader', { name: 'Avisos' })
    expect(await within(celda('2026-11-22', 'avisos')).findByText('2 sin avisar')).toBeInTheDocument()
    expect(within(celda('2026-11-15', 'avisos')).getByText('1 no puede')).toBeInTheDocument()
    expect(within(celda('2026-11-01', 'avisos')).getByText('Ya pasó')).toBeInTheDocument()
    expect(within(celda('2026-12-06', 'avisos')).getByText('1 sin avisar')).toBeInTheDocument()
  })
})

describe('the «Enviar avisos» bar of the sheet', () => {
  it('counts only the visible future plans and sends only them', async () => {
    render(<ProgramacionClient {...props()} />)
    const barra = await screen.findByRole('region', { name: '3 avisos sin enviar en 2026' })
    await userEvent.click(within(barra).getByRole('button', { name: 'Enviar avisos' }))
    expect(cargarPendientes).toHaveBeenCalledWith({ planIds: [P15, P22, P6D] })
    const panel = await screen.findByRole('dialog', { name: 'Enviar avisos' })
    await userEvent.click(await within(panel).findByRole('button', { name: 'Enviar 3 avisos' }))
    expect(enviar).toHaveBeenCalledWith({ planIds: [P15, P22, P6D] })
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Enviamos 3 avisos: 3 por correo y 0 solo en el panel.'))
    await waitFor(() => expect(cargarEstado).toHaveBeenCalledTimes(2))
  })

  it('counts a «No puede» taken out as a change to save, even with no notice to send', async () => {
    cargarEstado.mockResolvedValue({
      ok: true,
      data: leerEstadoAvisos({
        por_enviar: 1,
        planes: [
          {
            plan_id: P15,
            fecha: '2026-11-15',
            pasado: false,
            por_enviar: 1,
            resumen: resumen({ confirmo: 1 }),
            personas: [persona(XR, 'Ximena Rangel', 'confirmo', ['c:productor'])],
          },
        ],
      }),
    })
    render(<ProgramacionClient {...props()} />)
    const barra = await screen.findByRole('region', { name: '1 cambio sin guardar en 2026' })
    expect(barra).toHaveTextContent('1 «No puede» sale del plan')
    expect(within(barra).getByRole('button', { name: 'Guardar cambios' })).toBeInTheDocument()
  })

  it('follows the month filter', async () => {
    render(<ProgramacionClient {...props()} />)
    await screen.findByRole('region', { name: '3 avisos sin enviar en 2026' })
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Mes' }), '11')
    const barra = await screen.findByRole('region', { name: '1 aviso sin enviar en diciembre' })
    await userEvent.click(within(barra).getByRole('button', { name: 'Enviar avisos' }))
    expect(cargarPendientes).toHaveBeenCalledWith({ planIds: [P6D] })
  })

  it('reads the states again after a cell of people is saved', async () => {
    guardar.mockResolvedValue({ ok: true, data: leerPlanesHoja([json(P22, '2026-11-22')])[0] })
    render(<ProgramacionClient {...props()} />)
    await screen.findByRole('region', { name: '3 avisos sin enviar en 2026' })
    celda('2026-11-22', 'host').focus()
    await userEvent.keyboard('{Delete}')
    await waitFor(() => expect(guardar).toHaveBeenCalled())
    await waitFor(() => expect(cargarEstado).toHaveBeenCalledTimes(2))
  })
})

describe('the read-only sheet', () => {
  it('reads no notices: no marks, legend, column nor bar', async () => {
    render(<ProgramacionClient {...props({ editable: false })} />)
    expect(await screen.findByRole('grid')).toBeInTheDocument()
    expect(cargarEstado).not.toHaveBeenCalled()
    expect(screen.queryByRole('list', { name: 'Leyenda de respuestas' })).not.toBeInTheDocument()
    expect(document.querySelector('[data-columna="avisos"]')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Enviar avisos' })).not.toBeInTheDocument()
  })
})
