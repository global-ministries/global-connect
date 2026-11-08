/**
 * Niños › Eventos (odd/tasks/ninos-checkin-pco.md, T1c): the screen of
 * /ninos/eventos with the server actions mocked. A reader without
 * ninos_puede_configurar_campus sees no controls; whoever may write edits the
 * check-in window inline, toggles options, creates and archives events, adds
 * and removes horarios, and reads the RPC's HINT when a save fails. Without
 * matchMedia the panels are the desktop side panel. All data is fictitious.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { EventosClient, type EventosClientProps } from '@/components/ninos/eventos/eventos-client'
import { leerEventosAdmin } from '@/lib/platform/ninos/eventos'

const refresh = jest.fn()
const push = jest.fn()
const toastSuccess = jest.fn()
const toastError = jest.fn()
const guardarEvento = jest.fn()
const archivarEvento = jest.fn()
const agregarHorario = jest.fn()
const guardarVentanaHorario = jest.fn()
const quitarHorario = jest.fn()

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push, replace: jest.fn() }) }))
jest.mock('sonner', () => ({
  toast: { success: (...a: unknown[]) => toastSuccess(...a), error: (...a: unknown[]) => toastError(...a), info: jest.fn() },
}))
jest.mock('@/components/ui/desktop-header', () => ({
  DesktopHeader: ({ breadcrumbs, accionPrincipal }: { breadcrumbs?: React.ReactNode; accionPrincipal?: React.ReactNode }) => (
    <header>
      {breadcrumbs}
      {accionPrincipal}
    </header>
  ),
}))
jest.mock('@/lib/actions/ninos-eventos.actions', () => ({
  guardarEvento: (...a: unknown[]) => guardarEvento(...a),
  archivarEvento: (...a: unknown[]) => archivarEvento(...a),
  agregarHorario: (...a: unknown[]) => agregarHorario(...a),
  guardarVentanaHorario: (...a: unknown[]) => guardarVentanaHorario(...a),
  quitarHorario: (...a: unknown[]) => quitarHorario(...a),
}))

const CAMPUS = '11111111-1111-4111-8111-111111111111'
const HINT_AUTORIDAD = 'Solo quien configura todas las áreas de Niños del campus puede cambiar eventos y horarios.'

const eventos = leerEventosAdmin([
  {
    id: 'e1',
    campus_id: CAMPUS,
    nombre: 'Domingo semanal',
    tipo: 'semanal',
    dia_semana: 0,
    fecha_inicio: null,
    fecha_fin: null,
    precheck_app: true,
    avisos_push: true,
    visitante_una_vez: false,
    integracion_dream_team: true,
    anuncio_mesa: null,
    activo: true,
    horarios: [
      {
        id: 'h1',
        turno_id: 't1',
        nombre: 'Primer servicio',
        hora: '09:00',
        turno_tipo: 'semanal',
        turno_activo: true,
        fechas: [],
        abre_min_antes: 45,
        cierra_min_despues: 105,
        turno_creado: false,
        activo: true,
      },
    ],
    sesiones: [{ fecha: '2026-11-01', ninos: 89 }],
  },
  {
    id: 'e2',
    campus_id: CAMPUS,
    nombre: 'Campamento de vacaciones',
    tipo: 'diario',
    dia_semana: null,
    fecha_inicio: '2027-01-06',
    fecha_fin: '2027-01-10',
    precheck_app: true,
    avisos_push: true,
    visitante_una_vez: false,
    integracion_dream_team: true,
    anuncio_mesa: null,
    activo: true,
    horarios: [
      {
        id: 'h2',
        turno_id: 't9',
        nombre: 'Jornada',
        hora: '08:30',
        turno_tipo: 'fechas',
        turno_activo: true,
        fechas: ['2027-01-06', '2027-01-07'],
        abre_min_antes: 45,
        cierra_min_despues: 240,
        turno_creado: true,
        activo: true,
      },
    ],
    sesiones: [],
  },
  {
    id: 'e3',
    campus_id: CAMPUS,
    nombre: 'Navidad en familia 2025',
    tipo: 'unico',
    dia_semana: null,
    fecha_inicio: '2025-12-21',
    fecha_fin: null,
    precheck_app: true,
    avisos_push: true,
    visitante_una_vez: false,
    integracion_dream_team: true,
    anuncio_mesa: null,
    activo: false,
    horarios: [],
    sesiones: [],
  },
])

const turnos = [
  { id: 't1', nombre: 'Primer servicio', hora: '09:00:00', dia_semana: 0 },
  { id: 't2', nombre: 'Segundo servicio', hora: '11:00:00', dia_semana: 0 },
]

function pintar(props: Partial<EventosClientProps> = {}) {
  return render(
    <EventosClient
      campus={[{ id: CAMPUS, nombre: 'Barquisimeto' }]}
      campusId={CAMPUS}
      eventos={eventos}
      errorLectura={null}
      puedeEditar
      turnos={turnos}
      hoy="2026-11-07"
      {...props}
    />,
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  window.history.replaceState(null, '', '/ninos/eventos')
})

describe('reading', () => {
  it('summarizes the campus and opens the first active event', () => {
    pintar()
    expect(screen.getAllByTestId('resumen-eventos')[0]).toHaveTextContent(
      'Barquisimeto · 2 eventos activos · el próximo check-in abre el dom 8 nov a las 8:15',
    )
    expect(screen.getByRole('heading', { level: 2, name: 'Domingo semanal' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Domingo semanal/ })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByText('Abre a las 8:15 · el retiro cierra a las 10:45')).toBeInTheDocument()
    expect(screen.getByText('dom 1 nov 2026')).toBeInTheDocument()
  })

  it('switches events and keeps it in the URL', () => {
    pintar()
    fireEvent.click(screen.getByRole('button', { name: /Campamento de vacaciones/ }))
    expect(screen.getByRole('heading', { level: 2, name: 'Campamento de vacaciones' })).toBeInTheDocument()
    expect(window.location.search).toBe(`?campus=${CAMPUS}&evento=e2`)
    expect(screen.getByText('Del mié 6 al dom 10 ene 2027')).toBeInTheDocument()
    expect(screen.getByText('Todavía no hay sesiones')).toBeInTheDocument()
  })

  it('shows the HINT when the events cannot be read', () => {
    pintar({ eventos: [], errorLectura: 'No tienes permiso para ver los eventos de Niños de este campus.' })
    expect(screen.getByText('No se pudieron cargar los eventos')).toBeInTheDocument()
    expect(screen.getByText('No tienes permiso para ver los eventos de Niños de este campus.')).toBeInTheDocument()
  })
})

describe('read-only (an area coordinator)', () => {
  it('shows the values without any write control', () => {
    pintar({ puedeEditar: false })
    expect(screen.getByText(/Solo quien configura todas las áreas de Niños del campus puede crearlos o cambiarlos/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Nuevo evento' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Archivar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Quitar Primer servicio' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Horario' })).not.toBeInTheDocument()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.getByText('45 min')).toBeInTheDocument()
    expect(screen.getAllByText('Activado').length).toBe(3)
  })
})

describe('check-in window', () => {
  const campoAbre = () => screen.getByRole('textbox', { name: /que abre el check-in, Primer servicio/ })

  it('saves on leaving the field and says the new times', async () => {
    guardarVentanaHorario.mockResolvedValueOnce({ ok: true, data: null })
    pintar()
    fireEvent.change(campoAbre(), { target: { value: '30' } })
    await act(async () => {
      fireEvent.blur(campoAbre())
    })
    expect(guardarVentanaHorario).toHaveBeenCalledWith({ horarioId: 'h1', abreMinAntes: 30, cierraMinDespues: 105 })
    expect(screen.getByText('Guardado')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Primer servicio: Abre a las 8:30 · el retiro cierra a las 10:45.')
    expect(refresh).toHaveBeenCalled()
  })

  it('saves the second field with the first one just saved', async () => {
    guardarVentanaHorario.mockResolvedValue({ ok: true, data: null })
    pintar()
    fireEvent.change(campoAbre(), { target: { value: '30' } })
    await act(async () => {
      fireEvent.blur(campoAbre())
    })
    const cierra = screen.getByRole('textbox', { name: /que cierra el retiro, Primer servicio/ })
    fireEvent.change(cierra, { target: { value: '90' } })
    await act(async () => {
      fireEvent.keyDown(cierra, { key: 'Enter' })
      fireEvent.blur(cierra)
    })
    expect(guardarVentanaHorario).toHaveBeenLastCalledWith({ horarioId: 'h1', abreMinAntes: 30, cierraMinDespues: 90 })
    expect(screen.getByText('Abre a las 8:30 · el retiro cierra a las 10:30')).toBeInTheDocument()
  })

  it('keeps an invalid value marked without calling', async () => {
    pintar()
    fireEvent.change(campoAbre(), { target: { value: '300' } })
    await act(async () => {
      fireEvent.blur(campoAbre())
    })
    expect(guardarVentanaHorario).not.toHaveBeenCalled()
    expect(campoAbre()).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('status')).toHaveTextContent('La apertura y el cierre van de 0 a 240 minutos.')
  })

  it('restores the value on Escape', () => {
    pintar()
    fireEvent.change(campoAbre(), { target: { value: '30' } })
    fireEvent.keyDown(campoAbre(), { key: 'Escape' })
    expect(campoAbre()).toHaveValue('45')
  })

  it('shows the HINT when the RPC refuses', async () => {
    guardarVentanaHorario.mockResolvedValueOnce({ ok: false, message: HINT_AUTORIDAD })
    pintar()
    fireEvent.change(campoAbre(), { target: { value: '30' } })
    await act(async () => {
      fireEvent.blur(campoAbre())
    })
    expect(screen.getByText(`No se pudo guardar · ${HINT_AUTORIDAD}`)).toBeInTheDocument()
    expect(campoAbre()).toHaveAttribute('aria-invalid', 'true')
    expect(refresh).not.toHaveBeenCalled()
  })
})

describe('options and notice', () => {
  it('saves an option with the rest of the event unchanged', async () => {
    guardarEvento.mockResolvedValueOnce({ ok: true, data: { id: 'e1' } })
    pintar()
    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: 'Visitante de una sola vez' }))
    })
    expect(guardarEvento).toHaveBeenCalledWith({
      campusId: CAMPUS,
      eventoId: 'e1',
      nombre: 'Domingo semanal',
      tipo: 'semanal',
      diaSemana: 0,
      fechaInicio: null,
      fechaFin: null,
      anuncioMesa: '',
      precheckApp: true,
      avisosPush: true,
      visitanteUnaVez: true,
      integracionDreamTeam: true,
    })
    expect(screen.getByRole('status')).toHaveTextContent('Visitante de una sola vez: activado.')
  })

  it('saves the notice on leaving the field, with its preview', async () => {
    guardarEvento.mockResolvedValueOnce({ ok: true, data: { id: 'e1' } })
    pintar()
    const texto = screen.getByRole('textbox', { name: 'Texto del anuncio' })
    fireEvent.change(texto, { target: { value: 'Hoy Preadolescentes está cerrado.' } })
    expect(screen.getByLabelText('Vista previa en la mesa')).toHaveTextContent('Hoy Preadolescentes está cerrado.')
    await act(async () => {
      fireEvent.blur(texto)
    })
    expect(guardarEvento).toHaveBeenCalledWith(expect.objectContaining({ eventoId: 'e1', anuncioMesa: 'Hoy Preadolescentes está cerrado.' }))
  })
})

describe('events', () => {
  it('creates a one-day event from the panel', async () => {
    guardarEvento.mockResolvedValueOnce({ ok: true, data: { id: 'e9' } })
    pintar()
    fireEvent.click(screen.getAllByRole('button', { name: 'Nuevo evento' })[0])
    const panel = await screen.findByRole('dialog', { name: 'Nuevo evento' })
    fireEvent.change(within(panel).getByLabelText('Nombre del evento'), { target: { value: 'Noche de padres' } })
    fireEvent.click(within(panel).getByRole('button', { name: 'Un solo día' }))
    fireEvent.click(within(panel).getByRole('button', { name: 'Crear evento' }))
    expect(await within(panel).findByText('Un evento de un solo día necesita su fecha.')).toBeInTheDocument()
    expect(guardarEvento).not.toHaveBeenCalled()

    fireEvent.change(within(panel).getByLabelText('Fecha'), { target: { value: '2026-11-20' } })
    await act(async () => {
      fireEvent.click(within(panel).getByRole('button', { name: 'Crear evento' }))
    })
    expect(guardarEvento).toHaveBeenCalledWith({
      campusId: CAMPUS,
      eventoId: null,
      nombre: 'Noche de padres',
      tipo: 'unico',
      diaSemana: null,
      fechaInicio: '2026-11-20',
      fechaFin: null,
      anuncioMesa: '',
      precheckApp: true,
      avisosPush: true,
      visitanteUnaVez: false,
      integracionDreamTeam: true,
    })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Nuevo evento' })).not.toBeInTheDocument())
  })

  it('keeps the kind of an event with horarios when editing', async () => {
    pintar()
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    const panel = await screen.findByRole('dialog', { name: 'Editar evento' })
    expect(within(panel).getByText('Para cambiar la frecuencia o el día, primero quita sus horarios.')).toBeInTheDocument()
    expect(within(panel).queryByRole('button', { name: 'Diario' })).not.toBeInTheDocument()
  })

  it('shows the HINT inside the panel when the RPC refuses', async () => {
    guardarEvento.mockResolvedValueOnce({ ok: false, message: 'Ya hay un evento activo con ese nombre en este campus.' })
    pintar()
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    const panel = await screen.findByRole('dialog', { name: 'Editar evento' })
    await act(async () => {
      fireEvent.click(within(panel).getByRole('button', { name: 'Guardar cambios' }))
    })
    expect(within(panel).getByText('Ya hay un evento activo con ese nombre en este campus.')).toBeInTheDocument()
  })

  it('archives after confirming, and restores an archived event at once', async () => {
    archivarEvento.mockResolvedValue({ ok: true, data: { activo: false } })
    pintar()
    fireEvent.click(screen.getByRole('button', { name: 'Archivar' }))
    const dialogo = await screen.findByRole('alertdialog', { name: '¿Archivar Domingo semanal?' })
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole('button', { name: 'Archivar' }))
    })
    expect(archivarEvento).toHaveBeenCalledWith({ eventoId: 'e1', activo: false })

    fireEvent.click(screen.getByRole('button', { name: /Navidad en familia 2025/ }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Restaurar' }))
    })
    expect(archivarEvento).toHaveBeenLastCalledWith({ eventoId: 'e3', activo: true })
  })
})

describe('horarios', () => {
  it('links an existing weekly turno of the weekday', async () => {
    agregarHorario.mockResolvedValueOnce({ ok: true, data: { id: 'h9' } })
    pintar()
    fireEvent.click(screen.getByRole('button', { name: 'Horario' }))
    const panel = await screen.findByRole('dialog', { name: 'Agregar horario' })
    const select = within(panel).getByLabelText('Turno de Dream Team de los domingo')
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Segundo servicio · 11:00'])
    await act(async () => {
      fireEvent.click(within(panel).getByRole('button', { name: 'Agregar horario' }))
    })
    expect(agregarHorario).toHaveBeenCalledWith({
      eventoId: 'e1',
      turnoId: 't2',
      nombre: null,
      hora: null,
      abreMinAntes: 120,
      cierraMinDespues: 120,
    })
  })

  it('creates a dated turno for a daily event and checks the hour first', async () => {
    agregarHorario.mockResolvedValueOnce({ ok: true, data: { id: 'h9' } })
    pintar({ eventoInicial: 'e2' })
    fireEvent.click(screen.getByRole('button', { name: 'Horario' }))
    const panel = await screen.findByRole('dialog', { name: 'Agregar horario' })
    expect(within(panel).getByText(/turno «por fechas» de Dream Team/)).toBeInTheDocument()
    fireEvent.click(within(panel).getByRole('button', { name: 'Agregar horario' }))
    expect(await within(panel).findByText('Indica la hora del servicio.')).toBeInTheDocument()
    fireEvent.change(within(panel).getByLabelText('Hora del servicio'), { target: { value: '14:00' } })
    fireEvent.change(within(panel).getByLabelText('Nombre del horario (opcional)'), { target: { value: 'Tarde' } })
    await act(async () => {
      fireEvent.click(within(panel).getByRole('button', { name: 'Agregar horario' }))
    })
    expect(agregarHorario).toHaveBeenCalledWith({
      eventoId: 'e2',
      turnoId: null,
      nombre: 'Tarde',
      hora: '14:00',
      abreMinAntes: 120,
      cierraMinDespues: 120,
    })
  })

  it('removes a horario after confirming and says what happened to its turno', async () => {
    quitarHorario.mockResolvedValueOnce({ ok: true, data: { turnoBorrado: true } })
    pintar({ eventoInicial: 'e2' })
    fireEvent.click(screen.getByRole('button', { name: 'Quitar Jornada' }))
    const dialogo = await screen.findByRole('alertdialog', { name: '¿Quitar el horario Jornada?' })
    expect(dialogo).toHaveTextContent('Si su turno de Dream Team no tiene voluntarios ni asistencias, también se borra.')
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole('button', { name: 'Quitar horario' }))
    })
    expect(quitarHorario).toHaveBeenCalledWith({ horarioId: 'h2' })
    const texto = 'Quitaste el horario Jornada. Su turno de Dream Team no tenía voluntarios ni asistencias, así que también se borró.'
    expect(toastSuccess).toHaveBeenCalledWith('Éxito', { description: texto })
    expect(screen.getByRole('status')).toHaveTextContent(texto)
  })

  it('keeps the dialog open with the HINT when the removal is refused', async () => {
    quitarHorario.mockResolvedValueOnce({ ok: false, message: HINT_AUTORIDAD })
    pintar()
    fireEvent.click(screen.getByRole('button', { name: 'Quitar Primer servicio' }))
    const dialogo = await screen.findByRole('alertdialog')
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole('button', { name: 'Quitar horario' }))
    })
    expect(within(dialogo).getByRole('alert')).toHaveTextContent(HINT_AUTORIDAD)
  })
})
