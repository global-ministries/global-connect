/**
 * `<ConfiguracionClient>` — DPS configuration (odd/tasks/dps-asistencia-pco.md,
 * T9; S6.3): default horarios and llegada, planificadores and "Quién pasa
 * asistencia" per team. The server actions are mocked: each edit flow checks
 * what is sent and the in-place result; a 'sin_autoridad' from any write
 * turns the screen read-only (a planner who does not configure, L17). Every
 * person is fictitious.
 */
import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ConfiguracionClient } from '@/components/dps/configuracion-client'
import * as acciones from '@/lib/actions/dps-configuracion.actions'
import { leerConfig, type ConfigDps } from '@/lib/platform/dps/configuracion'

jest.mock('@/lib/actions/dps-configuracion.actions', () => ({
  guardarHorariosDps: jest.fn(),
  agregarPlanificadorDps: jest.fn(),
  quitarPlanificadorDps: jest.fn(),
  guardarPasanAsistenciaDps: jest.fn(),
  buscarPersonasDps: jest.fn(),
}))

const toastError = jest.fn()
jest.mock('@/hooks/use-notificaciones', () => ({
  useNotificaciones: () => ({ success: jest.fn(), error: toastError, info: jest.fn() }),
}))

jest.mock('@/components/ui/desktop-header', () => ({
  DesktopHeader: ({ breadcrumbs }: { breadcrumbs?: React.ReactNode }) => <header>{breadcrumbs}</header>,
}))

const guardarHorarios = acciones.guardarHorariosDps as jest.MockedFunction<typeof acciones.guardarHorariosDps>
const agregar = acciones.agregarPlanificadorDps as jest.MockedFunction<typeof acciones.agregarPlanificadorDps>
const quitar = acciones.quitarPlanificadorDps as jest.MockedFunction<typeof acciones.quitarPlanificadorDps>
const guardarPasan = acciones.guardarPasanAsistenciaDps as jest.MockedFunction<typeof acciones.guardarPasanAsistenciaDps>
const buscar = acciones.buscarPersonasDps as jest.MockedFunction<typeof acciones.buscarPersonasDps>

const CONFIG: ConfigDps = leerConfig({
  horarios: ['09:15', '11:15'],
  llegada: '07:00',
  planificadores: [{ persona_id: 'ana', nombre: 'Ana Rivas' }],
  pasan_asistencia: [
    { equipo_id: 'dps', equipo: 'DPS', ruta: 'DPS', profundidad: 0, habilitado: true, explicito: null },
    { equipo_id: 'audio', equipo: 'Audio', ruta: 'DPS › Audio', profundidad: 1, habilitado: true, explicito: null },
    { equipo_id: 'monitores', equipo: 'Monitores', ruta: 'DPS › Audio › Monitores', profundidad: 2, habilitado: true, explicito: null },
  ],
})

const NO_CONFIGURA = {
  ok: false as const,
  message: 'Solo la dirección de DPS, un pastor o un administrador puede cambiar la configuración.',
  codigo: 'sin_autoridad' as const,
}

const fila = (equipo: string) => screen.getByRole('group', { name: `Quién pasa asistencia en ${equipo}` })

beforeEach(() => {
  jest.clearAllMocks()
  guardarHorarios.mockImplementation(async ({ horarios, llegada }) => ({ ok: true, data: { horarios: [...horarios].sort(), llegada } }))
  quitar.mockResolvedValue({ ok: true, data: null })
  guardarPasan.mockResolvedValue({ ok: true, data: null })
  buscar.mockResolvedValue({ ok: true, data: [{ personaId: 'bruno', nombre: 'Bruno Díaz' }, { personaId: 'ana', nombre: 'Ana Rivas' }] })
  agregar.mockResolvedValue({
    ok: true,
    data: { ...CONFIG, planificadores: [...CONFIG.planificadores, { personaId: 'bruno', nombre: 'Bruno Díaz' }] },
  })
})

