/**
 * Niños › Salón, voluntarios de hoy (odd/tasks/ninos-checkin-pco.md, T2c, S7,
 * S5): the salón header shows the children and volunteers, who arrived and
 * whether there are enough, read-only; without that data the screen is as
 * before.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { SalonClient } from '@/components/ninos/salon-client'
import type { TurnoFila } from '@/lib/platform/ninos/checkin'

const rpc = jest.fn()

jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({ rpc }) }))
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace: jest.fn(), push: jest.fn() }) }))

const turnos: TurnoFila[] = [{ id: 't9', nombre: 'Domingo 9:00', hora: '09:00:00', orden: 1 }]
const salones = [{ id: 's1', nombre: 'Preescolar II' }]

const nino = (n: number) => ({
  nino_id: `n${n}`, nombre: 'Niño', apellido: `N${n}`, fecha_nacimiento: '2023-01-01', grado: null, codigo: `10${n}`,
  entrada_at: '2026-11-08T13:05:00Z', alergias: null, necesidades_especiales: null, habitos: null,
  puede_comer: null, cambio_panal: null, autoriza_imagen: null,
})

const vol = (id: string, nombre: string, estado: string | null, marcado_at: string | null, esperado = true) => ({
  servicio_id: id, nombre, apellido: 'Prueba', rol: 'Voluntario', esperado, estado, marcado_at,
})

function voluntarios(over: Record<string, unknown> = {}) {
  return {
    salon_id: 's1', capacidad: 18, ninos_por_voluntario: 6, min_voluntarios: 2, asignados: 2,
    voluntarios: [
      vol('v1', 'Yelitza', 'presente', '2026-11-08T12:35:00Z'),
      vol('v2', 'Nelson', null, null),
    ],
    ...over,
  }
}

function responder(lista: unknown[], datos: unknown, errorVoluntarios = false) {
  rpc.mockImplementation((nombre: string) => {
    if (nombre === 'ninos_lista_salon') return Promise.resolve({ data: lista, error: null })
    if (nombre === 'ninos_salon_voluntarios') {
      return Promise.resolve(errorVoluntarios ? { data: null, error: { message: 'sin_autoridad' } } : { data: datos, error: null })
    }
    return Promise.resolve({ data: [], error: null })
  })
}

function renderSalon() {
  return render(
    <SalonClient salones={salones} turnos={turnos} servicio={{ turnoId: 't9', fecha: '2026-11-08' }} salonId="s1" puedeOperar={false} />,
  )
}

beforeEach(() => rpc.mockReset())

describe('SalonClient · voluntarios de hoy', () => {
  it('shows children / capacity, volunteers who arrived, and «Faltan voluntarios» with how many', async () => {
    responder([1, 2, 3, 4, 5, 6, 7].map(nino), voluntarios())
    renderSalon()
    const bloque = await screen.findByRole('region', { name: 'Voluntarios de hoy' })
    expect(within(bloque).getByText('7/18 niños · 1 voluntario')).toBeInTheDocument()
    expect(within(bloque).getByText('Faltan voluntarios · falta 1')).toBeInTheDocument()
    expect(within(bloque).getByText('máximo 6 niños por voluntario, mínimo 2 voluntarios')).toBeInTheDocument()
    const filas = within(bloque).getAllByRole('listitem')
    expect(filas).toHaveLength(2)
    expect(within(filas[0]).getByText('Yelitza Prueba')).toBeInTheDocument()
    expect(within(filas[0]).getByText('Llegó 08:35')).toBeInTheDocument()
    expect(within(filas[1]).getByText('Pendiente')).toBeInTheDocument()
    expect(within(bloque).getByText('La asistencia se marca en la planilla de Voluntarios.')).toBeInTheDocument()
    expect(rpc).toHaveBeenCalledWith('ninos_salon_voluntarios', { p_salon_id: 's1', p_turno_id: 't9', p_fecha: '2026-11-08' })
  })

  it('«Hay voluntarios suficientes» when the ones who arrived cover the rule', async () => {
    responder([1, 2, 3].map(nino), voluntarios({ min_voluntarios: 0 }))
    renderSalon()
    const bloque = await screen.findByRole('region', { name: 'Voluntarios de hoy' })
    expect(within(bloque).getByText('3/18 niños · 1 voluntario')).toBeInTheDocument()
    expect(within(bloque).getByText('Hay voluntarios suficientes')).toBeInTheDocument()
    expect(within(bloque).queryByText(/Faltan voluntarios/)).not.toBeInTheDocument()
  })

  it('a non-expected volunteer who arrived says so; no rule means no verdict', async () => {
    responder([nino(1)], voluntarios({ ninos_por_voluntario: null, min_voluntarios: 0, voluntarios: [vol('v3', 'Karla', 'presente', '2026-11-08T12:40:00Z', false)] }))
    renderSalon()
    const bloque = await screen.findByRole('region', { name: 'Voluntarios de hoy' })
    expect(within(bloque).getByText('Vino sin estar convocado')).toBeInTheDocument()
    expect(within(bloque).queryByText('Hay voluntarios suficientes')).not.toBeInTheDocument()
    expect(within(bloque).queryByText(/Faltan voluntarios/)).not.toBeInTheDocument()
  })

  it('a salón nobody is assigned to says where to assign them, without a verdict', async () => {
    responder([nino(1)], voluntarios({ asignados: 0, voluntarios: [] }))
    renderSalon()
    const bloque = await screen.findByRole('region', { name: 'Voluntarios de hoy' })
    expect(within(bloque).getByText('Todavía no hay voluntarios asignados a este salón. Se asignan en la planilla de Voluntarios.')).toBeInTheDocument()
    expect(within(bloque).queryByText(/Faltan voluntarios/)).not.toBeInTheDocument()
    expect(within(bloque).queryByText('Hay voluntarios suficientes')).not.toBeInTheDocument()
  })

  it('assigned volunteers none of whom serves this horario: the verdict still shows', async () => {
    responder([nino(1)], voluntarios({ asignados: 3, voluntarios: [] }))
    renderSalon()
    const bloque = await screen.findByRole('region', { name: 'Voluntarios de hoy' })
    expect(within(bloque).getByText('A ninguno de sus voluntarios le toca este horario.')).toBeInTheDocument()
    expect(within(bloque).getByText('Faltan voluntarios · faltan 2')).toBeInTheDocument()
  })

  it('is read-only: no control to mark volunteers, and never says «proporción»', async () => {
    responder([nino(1)], voluntarios())
    const { container } = renderSalon()
    const bloque = await screen.findByRole('region', { name: 'Voluntarios de hoy' })
    expect(within(bloque).queryAllByRole('button')).toHaveLength(0)
    expect(within(bloque).queryAllByRole('checkbox')).toHaveLength(0)
    expect(container.textContent?.toLowerCase()).not.toContain('proporción')
  })

  it('without volunteers data the salón renders as today', async () => {
    responder([nino(1)], null, true)
    renderSalon()
    expect(await screen.findByTestId('fila-n1')).toBeInTheDocument()
    expect(screen.getByText('1 niño presente')).toBeInTheDocument()
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('ninos_salon_voluntarios', expect.anything()))
    expect(screen.queryByRole('region', { name: 'Voluntarios de hoy' })).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('refreshes the volunteers with the list when the window regains focus', async () => {
    responder([nino(1)], voluntarios())
    renderSalon()
    await screen.findByRole('region', { name: 'Voluntarios de hoy' })
    const antes = rpc.mock.calls.filter(([n]) => n === 'ninos_salon_voluntarios').length
    responder([nino(1)], voluntarios({ voluntarios: [vol('v1', 'Yelitza', 'presente', '2026-11-08T12:35:00Z'), vol('v2', 'Nelson', 'presente', '2026-11-08T12:55:00Z')] }))
    fireEvent(window, new Event('focus'))
    await waitFor(() => expect(rpc.mock.calls.filter(([n]) => n === 'ninos_salon_voluntarios').length).toBeGreaterThan(antes))
    expect(await screen.findByText('1/18 niños · 2 voluntarios')).toBeInTheDocument()
  })
})
