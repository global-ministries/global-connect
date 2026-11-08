/**
 * `<AsistenciaClient>` — the Sunday attendance on the phone
 * (odd/tasks/dps-asistencia-pco.md, T9; artboard
 * docs/design-system/prototipos/planificacion-dps/05-asistencia-celular.html).
 * The server actions are mocked: each flow checks what is sent, the
 * optimistic change and its rollback, the live status, the filter, "Marcar
 * todos", "Avisó que no viene" (convocados only), "Agregar a alguien que vino
 * sin estar convocado", the read-only sheet and the empty states. Every
 * person is fictitious.
 */
import React from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { AsistenciaClient, type AsistenciaClientProps } from '@/components/dream-team/dps/asistencia-client'
import * as acciones from '@/lib/actions/dps-asistencia.actions'
import { agregarLlegada, aplicarEstados, leerPlanes, leerPlanilla, type PlanillaDps } from '@/lib/platform/dream-team/dps/planilla'

jest.mock('@/lib/actions/dps-asistencia.actions', () => ({
  cargarPlanillaDps: jest.fn(),
  marcarAsistenciaDps: jest.fn(),
  marcarEquipoDps: jest.fn(),
}))

const toastError = jest.fn()
jest.mock('@/hooks/use-notificaciones', () => ({
  useNotificaciones: () => ({ success: jest.fn(), error: toastError, info: jest.fn() }),
}))

const replace = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, refresh: jest.fn(), push: jest.fn() }),
  usePathname: () => '/dream-team/dps/asistencia',
}))

jest.mock('@/components/ui/desktop-header', () => ({
  DesktopHeader: ({ breadcrumbs }: { breadcrumbs?: React.ReactNode }) => <header>{breadcrumbs}</header>,
}))

const marcar = acciones.marcarAsistenciaDps as jest.MockedFunction<typeof acciones.marcarAsistenciaDps>
const marcarEquipo = acciones.marcarEquipoDps as jest.MockedFunction<typeof acciones.marcarEquipoDps>
const cargar = acciones.cargarPlanillaDps as jest.MockedFunction<typeof acciones.cargarPlanillaDps>

const persona = (id: string, nombre: string, apellido: string, parche: Record<string, unknown> = {}) => ({
  persona_id: id,
  nombre,
  apellido,
  iniciales: `${nombre[0]}${apellido[0]}`,
  convocado: true,
  estado: null,
  puestos: [{ puesto_id: `${id}-p`, nombre: 'Monitores' }],
  otros_puestos: [],
  ...parche,
})

const PLANILLA_JSON = {
  plan_id: 'plan1',
  fecha: '2026-11-08',
  tipo: 'domingo',
  titulo: null,
  hoy: '2026-11-08',
  editable: true,
  equipos: [
    {
      equipo_id: 'audio',
      equipo: 'Audio',
      ruta: 'DPS › Producción Técnica › Audio',
      personas: [
        persona('ana', 'Ana', 'Rivas', { estado: 'llego', puestos: [{ puesto_id: 'x', nombre: 'Audio FOH' }] }),
        persona('bruno', 'Bruno', 'Díaz', { otros_puestos: ['Cámara 1'] }),
        persona('carla', 'Carla', 'Paz', { estado: 'aviso_no_viene', puestos: [{ puesto_id: 'z', nombre: 'Streaming' }] }),
      ],
      otros: [{ persona_id: 'diego', nombre: 'Diego', apellido: 'Luna', iniciales: 'DL' }],
    },
    {
      equipo_id: 'video',
      equipo: 'Video',
      ruta: 'DPS › Producción Técnica › Video',
      personas: [
        persona('bruno', 'Bruno', 'Díaz', { puestos: [{ puesto_id: 'w', nombre: 'Cámara 1' }], otros_puestos: ['Monitores'] }),
        persona('elena', 'Elena', 'Mora', { convocado: false, estado: 'llego', puestos: [] }),
      ],
      otros: [{ persona_id: 'fabian', nombre: 'Fabián', apellido: 'Soto', iniciales: 'FS' }],
    },
  ],
}

