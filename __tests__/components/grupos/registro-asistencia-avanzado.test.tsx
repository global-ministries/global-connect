/**
 * Attendance register of a Grupo de Vida (U3c redesign).
 *
 * The payload tests pin what the component sends to `registrarAsistenciaV2`;
 * they were written against the old three-select UI and must keep passing,
 * because the redesign changes the UI only, never the saved data.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

const push = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: jest.fn(), refresh: jest.fn() }),
}))
jest.mock('@/hooks/use-notificaciones', () => ({
  useNotificaciones: () => ({ success: jest.fn(), error: jest.fn(), info: jest.fn() }),
}))
const registrarAsistenciaV2 = jest.fn()
jest.mock('@/lib/actions/asistencia-avanzada.actions', () => ({
  registrarAsistenciaV2: (...args: unknown[]) => registrarAsistenciaV2(...args),
}))

import RegistroAsistenciaAvanzado from '@/components/grupos/RegistroAsistenciaAvanzado.client'

const MIEMBROS = [
  { id: 'u1', nombre: 'Ana', apellido: 'Ruiz', rol: 'Líder' },
  { id: 'u2', nombre: 'Beto', apellido: 'Gil' },
  { id: 'u3', nombre: 'Carla', apellido: 'Paz', rol: 'Miembro' },
]

const SIN_DETALLE = {
  motivo_inasistencia: undefined,
  nota: undefined,
  tiempo_tardanza: undefined,
  motivo_tardanza: undefined,
  motivo_tardanza_otro: undefined,
}

type Props = Partial<React.ComponentProps<typeof RegistroAsistenciaAvanzado>>

function montar(props: Props = {}) {
  return render(
    <RegistroAsistenciaAvanzado
      grupoId="g1"
      miembros={MIEMBROS}
      initialData={{ fecha: '2026-10-11', hora: '19:30:00' }}
      {...props}
    />,
  )
}

function seccionAsistencia() {
  return screen.getByRole('region', { name: /Asistencia/ })
}

function estadoDe(nombre: string) {
  return screen.getByRole('radiogroup', { name: `Asistencia de ${nombre}` })
}

async function guardarYLeerPayload(nombreBoton: RegExp = /Guardar asistencia/) {
  fireEvent.click(screen.getByRole('button', { name: nombreBoton }))
  await waitFor(() => expect(registrarAsistenciaV2).toHaveBeenCalledTimes(1))
  return registrarAsistenciaV2.mock.calls[0][0]
}

beforeEach(() => {
  registrarAsistenciaV2.mockReset()
  registrarAsistenciaV2.mockResolvedValue({ success: true, data: { evento_id: 'e1' } })
  push.mockReset()
})

describe('RegistroAsistenciaAvanzado — saved payload (pinned)', () => {
  it('sends the same payload as before for a new meeting with everyone present', async () => {
    montar()

    expect(await guardarYLeerPayload()).toEqual({
      grupo_id: 'g1',
      fecha: '2026-10-11',
      hora: '19:30:00',
      tema: undefined,
      notas: undefined,
      descripcion: undefined,
      puntos_oracion: undefined,
      notas_privadas_lider: undefined,
      conteo_visitantes: undefined,
      no_hubo_reunion: false,
      motivo_no_reunion: undefined,
      asistencias: MIEMBROS.map((m) => ({ usuario_id: m.id, tipo_presencia: 'presente', ...SIN_DETALLE })),
    })
    expect(push).toHaveBeenCalledWith('/grupos-vida/g1/asistencia/e1')
  })

  it('keeps the edit payload: absence reason only for ausente, late detail only for tarde', async () => {
    montar({
      isEdit: true,
      initialData: {
        fecha: '2026-10-04',
        hora: '07:05:00',
        tema: 'Fe',
        estado: {
          u1: { tipo_presencia: 'ausente', motivo: 'Viaje' },
          u2: { tipo_presencia: 'tarde', tiempo_tardanza: '15', motivo_tardanza: 'otro', motivo_tardanza_otro: 'Lluvia' },
          u3: { tipo_presencia: 'justificado', motivo: 'Enfermo' },
        },
      },
    })

    const payload = await guardarYLeerPayload(/Actualizar asistencia/)
    expect(payload).toMatchObject({ fecha: '2026-10-04', hora: '07:05:00', tema: 'Fe', no_hubo_reunion: false })
    expect(payload.asistencias).toEqual([
      { ...SIN_DETALLE, usuario_id: 'u1', tipo_presencia: 'ausente', motivo_inasistencia: 'Viaje' },
      {
        ...SIN_DETALLE,
        usuario_id: 'u2',
        tipo_presencia: 'tarde',
        tiempo_tardanza: '15',
        motivo_tardanza: 'otro',
        motivo_tardanza_otro: 'Lluvia',
      },
      { ...SIN_DETALLE, usuario_id: 'u3', tipo_presencia: 'justificado' },
    ])
  })
})

describe('RegistroAsistenciaAvanzado — meeting time', () => {
  it('uses one native time input and sends HH:MM:00, like the old HH/MM/AM-PM selects', async () => {
    montar()
    const hora = screen.getByLabelText('Hora')
    expect(hora).toHaveAttribute('type', 'time')
    expect(hora).toHaveValue('19:30')

    // Old UI: 7 / 05 / AM produced "07:05:00".
    fireEvent.change(hora, { target: { value: '07:05' } })

    expect((await guardarYLeerPayload()).hora).toBe('07:05:00')
  })

  it('sends no hora when the time is empty, as before', async () => {
    montar({ initialData: { fecha: '2026-10-11' } })
    expect(screen.getByLabelText('Hora')).toHaveValue('')

    expect((await guardarYLeerPayload()).hora).toBeUndefined()
  })
})

describe('RegistroAsistenciaAvanzado — attendance list', () => {
  it('gives each person a radiogroup with the four states and no duplicate badge', () => {
    montar()
    const grupo = estadoDe('Ana Ruiz')
    const radios = within(grupo).getAllByRole('radio')
    expect(radios.map((r) => r.getAttribute('aria-label') ?? r.closest('label')?.textContent)).toEqual([
      'Presente',
      'Tarde',
      'Ausente',
      'Justificado',
    ])
    expect(within(grupo).getByRole('radio', { name: 'Presente' })).toBeChecked()
    // The state is shown once (the checked radio), not again as a badge.
    expect(within(seccionAsistencia()).getAllByText('Presente')).toHaveLength(MIEMBROS.length)
    expect(screen.getByText('Líder')).toBeInTheDocument()
  })

  it('changes a status with one click and updates the counter (tarde counts as present)', () => {
    montar()
    expect(within(seccionAsistencia()).getByText('3 de 3 presentes')).toBeInTheDocument()

    fireEvent.click(within(estadoDe('Beto Gil')).getByRole('radio', { name: 'Ausente' }))
    expect(within(estadoDe('Beto Gil')).getByRole('radio', { name: 'Ausente' })).toBeChecked()
    expect(within(seccionAsistencia()).getByText('2 de 3 presentes')).toBeInTheDocument()

    fireEvent.click(within(estadoDe('Carla Paz')).getByRole('radio', { name: 'Tarde' }))
    expect(within(seccionAsistencia()).getByText('2 de 3 presentes')).toBeInTheDocument()
  })

  it('marks everyone present or absent in bulk', () => {
    montar()
    fireEvent.click(screen.getByRole('button', { name: /Todos ausentes/ }))
    for (const m of MIEMBROS) {
      expect(within(estadoDe(`${m.nombre} ${m.apellido}`)).getByRole('radio', { name: 'Ausente' })).toBeChecked()
    }
    expect(within(seccionAsistencia()).getByText('0 de 3 presentes')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Todos presentes/ }))
    expect(within(seccionAsistencia()).getByText('3 de 3 presentes')).toBeInTheDocument()
  })

  it('shows the absence reason for ausente and justificado, and the late detail for tarde', async () => {
    montar()
    expect(screen.queryByPlaceholderText('Motivo de inasistencia (opcional)')).not.toBeInTheDocument()

    fireEvent.click(within(estadoDe('Ana Ruiz')).getByRole('radio', { name: 'Justificado' }))
    fireEvent.change(screen.getByPlaceholderText('Motivo de inasistencia (opcional)'), {
      target: { value: 'Turno' },
    })

    fireEvent.click(within(estadoDe('Beto Gil')).getByRole('radio', { name: 'Tarde' }))
    fireEvent.change(screen.getByLabelText('¿Cuánto tardó?'), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'trafico' } })

    const { asistencias } = await guardarYLeerPayload()
    expect(asistencias[0]).toMatchObject({ tipo_presencia: 'justificado', motivo_inasistencia: undefined })
    expect(asistencias[1]).toMatchObject({ tipo_presencia: 'tarde', tiempo_tardanza: '10', motivo_tardanza: 'trafico' })
  })

  it('hides individual attendance when there was no meeting', async () => {
    montar()
    fireEvent.click(screen.getByRole('checkbox', { name: /No hubo reunión esta semana/ }))

    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Hora')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Motivo (opcional)'), { target: { value: 'Feriado' } })

    const payload = await guardarYLeerPayload(/Registrar que no hubo reunión/)
    expect(payload).toMatchObject({ no_hubo_reunion: true, motivo_no_reunion: 'Feriado' })
  })

  it('keeps saving disabled when the edit window is closed', () => {
    montar({ ventanaCerrada: true })
    expect(screen.getByText('Ventana de edición cerrada')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Guardar asistencia/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Todos presentes/ })).toBeDisabled()
  })
})
