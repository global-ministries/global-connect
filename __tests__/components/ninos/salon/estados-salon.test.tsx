/**
 * Niños › Salón, Esperados / Aquí / Retirados (odd/tasks/ninos-checkin-pco.md,
 * T2b, S6, S9.4; artboard 06-salon-celular): the tabs with counts, the child
 * sheet (alerts, «Mover a otro salón» in one step, «Retirar» with the pickup
 * by code) and «Llegó al salón» for an Esperado. T2f (S9.5): «Mover» lists
 * only the salones that correspond to the child's age or grade.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { SalonClient } from '@/components/ninos/salon-client'
import type { TurnoFila } from '@/lib/platform/ninos/checkin'

const rpc = jest.fn()

jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({ rpc }) }))
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace: jest.fn(), push: jest.fn() }) }))

const turnos: TurnoFila[] = [{ id: 't9', nombre: 'Domingo 9:00', hora: '09:00:00', orden: 1 }]
const salones = [
  { id: 's1', nombre: 'Sala A' },
  { id: 's2', nombre: 'Sala B' },
]

const lista = [
  {
    nino_id: 'n1', nombre: 'Luis', apellido: 'Pérez', fecha_nacimiento: '2025-04-01', grado: null, codigo: '4821',
    entrada_at: '2026-11-08T12:58:00Z', alergias: 'maní', necesidades_especiales: null, habitos: null,
    puede_comer: null, cambio_panal: true, autoriza_imagen: false,
  },
]

function estado(over: Record<string, unknown> = {}) {
  return {
    salon_id: 's1',
    puede_operar: true,
    puede_llegar: true,
    esperados: [
      {
        nino_id: 'n21', nombre: 'Paula', apellido: 'Ríos', fecha_nacimiento: '2023-05-01', grado: null,
        avisado_at: '2026-11-08T13:04:00Z', avisado_por: { nombre: 'Carolina', apellido: 'Ríos' },
        alergias: null, necesidades_especiales: null, habitos: null, puede_comer: null, cambio_panal: null, autoriza_imagen: null,
      },
    ],
    retirados: [
      {
        checkin_id: 'c30', nino_id: 'n30', nombre: 'Elena', apellido: 'Ramírez', fecha_nacimiento: '2023-01-01', grado: null,
        codigo: '2222', entrada_at: '2026-11-08T12:40:00Z', salida_at: '2026-11-08T13:08:00Z', retirado_por_nombre: 'Ana Ramírez',
      },
    ],
    movimientos: [],
    destinos: [{ id: 's2', nombre: 'Sala B', capacidad: 18, ocupados: 12, abierto: true }],
    ...over,
  }
}

type Respuestas = { estado?: unknown; mover?: unknown; llegada?: unknown }

function responder(r: Respuestas = {}) {
  rpc.mockImplementation((nombre: string) => {
    if (nombre === 'ninos_lista_salon') return Promise.resolve({ data: lista, error: null })
    if (nombre === 'ninos_salon_estado') return Promise.resolve({ data: r.estado === undefined ? estado() : r.estado, error: null })
    if (nombre === 'ninos_mover_salon') return Promise.resolve(r.mover ?? { data: { codigo: '4821', salon_destino: 'Sala B', ocupacion: 13, capacidad: 18 }, error: null })
    if (nombre === 'ninos_checkin_desde_salon') return Promise.resolve(r.llegada ?? { data: { codigo: '3381', salon_id: 's1' }, error: null })
    return Promise.resolve({ data: [], error: null })
  })
}

function renderSalon(puedeOperar = true) {
  return render(
    <SalonClient salones={salones} turnos={turnos} servicio={{ turnoId: 't9', fecha: '2026-11-08' }} salonId="s1" puedeOperar={puedeOperar} />,
  )
}

const llamadas = (nombre: string) => rpc.mock.calls.filter(([n]) => n === nombre)

beforeEach(() => rpc.mockReset())

describe('SalonClient · Esperados / Aquí / Retirados', () => {
  it('shows the three tabs with counts, Aquí first selected with today’s list', async () => {
    responder()
    renderSalon()
    const tabs = await screen.findByRole('group', { name: 'Mostrar' })
    expect(within(tabs).getByRole('button', { name: 'Esperados 1' })).toHaveAttribute('aria-pressed', 'false')
    expect(within(tabs).getByRole('button', { name: 'Aquí 1' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(tabs).getByRole('button', { name: 'Retirados 1' })).toBeInTheDocument()
    expect(screen.getByTestId('fila-n1')).toBeInTheDocument()
    expect(rpc).toHaveBeenCalledWith('ninos_salon_estado', { p_salon_id: 's1', p_turno_id: 't9', p_fecha: '2026-11-08' })
  })

  it('Esperados lists who is on the way; Retirados says when and with whom', async () => {
    responder()
    renderSalon()
    fireEvent.click(await screen.findByRole('button', { name: 'Esperados 1' }))
    const esperados = screen.getByRole('list', { name: 'Esperados' })
    expect(within(esperados).getByText('Paula Ríos')).toBeInTheDocument()
    expect(within(esperados).getByText('Avisó 09:04 · Carolina Ríos')).toBeInTheDocument()
    expect(screen.queryByTestId('fila-n1')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retirados 1' }))
    const retirados = screen.getByRole('list', { name: 'Retirados' })
    expect(within(retirados).getByText('Elena Ramírez')).toBeInTheDocument()
    expect(within(retirados).getByText('Salió 09:08 con Ana Ramírez')).toBeInTheDocument()
  })

  it('empty tabs say so in plain words', async () => {
    responder({ estado: estado({ esperados: [], retirados: [] }) })
    renderSalon()
    fireEvent.click(await screen.findByRole('button', { name: 'Esperados 0' }))
    expect(screen.getByText('No hay más niños avisados para este salón.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retirados 0' }))
    expect(screen.getByText('Nadie ha salido todavía.')).toBeInTheDocument()
  })

  it('the child sheet shows the alerts and moves to another salón in one step', async () => {
    responder()
    renderSalon()
    fireEvent.click(within(await screen.findByTestId('fila-n1')).getByRole('button', { name: 'Abrir Luis Pérez' }))
    const hoja = await screen.findByRole('dialog')
    expect(within(hoja).getByText('Alergias: maní')).toBeInTheDocument()
    expect(within(hoja).getByText('Cambio de pañal')).toBeInTheDocument()
    expect(within(hoja).getByText('Sin fotos')).toBeInTheDocument()
    const mover = within(hoja).getByRole('button', { name: /Mover a otro salón/ })
    expect(mover).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(mover)
    expect(mover).toHaveAttribute('aria-expanded', 'true')
    const antes = llamadas('ninos_lista_salon').length
    fireEvent.click(within(hoja).getByRole('button', { name: /Sala B/ }))
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('ninos_mover_salon', {
        p_nino_id: 'n1', p_turno_id: 't9', p_fecha: '2026-11-08', p_salon_destino_id: 's2', p_motivo: null,
      }),
    )
    expect(await screen.findByText('Luis Pérez ahora está en Sala B. Su código 4821 sigue sirviendo.')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(llamadas('ninos_lista_salon').length).toBeGreaterThan(antes)
  })

  it('«Mover a otro salón» lists only the salones that correspond to the child (S9.5)', async () => {
    responder({
      estado: estado({
        destinos: [
          { id: 's2', nombre: 'Sala B', capacidad: 18, ocupados: 12, abierto: true },
          { id: 's3', nombre: 'Preescolar', capacidad: 20, ocupados: 4, abierto: true },
        ],
        destinos_por_nino: { n1: ['s2'] },
      }),
    })
    renderSalon()
    fireEvent.click(within(await screen.findByTestId('fila-n1')).getByRole('button', { name: 'Abrir Luis Pérez' }))
    const hoja = await screen.findByRole('dialog')
    fireEvent.click(within(hoja).getByRole('button', { name: /Mover a otro salón/ }))
    const grupo = within(hoja).getByRole('group', { name: 'Salones disponibles' })
    expect(within(grupo).getByRole('button', { name: /Sala B/ })).toBeInTheDocument()
    expect(within(grupo).queryByRole('button', { name: /Preescolar/ })).not.toBeInTheDocument()
  })

  it('when no other salón corresponds the sheet says so and offers none (S9.5)', async () => {
    responder({ estado: estado({ destinos_por_nino: { n1: [] } }) })
    renderSalon()
    fireEvent.click(within(await screen.findByTestId('fila-n1')).getByRole('button', { name: 'Abrir Luis Pérez' }))
    const hoja = await screen.findByRole('dialog')
    fireEvent.click(within(hoja).getByRole('button', { name: /Mover a otro salón/ }))
    const grupo = within(hoja).getByRole('group', { name: 'Salones disponibles' })
    expect(within(grupo).getByText('No hay otro salón para su edad o grado.')).toBeInTheDocument()
    expect(within(grupo).queryByRole('button')).not.toBeInTheDocument()
  })

  it('a move refused because the salón does not correspond shows the reason', async () => {
    responder({ mover: { data: null, error: { message: 'salon_no_corresponde', hint: 'Ese salón no corresponde a la edad o el grado del niño.' } } })
    renderSalon()
    fireEvent.click(within(await screen.findByTestId('fila-n1')).getByRole('button', { name: 'Abrir Luis Pérez' }))
    const hoja = await screen.findByRole('dialog')
    fireEvent.click(within(hoja).getByRole('button', { name: /Mover a otro salón/ }))
    fireEvent.click(within(hoja).getByRole('button', { name: /Sala B/ }))
    expect(await within(hoja).findByRole('alert')).toHaveTextContent('Ese salón no corresponde a la edad o el grado del niño.')
  })

  it('a refused move keeps the sheet open with the reason', async () => {
    responder({ mover: { data: null, error: { message: 'sin_autoridad', hint: 'No tienes permiso para pasar niños a ese salón.' } } })
    renderSalon()
    fireEvent.click(within(await screen.findByTestId('fila-n1')).getByRole('button', { name: 'Abrir Luis Pérez' }))
    const hoja = await screen.findByRole('dialog')
    fireEvent.click(within(hoja).getByRole('button', { name: /Mover a otro salón/ }))
    fireEvent.click(within(hoja).getByRole('button', { name: /Sala B/ }))
    expect(await within(hoja).findByRole('alert')).toHaveTextContent('No tienes permiso para pasar niños a ese salón.')
  })

  it('«Retirar» goes to the pickup by code with the code to compare', async () => {
    responder()
    renderSalon()
    fireEvent.click(within(await screen.findByTestId('fila-n1')).getByRole('button', { name: 'Abrir Luis Pérez' }))
    const hoja = await screen.findByRole('dialog')
    expect(within(hoja).getByText(/La etiqueta del adulto debe decir/)).toHaveTextContent('La etiqueta del adulto debe decir 4821.')
    fireEvent.click(within(hoja).getByRole('button', { name: /Retirar/ }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(screen.getByLabelText('Código de seguridad')).toHaveFocus())
    expect(screen.getByText('Escribe el código 4821 en Retiro y elige quién retira a Luis.')).toBeInTheDocument()
  })

  it('without the right to operate the sheet only reads: no move, no pickup', async () => {
    responder({ estado: estado({ puede_operar: false, destinos: [] }) })
    renderSalon(false)
    fireEvent.click(within(await screen.findByTestId('fila-n1')).getByRole('button', { name: 'Abrir Luis Pérez' }))
    const hoja = await screen.findByRole('dialog')
    expect(within(hoja).getByText('Alergias: maní')).toBeInTheDocument()
    expect(within(hoja).queryByRole('button', { name: /Mover a otro salón/ })).not.toBeInTheDocument()
    expect(within(hoja).queryByRole('button', { name: /Retirar/ })).not.toBeInTheDocument()
  })

  it('«Llegó al salón» checks in an Esperado and says the new code', async () => {
    responder()
    renderSalon()
    fireEvent.click(await screen.findByRole('button', { name: 'Esperados 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Abrir Paula Ríos' }))
    const hoja = await screen.findByRole('dialog')
    expect(within(hoja).getByText(/Si llega directo al salón/)).toBeInTheDocument()
    fireEvent.click(within(hoja).getByRole('button', { name: 'Llegó al salón' }))
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('ninos_checkin_desde_salon', { p_nino_id: 'n21', p_salon_id: 's1', p_turno_id: 't9', p_fecha: '2026-11-08' }),
    )
    expect(
      await screen.findByText('Paula Ríos quedó en el salón con el código 3381. Su representante lo ve en su teléfono.'),
    ).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('a refused «Llegó» shows the reason in the sheet', async () => {
    responder({ llegada: { data: null, error: { message: 'otro_salon', hint: 'Este niño está esperado en otro salón.' } } })
    renderSalon()
    fireEvent.click(await screen.findByRole('button', { name: 'Esperados 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Abrir Paula Ríos' }))
    const hoja = await screen.findByRole('dialog')
    fireEvent.click(within(hoja).getByRole('button', { name: 'Llegó al salón' }))
    expect(await within(hoja).findByRole('alert')).toHaveTextContent('Este niño está esperado en otro salón.')
  })

  it('a Líder who sees the salón but does not operate checks in an Esperado (L32), without move or pickup', async () => {
    responder({ estado: estado({ puede_llegar: true, puede_operar: false, destinos: [] }) })
    renderSalon(false)
    fireEvent.click(await screen.findByRole('button', { name: 'Esperados 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Abrir Paula Ríos' }))
    const hoja = await screen.findByRole('dialog')
    fireEvent.click(within(hoja).getByRole('button', { name: 'Llegó al salón' }))
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('ninos_checkin_desde_salon', expect.objectContaining({ p_nino_id: 'n21' })))
    fireEvent.click(await screen.findByRole('button', { name: 'Aquí 1' }))
    fireEvent.click(within(screen.getByTestId('fila-n1')).getByRole('button', { name: 'Abrir Luis Pérez' }))
    const hojaAqui = await screen.findByRole('dialog')
    expect(within(hojaAqui).queryByRole('button', { name: /Mover a otro salón/ })).not.toBeInTheDocument()
    expect(within(hojaAqui).queryByRole('button', { name: /Retirar/ })).not.toBeInTheDocument()
  })

  it('without «Llegó» (the server says no) the sheet points to the desk instead of the button', async () => {
    responder({ estado: estado({ puede_llegar: false, puede_operar: false }) })
    renderSalon(false)
    fireEvent.click(await screen.findByRole('button', { name: 'Esperados 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Abrir Paula Ríos' }))
    const hoja = await screen.findByRole('dialog')
    expect(within(hoja).queryByRole('button', { name: 'Llegó al salón' })).not.toBeInTheDocument()
    expect(within(hoja).getByText('Su llegada se registra en la mesa.')).toBeInTheDocument()
  })

  it('without the salón data the screen is today’s list, without tabs or sheet', async () => {
    responder({ estado: [] })
    renderSalon()
    expect(await screen.findByTestId('fila-n1')).toBeInTheDocument()
    await waitFor(() => expect(llamadas('ninos_salon_estado').length).toBeGreaterThan(0))
    expect(screen.queryByRole('group', { name: 'Mostrar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Abrir Luis Pérez' })).not.toBeInTheDocument()
  })
})
