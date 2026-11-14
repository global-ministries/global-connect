/**
 * `<ConfiguracionClient>` — DPS configuration (odd/tasks/dps-asistencia-pco.md,
 * T9; S6.3): default horarios and llegada, planificadores and "Quién pasa
 * asistencia" per team. The server actions are mocked: each edit flow checks
 * what is sent and the in-place result; a 'sin_autoridad' from any write
 * turns the screen read-only (a planner who does not configure, L17). S12.2:
 * the lists by position (Productores, Hosts, Comunicadores editable per
 * dps_lista_puede_editar; Cantantes read-only, kept in Dream Team). T13c:
 * at most four horarios and the llegada not after the first. Every person
 * is fictitious.
 */
import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ConfiguracionClient } from '@/components/dps/configuracion-client'
import * as acciones from '@/lib/actions/dps-configuracion.actions'
import { leerConfig, type ConfigDps } from '@/lib/platform/dps/configuracion'
import type { ListasDps } from '@/lib/platform/dps/listas'

jest.mock('@/lib/actions/dps-configuracion.actions', () => ({
  guardarHorariosDps: jest.fn(),
  agregarPlanificadorDps: jest.fn(),
  quitarPlanificadorDps: jest.fn(),
  guardarPasanAsistenciaDps: jest.fn(),
  buscarPersonasDps: jest.fn(),
  agregarAListaDps: jest.fn(),
  quitarDeListaDps: jest.fn(),
  buscarPersonasListaDps: jest.fn(),
  guardarRecordatorioDps: jest.fn(),
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
const agregarLista = acciones.agregarAListaDps as jest.MockedFunction<typeof acciones.agregarAListaDps>
const quitarLista = acciones.quitarDeListaDps as jest.MockedFunction<typeof acciones.quitarDeListaDps>
const buscarLista = acciones.buscarPersonasListaDps as jest.MockedFunction<typeof acciones.buscarPersonasListaDps>

const ELENA = { personaId: 'elena', nombre: 'Elena Garrido', iniciales: 'EG' }
const PEDRO = { personaId: 'pedro', nombre: 'Pedro Olmedo', iniciales: 'PO' }
const LIA = { personaId: 'lia', nombre: 'Lía Soto', iniciales: 'LS' }
const LISTAS: ListasDps = {
  productores: { lista: 'productores', puedeEditar: true, personas: [ELENA] },
  hosts: { lista: 'hosts', puedeEditar: true, personas: [] },
  comunicadores: { lista: 'comunicadores', puedeEditar: false, personas: [PEDRO] },
  cantantes: { lista: 'cantantes', puedeEditar: false, personas: [LIA] },
}
const LISTAS_HOSTS: ListasDps = { ...LISTAS, hosts: { lista: 'hosts', puedeEditar: true, personas: [ELENA] } }

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
  // T16c (S14.3, artboard design/dps-avisos-correo 07).
  it('shows «Recordatorio por correo» when the configuration carries it, and a sin_autoridad turns it read-only', async () => {
    const guardarRecordatorio = acciones.guardarRecordatorioDps as jest.MockedFunction<typeof acciones.guardarRecordatorioDps>
    guardarRecordatorio.mockResolvedValueOnce(NO_CONFIGURA)
    const conRecordatorio = leerConfig({
      horarios: ['09:15'],
      llegada: '07:00',
      planificadores: [],
      pasan_asistencia: [],
      recordatorio: { activo: true, dias: 2, hora: '10:00', puede_editar: true, proximo: null, ultimo: null },
    })
    render(<ConfiguracionClient config={conRecordatorio} error={null} />)
    expect(screen.getByRole('heading', { level: 2, name: 'Recordatorio por correo' })).toBeInTheDocument()
    await userEvent.click(within(screen.getByRole('group', { name: 'Enviar recordatorio' })).getByRole('button', { name: 'No' }))
    expect(await screen.findByText(/Puedes ver la configuración, pero solo la dirección de DPS/)).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Enviar recordatorio' })).not.toBeInTheDocument()
    expect(screen.getByTestId('recordatorio-activo')).toHaveTextContent('Sí')
  })

  it('has no reminder section when the configuration does not carry it', () => {
    render(<ConfiguracionClient config={CONFIG} error={null} />)
    expect(screen.queryByRole('heading', { name: 'Recordatorio por correo' })).not.toBeInTheDocument()
  })

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

  it('refuses a fifth horario and a llegada after the first one (T13c)', async () => {
    render(<ConfiguracionClient config={CONFIG} error={null} />)
    await userEvent.click(screen.getByRole('button', { name: 'Agregar horario' }))
    await userEvent.click(screen.getByRole('button', { name: 'Agregar horario' }))
    expect(screen.getByLabelText('Horario 4')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Agregar horario' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Quitar el horario 4' }))
    await userEvent.click(screen.getByRole('button', { name: 'Quitar el horario 3' }))
    fireEvent.change(screen.getByLabelText('Llegada'), { target: { value: '09:30' } })
    await userEvent.click(screen.getByRole('button', { name: 'Guardar horarios' }))
    expect(guardarHorarios).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('La llegada no puede ser después del primer horario.')
  })

  describe('the lists by position (S12.2)', () => {
    beforeEach(() => {
      buscarLista.mockResolvedValue({ ok: true, data: [ELENA, { personaId: 'bruno', nombre: 'Bruno Díaz', iniciales: 'BD' }] })
    })

    it('shows the four lists, who keeps each and its people; Productores and Cantantes come from Dream Team (L59)', () => {
      render(<ConfiguracionClient config={CONFIG} listas={LISTAS} error={null} />)
      const seccion = screen.getByRole('region', { name: 'Listas de la programación' })
      expect(within(seccion).getByRole('list', { name: 'Productores' })).toHaveTextContent('Elena Garrido')
      expect(within(seccion).getByText('Se gestionan en Dream Team › DPS › Producción Creativa › Productores: son quienes sirven ahí.')).toBeInTheDocument()
      expect(within(seccion).getByText('Nadie en esta lista todavía.')).toBeInTheDocument()
      expect(within(seccion).getByRole('list', { name: 'Cantantes' })).toHaveTextContent('Lía Soto')
      expect(within(seccion).getByText('Se gestionan en Dream Team › Global Music › Cantantes: son quienes sirven ahí.')).toBeInTheDocument()
      // Editable: Hosts; read-only: Comunicadores (not this caller's), and always Productores and Cantantes.
      expect(within(seccion).getByRole('searchbox', { name: 'Agregar a Hosts' })).toBeInTheDocument()
      expect(within(seccion).queryByRole('searchbox', { name: 'Agregar a Productores' })).not.toBeInTheDocument()
      expect(within(seccion).queryByRole('searchbox', { name: 'Agregar a Comunicadores' })).not.toBeInTheDocument()
      expect(within(seccion).queryByRole('searchbox', { name: 'Agregar a Cantantes' })).not.toBeInTheDocument()
      expect(within(seccion).queryByRole('button', { name: 'Quitar a Elena Garrido de Productores' })).not.toBeInTheDocument()
      expect(within(seccion).queryByRole('button', { name: 'Quitar a Pedro Olmedo de Comunicadores' })).not.toBeInTheDocument()
    })

    it('adds a person found by name; who is already on the list is not offered', async () => {
      agregarLista.mockResolvedValue({ ok: true, data: { lista: 'hosts', puedeEditar: true, personas: [{ personaId: 'bruno', nombre: 'Bruno Díaz', iniciales: 'BD' }, ELENA] } })
      render(<ConfiguracionClient config={CONFIG} listas={LISTAS_HOSTS} error={null} />)
      await userEvent.type(screen.getByRole('searchbox', { name: 'Agregar a Hosts' }), 'di')
      const boton = await screen.findByRole('button', { name: 'Agregar a Bruno Díaz en Hosts' })
      expect(buscarLista).toHaveBeenCalledWith({ texto: 'di' })
      expect(screen.queryByRole('button', { name: 'Agregar a Elena Garrido en Hosts' })).not.toBeInTheDocument()
      await userEvent.click(boton)
      expect(agregarLista).toHaveBeenCalledWith({ lista: 'hosts', personaId: 'bruno' })
      await waitFor(() => expect(screen.getByRole('list', { name: 'Hosts' })).toHaveTextContent('Bruno Díaz'))
      expect(screen.getByRole('searchbox', { name: 'Agregar a Hosts' })).toHaveValue('')
      await waitFor(() => expect(screen.getByTestId('estado-guardado')).toHaveTextContent('Guardado'))
    })

    it('takes a person off and rolls a failure back with its reason', async () => {
      quitarLista.mockResolvedValueOnce({ ok: false, message: 'No tienes permiso para cambiar esta lista.', codigo: 'sin_autoridad' })
      render(<ConfiguracionClient config={CONFIG} listas={LISTAS_HOSTS} error={null} />)
      await userEvent.click(screen.getByRole('button', { name: 'Quitar a Elena Garrido de Hosts' }))
      expect(quitarLista).toHaveBeenCalledWith({ lista: 'hosts', personaId: 'elena' })
      await waitFor(() => expect(toastError).toHaveBeenCalledWith('No tienes permiso para cambiar esta lista.'))
      expect(screen.getByRole('list', { name: 'Hosts' })).toHaveTextContent('Elena Garrido')
      quitarLista.mockResolvedValueOnce({ ok: true, data: { lista: 'hosts', puedeEditar: true, personas: [] } })
      await userEvent.click(screen.getByRole('button', { name: 'Quitar a Elena Garrido de Hosts' }))
      await waitFor(() => expect(screen.queryByRole('list', { name: 'Hosts' })).not.toBeInTheDocument())
    })

    it('never edits Productores here, even if the read says so', () => {
      render(<ConfiguracionClient config={CONFIG} listas={LISTAS} error={null} />)
      expect(screen.getByRole('list', { name: 'Productores' })).toHaveTextContent('Elena Garrido')
      expect(screen.queryByRole('searchbox', { name: 'Agregar a Productores' })).not.toBeInTheDocument()
    })
  })

  it('explains a failed read', () => {
    render(<ConfiguracionClient config={null} error="No se pudo cargar la configuración. Actualiza la página." />)
    expect(screen.getByText('No se pudo cargar la configuración')).toBeInTheDocument()
  })
})