const PLANILLA: PlanillaDps = leerPlanilla(PLANILLA_JSON)
const PLANES = leerPlanes([
  { id: 'plan0', fecha: '2026-11-01', tipo: 'domingo', titulo: null, semana: 2, serie: { nombre: 'Tu casa tiene influencers', color: 'chart-1' }, horarios: ['09:15', '11:15'], llegada: '07:00' },
  { id: 'plan1', fecha: '2026-11-08', tipo: 'domingo', titulo: null, semana: 3, serie: { nombre: 'Tu casa tiene influencers', color: 'chart-1' }, horarios: ['09:15', '11:15'], llegada: '07:00' },
])

const props = (parche: Partial<AsistenciaClientProps> = {}): AsistenciaClientProps => ({
  planes: PLANES,
  plan: PLANES[1],
  planilla: PLANILLA,
  error: null,
  ...parche,
})

const equipo = (nombre: string) => screen.getByRole('region', { name: nombre })
const filtro = (nombre: RegExp) => screen.getByRole('button', { name: nombre })

beforeEach(() => {
  jest.clearAllMocks()
  marcar.mockResolvedValue({ ok: true, data: { cambiados: 1 } })
  marcarEquipo.mockResolvedValue({ ok: true, data: { cambiados: 1 } })
  cargar.mockResolvedValue({ ok: true, data: PLANILLA })
})

