/**
 * Niños › Voluntarios, the salón of each volunteer (odd/tasks/ninos-checkin-pco.md,
 * T2c, L27): a «Salón» select per volunteer (the campus salones + «Anfitriones /
 * mesa») sets the habitual salón; «Solo hoy» writes the salón of this service
 * instead. Without that data the planilla is as before.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { VoluntariosClient } from '@/components/ninos/voluntarios-client'
import type { FilaVoluntario, TurnoVoluntarios } from '@/lib/platform/ninos/voluntarios'

const rpc = jest.fn()
const toastError = jest.fn()

jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({ rpc }) }))
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace: jest.fn(), push: jest.fn() }) }))
jest.mock('sonner', () => ({ toast: { error: (...a: unknown[]) => toastError(...a), success: jest.fn(), info: jest.fn() } }))

const turnos: TurnoVoluntarios[] = [
  { id: 't9', nombre: 'Domingo 9:00', hora: '09:00:00', orden: 1, dia_semana: 0, campus_id: 'c1', campus: 'Campus Uno' },
]

function fila(servicio_id: string, nombre: string): FilaVoluntario {
  return {
    servicio_id, nombre, apellido: 'Prueba', area_id: 'aw', area: 'Waumba Land', equipo_id: 'em', equipo: 'Maternal',
    rol: 'Voluntario', esperado: true, sin_turno: false, estado: null,
  }
}

const planilla = {
  turno_id: 't9', turno: 'Domingo 9:00', fecha: '2026-11-08', hoy: '2026-11-08', editable: true,
  areas: [{ id: 'aw', nombre: 'Waumba Land' }],
  voluntarios: [fila('v1', 'Ana'), fila('v2', 'Luis'), fila('v3', 'María')],
}

const salones = {
  salones: [
    { id: 's1', nombre: 'Maternal' },
    { id: 's2', nombre: 'Preescolar I' },
  ],
  asignaciones: [
    { servicio_id: 'v1', salon_id: 's1', salon: 'Maternal', habitual_id: 's1', es_del_dia: false },
    { servicio_id: 'v2', salon_id: 's2', salon: 'Preescolar I', habitual_id: 's1', es_del_dia: true },
  ],
}

let respuestaAsignar: { data: unknown; error: unknown } = { data: {}, error: null }

function responder(datosSalones: unknown, errorSalones = false) {
  rpc.mockImplementation((nombre: string) => {
    if (nombre === 'ninos_voluntarios_planilla') return Promise.resolve({ data: planilla, error: null })
    if (nombre === 'ninos_voluntarios_salones') {
      return Promise.resolve(errorSalones ? { data: null, error: { message: 'sin_autoridad' } } : { data: datosSalones, error: null })
    }
    if (nombre === 'ninos_voluntario_salon_asignar') return Promise.resolve(respuestaAsignar)
    return Promise.resolve({ data: null, error: null })
  })
}

beforeEach(() => {
  rpc.mockReset()
  toastError.mockReset()
  respuestaAsignar = { data: {}, error: null }
  responder(salones)
})

function renderVoluntarios() {
  return render(<VoluntariosClient turnos={turnos} servicio={{ turnoId: 't9', fecha: '2026-11-08' }} areaId="aw" hoy="2026-11-08" />)
}

const bloque = (id: string) => screen.getByTestId(`salon-${id}`)
const select = (id: string) => within(bloque(id)).getByLabelText('Salón') as HTMLSelectElement
const soloHoy = (id: string) => within(bloque(id)).getByRole('checkbox', { name: 'Solo hoy' }) as HTMLInputElement

describe('VoluntariosClient · salón de cada voluntario', () => {
  it('shows a «Salón» select per volunteer with the campus salones and «Anfitriones / mesa»', async () => {
    renderVoluntarios()
    await screen.findByTestId('salon-v1')
    expect(rpc).toHaveBeenCalledWith('ninos_voluntarios_salones', { p_turno_id: 't9', p_fecha: '2026-11-08' })
    expect([...select('v1').options].map((o) => o.textContent)).toEqual(['Anfitriones / mesa', 'Maternal', 'Preescolar I'])
    expect(select('v1').value).toBe('s1')
    expect(soloHoy('v1').checked).toBe(false)
    expect(select('v2').value).toBe('s2')
    expect(soloHoy('v2').checked).toBe(true)
    expect(select('v3').value).toBe('')
    // The row and its attendance buttons are still there.
    expect(within(screen.getByTestId('voluntario-v1')).getByRole('button', { name: 'Presente' })).toBeInTheDocument()
  })

  it('changing the salón sets the habitual one', async () => {
    renderVoluntarios()
    await screen.findByTestId('salon-v3')
    fireEvent.change(select('v3'), { target: { value: 's2' } })
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('ninos_voluntario_salon_asignar', { p_servicio_id: 'v3', p_salon_id: 's2', p_turno_id: null, p_fecha: null }),
    )
    expect(select('v3').value).toBe('s2')
  })

  it('«Anfitriones / mesa» clears the habitual salón', async () => {
    renderVoluntarios()
    await screen.findByTestId('salon-v1')
    fireEvent.change(select('v1'), { target: { value: '' } })
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('ninos_voluntario_salon_asignar', { p_servicio_id: 'v1', p_salon_id: null, p_turno_id: null, p_fecha: null }),
    )
  })

  it('with «Solo hoy» the change is only for this service', async () => {
    renderVoluntarios()
    await screen.findByTestId('salon-v1')
    fireEvent.click(soloHoy('v1'))
    expect(rpc).not.toHaveBeenCalledWith('ninos_voluntario_salon_asignar', expect.anything())
    fireEvent.change(select('v1'), { target: { value: 's2' } })
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('ninos_voluntario_salon_asignar', { p_servicio_id: 'v1', p_salon_id: 's2', p_turno_id: 't9', p_fecha: '2026-11-08' }),
    )
  })

  it('unchecking «Solo hoy» goes back to the habitual salón for this service', async () => {
    renderVoluntarios()
    await screen.findByTestId('salon-v2')
    fireEvent.click(soloHoy('v2'))
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('ninos_voluntario_salon_asignar', { p_servicio_id: 'v2', p_salon_id: 's1', p_turno_id: 't9', p_fecha: '2026-11-08' }),
    )
    await waitFor(() => expect(select('v2').value).toBe('s1'))
  })

  it('an error shows the HINT and puts the salón back', async () => {
    respuestaAsignar = { data: null, error: { message: 'sin_autoridad', hint: 'No tienes permiso para asignar el salón de este voluntario.' } }
    renderVoluntarios()
    await screen.findByTestId('salon-v1')
    fireEvent.change(select('v1'), { target: { value: 's2' } })
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Error', { description: 'No tienes permiso para asignar el salón de este voluntario.' }))
    expect(select('v1').value).toBe('s1')
  })

  it('without salón data the planilla renders as today', async () => {
    responder(null, true)
    renderVoluntarios()
    expect(await screen.findByTestId('voluntario-v1')).toBeInTheDocument()
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('ninos_voluntarios_salones', expect.anything()))
    expect(screen.queryByTestId('salon-v1')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Salón')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
