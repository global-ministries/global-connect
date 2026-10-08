import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { SalonClient } from '@/components/ninos/salon-client'
import type { TurnoFila } from '@/lib/platform/ninos/checkin'

const rpc = jest.fn()
const replace = jest.fn()

jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({ rpc }) }))
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: jest.fn() }) }))

const turnos: TurnoFila[] = [{ id: 't9', nombre: 'Domingo 9:00', hora: '09:00:00', orden: 1 }]
const salones = [
  { id: 's1', nombre: 'Maternal' },
  { id: 's2', nombre: '1º grado' },
]

const lista = [
  {
    nino_id: 'n1', nombre: 'Luis', apellido: 'Pérez', fecha_nacimiento: '2025-04-01', grado: null, codigo: '4821',
    entrada_at: '2026-10-11T13:05:00Z', alergias: 'maní', necesidades_especiales: null, habitos: null,
    puede_comer: false, cambio_panal: true, autoriza_imagen: false,
  },
]

beforeEach(() => {
  rpc.mockReset()
  replace.mockReset()
  rpc.mockImplementation((nombre: string) =>
    Promise.resolve(nombre === 'ninos_lista_salon' ? { data: lista, error: null } : { data: [], error: null }),
  )
})

function renderSalon(puedeOperar: boolean) {
  return render(
    <SalonClient salones={salones} turnos={turnos} servicio={{ turnoId: 't9', fecha: '2026-10-11' }} salonId="s1" puedeOperar={puedeOperar} />,
  )
}

describe('SalonClient', () => {
  it('lists the children present with age, code and alerts, allergies in red', async () => {
    renderSalon(false)
    const fila = await screen.findByTestId('fila-n1')
    expect(within(fila).getByText('Luis Pérez')).toBeInTheDocument()
    expect(within(fila).getByText(/18 meses/)).toBeInTheDocument()
    expect(within(fila).getByText('4821')).toBeInTheDocument()
    expect(within(fila).getByText('Alergias: maní')).toHaveClass('text-destructive')
    expect(within(fila).getByText('Cambio de pañal')).toBeInTheDocument()
    expect(within(fila).getByText('No puede comer merienda')).toBeInTheDocument()
    expect(within(fila).getByText('Sin fotos')).toBeInTheDocument()
    expect(rpc).toHaveBeenCalledWith('ninos_lista_salon', { p_salon_id: 's1', p_fecha: '2026-10-11', p_turno_id: 't9' })
  })

  it('is read-only for a líder (no check-out)', async () => {
    renderSalon(false)
    await screen.findByTestId('fila-n1')
    expect(screen.queryByLabelText('Código de seguridad')).not.toBeInTheDocument()
  })

  it('offers check-out to an operator', async () => {
    renderSalon(true)
    await screen.findByTestId('fila-n1')
    expect(screen.getByLabelText('Código de seguridad')).toBeInTheDocument()
  })

  it('changing the room keeps it in the URL and reloads the list', async () => {
    renderSalon(false)
    await screen.findByTestId('fila-n1')
    fireEvent.change(screen.getByLabelText('Salón'), { target: { value: 's2' } })
    expect(replace).toHaveBeenCalledWith('/ninos/salon?turno=t9&fecha=2026-10-11&salon=s2')
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('ninos_lista_salon', { p_salon_id: 's2', p_fecha: '2026-10-11', p_turno_id: 't9' }),
    )
  })

  it('refreshes when the window regains focus', async () => {
    renderSalon(false)
    await screen.findByTestId('fila-n1')
    const antes = rpc.mock.calls.length
    fireEvent(window, new Event('focus'))
    await waitFor(() => expect(rpc.mock.calls.length).toBeGreaterThan(antes))
  })
})