describe('AsistenciaClient', () => {
  it('shows the plan, "N de M llegaron", the times and the team sections', () => {
    render(<AsistenciaClient {...props()} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Domingo 8 nov' })).toBeInTheDocument()
    expect(screen.getByText('Tu casa tiene influencers · Semana 3')).toBeInTheDocument()
    expect(screen.getByTestId('resumen-asistencia')).toHaveTextContent('2 de 4 llegaron · una marca vale para 9:15 y 11:15')
    expect(equipo('Audio')).toBeInTheDocument()
    expect(equipo('Video')).toBeInTheDocument()
    expect(within(equipo('Audio')).getByText('1/3')).toBeInTheDocument()
    expect(screen.getByText(/Esta asistencia será la base para validar el refrigerio/)).toBeInTheDocument()
  })

  it('starts on "Por llegar": only convocados without a mark', () => {
    render(<AsistenciaClient {...props()} />)
    expect(filtro(/^Por llegar/)).toHaveAttribute('aria-pressed', 'true')
    expect(filtro(/^Por llegar/)).toHaveTextContent('Por llegar 1')
    expect(within(equipo('Audio')).getByText('Bruno Díaz')).toBeInTheDocument()
    expect(within(equipo('Audio')).queryByText('Ana Rivas')).not.toBeInTheDocument()
    expect(within(equipo('Audio')).queryByText('Carla Paz')).not.toBeInTheDocument()
  })

  it('filters Llegaron and Todos; "Marcar todos" hides in Llegaron', async () => {
    render(<AsistenciaClient {...props()} />)
    await userEvent.click(filtro(/^Llegaron/))
    expect(within(equipo('Audio')).getByText('Ana Rivas')).toBeInTheDocument()
    expect(within(equipo('Audio')).queryByText('Bruno Díaz')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Marcar todos/ })).not.toBeInTheDocument()

    await userEvent.click(filtro(/^Todos/))
    expect(within(equipo('Audio')).getByText('Carla Paz')).toBeInTheDocument()
    expect(within(equipo('Audio')).getByText(/Avisó que no viene/)).toBeInTheDocument()
    expect(within(equipo('Video')).getByText(/Vino sin estar convocado/)).toBeInTheDocument()
  })

  it('collapses a team from its sticky header', async () => {
    render(<AsistenciaClient {...props()} />)
    const boton = within(equipo('Audio')).getByRole('button', { name: /^Audio/ })
    expect(boton).toHaveAttribute('aria-expanded', 'true')
    await userEvent.click(boton)
    expect(boton).toHaveAttribute('aria-expanded', 'false')
    expect(within(equipo('Audio')).queryByText('Bruno Díaz')).not.toBeInTheDocument()
  })

  it('marks "Llegó" on tap in every team of the person and says it is saved', async () => {
    render(<AsistenciaClient {...props()} />)
    await userEvent.click(filtro(/^Todos/))
    await userEvent.click(within(equipo('Audio')).getByRole('button', { name: 'Llegó: Bruno Díaz' }))
    expect(marcar).toHaveBeenCalledWith({ planId: 'plan1', personaIds: ['bruno'], estado: 'llego' })
    for (const nombre of ['Audio', 'Video']) {
      expect(within(equipo(nombre)).getByRole('button', { name: 'Llegó: Bruno Díaz' })).toHaveAttribute('aria-pressed', 'true')
    }
    expect(screen.getByTestId('resumen-asistencia')).toHaveTextContent('3 de 4 llegaron')
    await waitFor(() => expect(screen.getByTestId('estado-guardado')).toHaveTextContent('Guardado'))
    expect(screen.getByTestId('aviso-cambio')).toHaveTextContent('Bruno Díaz llegó.')
  })

  it('clears the mark with a second tap', async () => {
    render(<AsistenciaClient {...props()} />)
    await userEvent.click(filtro(/^Todos/))
    await userEvent.click(screen.getByRole('button', { name: 'Llegó: Ana Rivas' }))
    expect(marcar).toHaveBeenCalledWith({ planId: 'plan1', personaIds: ['ana'], estado: null })
    expect(screen.getByRole('button', { name: 'Llegó: Ana Rivas' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByTestId('aviso-cambio')).toHaveTextContent('Quitaste la llegada de Ana Rivas.')
  })

  it('rolls back and explains a failed mark', async () => {
    marcar.mockResolvedValueOnce({ ok: false, message: 'No tienes permiso para pasar asistencia en este equipo.', codigo: 'sin_autoridad' })
    render(<AsistenciaClient {...props()} />)
    await userEvent.click(filtro(/^Todos/))
    await userEvent.click(within(equipo('Audio')).getByRole('button', { name: 'Llegó: Bruno Díaz' }))
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('No tienes permiso para pasar asistencia en este equipo.'))
    expect(within(equipo('Audio')).getByRole('button', { name: 'Llegó: Bruno Díaz' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByTestId('resumen-asistencia')).toHaveTextContent('2 de 4 llegaron')
    expect(screen.getByTestId('estado-guardado')).toHaveTextContent('No se pudo guardar')
  })

  it('offers "Avisó que no viene" only to convocados, and it toggles', async () => {
    render(<AsistenciaClient {...props()} />)
    await userEvent.click(filtro(/^Todos/))
    expect(within(equipo('Video')).queryByRole('button', { name: 'Avisó que no viene: Elena Mora' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Avisó que no viene: Carla Paz' })).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(within(equipo('Audio')).getByRole('button', { name: 'Avisó que no viene: Bruno Díaz' }))
    expect(marcar).toHaveBeenLastCalledWith({ planId: 'plan1', personaIds: ['bruno'], estado: 'aviso_no_viene' })
    await userEvent.click(screen.getByRole('button', { name: 'Avisó que no viene: Carla Paz' }))
    expect(marcar).toHaveBeenLastCalledWith({ planId: 'plan1', personaIds: ['carla'], estado: null })
  })

  it('"Marcar todos" marks the team\'s pending convocados and reloads', async () => {
    cargar.mockResolvedValueOnce({ ok: true, data: aplicarEstados(PLANILLA, new Map([['bruno', 'llego' as const]])) })
    render(<AsistenciaClient {...props()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Marcar todos en Audio' }))
    expect(marcarEquipo).toHaveBeenCalledWith({ planId: 'plan1', equipoId: 'audio' })
    expect(screen.getByTestId('resumen-asistencia')).toHaveTextContent('3 de 4 llegaron')
    expect(within(equipo('Audio')).getByText('Ya llegaron todos.')).toBeInTheDocument()
    await waitFor(() => expect(cargar).toHaveBeenCalledWith({ planId: 'plan1' }))
    expect(screen.getByTestId('aviso-cambio')).toHaveTextContent('Marcaste 1 llegada en Audio.')
  })

  it('rolls back "Marcar todos" when it fails', async () => {
    marcarEquipo.mockResolvedValueOnce({ ok: false, message: 'Ese equipo ya no está en DPS. Actualiza la página.', codigo: 'equipo_invalido' })
    render(<AsistenciaClient {...props()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Marcar todos en Audio' }))
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Ese equipo ya no está en DPS. Actualiza la página.'))
    expect(screen.getByTestId('resumen-asistencia')).toHaveTextContent('2 de 4 llegaron')
  })

  it('adds someone who came without being convocado from the sheet', async () => {
    cargar.mockResolvedValueOnce({ ok: true, data: agregarLlegada(PLANILLA, 'video', PLANILLA.equipos[1].otros[0]) })
    render(<AsistenciaClient {...props()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Agregar a alguien que vino sin estar convocado' }))
    const hoja = await screen.findByRole('dialog', { name: 'Vino sin estar convocado' })
    expect(within(hoja).getByRole('button', { name: /Diego Luna/ })).toHaveTextContent('Audio')
    await userEvent.type(within(hoja).getByRole('searchbox', { name: 'Buscar persona' }), 'fab')
    expect(within(hoja).queryByRole('button', { name: /Diego Luna/ })).not.toBeInTheDocument()
    await userEvent.click(within(hoja).getByRole('button', { name: /Fabián Soto/ }))

    expect(marcar).toHaveBeenCalledWith({ planId: 'plan1', personaIds: ['fabian'], estado: 'llego' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await userEvent.click(filtro(/^Llegaron/))
    expect(within(equipo('Video')).getByText('Fabián Soto')).toBeInTheDocument()
    expect(screen.getByTestId('aviso-cambio')).toHaveTextContent('Fabián Soto quedó como llegó en Video.')
  })

  it('says when nobody is left to add', async () => {
    const sinOtros = { ...PLANILLA, equipos: PLANILLA.equipos.map((e) => ({ ...e, otros: [] })) }
    render(<AsistenciaClient {...props({ planilla: sinOtros })} />)
    await userEvent.click(screen.getByRole('button', { name: 'Agregar a alguien que vino sin estar convocado' }))
    expect(await screen.findByText('Todos los de tus equipos ya están en la lista.')).toBeInTheDocument()
  })

  it('is read-only outside the window', () => {
    render(<AsistenciaClient {...props({ planilla: { ...PLANILLA, editable: false } })} />)
    expect(screen.getByText(/Esta lista es de solo lectura/)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Llegó:/ }).every((b) => b.hasAttribute('disabled'))).toBe(true)
    expect(screen.queryByRole('button', { name: /^Avisó que no viene:/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Marcar todos/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Agregar a alguien que vino sin estar convocado' })).not.toBeInTheDocument()
  })

  it('switches plan through the URL', async () => {
    render(<AsistenciaClient {...props()} />)
    await userEvent.selectOptions(screen.getByLabelText('Plan'), 'plan0')
    expect(replace).toHaveBeenCalledWith('/dream-team/dps/asistencia?plan=plan0', { scroll: false })
  })

  it('explains a caller without teams to mark', () => {
    render(<AsistenciaClient {...props({ planilla: null, error: { mensaje: 'No tienes equipos para pasar asistencia en este plan.', sinEquipos: true } })} />)
    expect(screen.getByText('No tienes equipos para pasar asistencia')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Llegó:/ })).not.toBeInTheDocument()
  })

  it('explains a window without plans', () => {
    render(<AsistenciaClient {...props({ planes: [], plan: null, planilla: null })} />)
    expect(screen.getByText('No hay planes en los últimos 14 días')).toBeInTheDocument()
  })

  it('explains a plan with nobody convocado', () => {
    render(<AsistenciaClient {...props({ planilla: { ...PLANILLA, equipos: [] } })} />)
    expect(screen.getByText('Nadie convocado en este plan')).toBeInTheDocument()
  })
})