describe('ConfiguracionClient', () => {
  it('reads "DPS › Configuración" in the crumbs, DPS linking to its section (L29)', async () => {
    render(<ConfiguracionClient config={CONFIG} error={null} />)
    const migas = await screen.findByRole('navigation', { name: 'Ubicación' })
    expect(migas).toHaveTextContent(/^DPS›Configuración$/)
    expect(within(migas).getByRole('link', { name: 'DPS' })).toHaveAttribute('href', '/dps')
    expect(screen.queryByText('Dream Team')).not.toBeInTheDocument()
  })

  it('shows the horarios, the planners and who passes attendance', () => {
    render(<ConfiguracionClient config={CONFIG} error={null} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Configuración de DPS' })).toBeInTheDocument()
    expect(screen.getByLabelText('Horario 1')).toHaveValue('09:15')
    expect(screen.getByLabelText('Horario 2')).toHaveValue('11:15')
    expect(screen.getByLabelText('Llegada')).toHaveValue('07:00')
    expect(screen.getByRole('list', { name: 'Planificadores' })).toHaveTextContent('Ana Rivas')
    expect(within(fila('Audio')).getByRole('button', { name: 'Heredar' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('saves horarios and llegada', async () => {
    render(<ConfiguracionClient config={CONFIG} error={null} />)
    await userEvent.click(screen.getByRole('button', { name: 'Agregar horario' }))
    fireEvent.change(screen.getByLabelText('Horario 3'), { target: { value: '18:45' } })
    fireEvent.change(screen.getByLabelText('Llegada'), { target: { value: '06:45' } })
    await userEvent.click(screen.getByRole('button', { name: 'Guardar horarios' }))
    expect(guardarHorarios).toHaveBeenCalledWith({ horarios: ['09:15', '11:15', '18:45'], llegada: '06:45' })
    await waitFor(() => expect(screen.getByTestId('estado-guardado')).toHaveTextContent('Guardado'))
  })

  it('removes a horario and checks them before saving', async () => {
    render(<ConfiguracionClient config={CONFIG} error={null} />)
    await userEvent.click(screen.getByRole('button', { name: 'Quitar el horario 2' }))
    expect(screen.queryByLabelText('Horario 2')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Llegada'), { target: { value: '' } })
    await userEvent.click(screen.getByRole('button', { name: 'Guardar horarios' }))
    expect(guardarHorarios).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Revisa la hora de llegada, con el formato 07:00.')
  })

  it('turns read-only when a write says sin_autoridad', async () => {
    guardarHorarios.mockResolvedValueOnce(NO_CONFIGURA)
    render(<ConfiguracionClient config={CONFIG} error={null} />)
    fireEvent.change(screen.getByLabelText('Llegada'), { target: { value: '06:30' } })
    await userEvent.click(screen.getByRole('button', { name: 'Guardar horarios' }))
    expect(await screen.findByText(/Puedes ver la configuración, pero solo la dirección de DPS/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Llegada')).not.toBeInTheDocument()
    expect(screen.getByText('7:00')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Quitar a/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Heredar' })).not.toBeInTheDocument()
  })

  it('adds a planner from the person search', async () => {
    render(<ConfiguracionClient config={CONFIG} error={null} />)
    await userEvent.type(screen.getByRole('searchbox', { name: 'Agregar planificador' }), 'bru')
    const boton = await screen.findByRole('button', { name: 'Agregar a Bruno Díaz' })
    // Who already plans is not offered again.
    expect(screen.queryByRole('button', { name: 'Agregar a Ana Rivas' })).not.toBeInTheDocument()
    expect(buscar).toHaveBeenCalledWith({ q: 'bru' })
    await userEvent.click(boton)
    expect(agregar).toHaveBeenCalledWith({ personaId: 'bruno' })
    await waitFor(() => expect(screen.getByRole('list', { name: 'Planificadores' })).toHaveTextContent('Bruno Díaz'))
    expect(screen.getByRole('searchbox', { name: 'Agregar planificador' })).toHaveValue('')
  })

  it('removes a planner and rolls back a failure', async () => {
    render(<ConfiguracionClient config={CONFIG} error={null} />)
    quitar.mockResolvedValueOnce({ ok: false, message: 'No se pudo guardar la configuración. Intenta de nuevo.', codigo: null })
    await userEvent.click(screen.getByRole('button', { name: 'Quitar a Ana Rivas' }))
    expect(quitar).toHaveBeenCalledWith({ personaId: 'ana' })
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('No se pudo guardar la configuración. Intenta de nuevo.'))
    expect(screen.getByRole('list', { name: 'Planificadores' })).toHaveTextContent('Ana Rivas')

    await userEvent.click(screen.getByRole('button', { name: 'Quitar a Ana Rivas' }))
    await waitFor(() => expect(screen.queryByRole('list', { name: 'Planificadores' })).not.toBeInTheDocument())
    expect(screen.getByText('Nadie más arma el plan todavía.')).toBeInTheDocument()
  })

  it('sets who passes attendance per team; children inherit', async () => {
    render(<ConfiguracionClient config={CONFIG} error={null} />)
    await userEvent.click(within(fila('Audio')).getByRole('button', { name: 'No' }))
    expect(guardarPasan).toHaveBeenCalledWith({ equipoId: 'audio', habilitado: false })
    expect(within(fila('Audio')).getByRole('button', { name: 'No' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('pasa-monitores')).toHaveTextContent('No pasan · como Audio')

    await userEvent.click(within(fila('Audio')).getByRole('button', { name: 'Heredar' }))
    expect(guardarPasan).toHaveBeenLastCalledWith({ equipoId: 'audio', habilitado: null })
    expect(screen.getByTestId('pasa-audio')).toHaveTextContent('Sí pasan · como DPS')
    expect(screen.getByTestId('pasa-monitores')).toHaveTextContent('Sí pasan · como Audio')
  })

  it('rolls back who passes attendance on sin_autoridad and turns read-only', async () => {
    guardarPasan.mockResolvedValueOnce(NO_CONFIGURA)
    render(<ConfiguracionClient config={CONFIG} error={null} />)
    await userEvent.click(within(fila('Audio')).getByRole('button', { name: 'Sí' }))
    expect(await screen.findByText(/Puedes ver la configuración/)).toBeInTheDocument()
    expect(screen.getByTestId('pasa-audio')).toHaveTextContent('Sí pasan · como DPS')
  })

  it('explains a failed read', () => {
    render(<ConfiguracionClient config={null} error="No se pudo cargar la configuración. Actualiza la página." />)
    expect(screen.getByText('No se pudo cargar la configuración')).toBeInTheDocument()
  })
})
