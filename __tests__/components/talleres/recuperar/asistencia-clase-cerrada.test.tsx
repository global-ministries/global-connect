/**
 * @jest-environment jsdom
 *
 * T8b (odd/tasks/talleres-reserva-publica.md, S17) — a cerrada clase on the
 * grupo page: presente / ausente / «R · Recuperada» rows, «Recuperar clase»
 * on an ausente row only for whoever may register it, the side panel form
 * (fecha, quién la dio, nota) and «Anular».
 */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

const registrarMock = jest.fn()
const anularMock = jest.fn()
const refreshMock = jest.fn()
const successMock = jest.fn()

jest.mock('@/lib/platform/talleres/recuperar-clase-actions', () => ({
  registrarRecuperacion: (...a: unknown[]) => registrarMock(...a),
  anularRecuperacion: (...a: unknown[]) => anularMock(...a),
}))
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: refreshMock }) }))
jest.mock('@/hooks/use-notificaciones', () => ({
  useNotificaciones: () => ({ success: successMock, error: jest.fn(), info: jest.fn() }),
}))

import { AsistenciaClaseCerrada } from '@/components/talleres/recuperar/asistencia-clase-cerrada.client'

const RUTA = { tallerSlug: 'mujer-de-hoy', edicionId: 'e-1', grupoId: 'g-1' }

function props(overrides: Partial<Parameters<typeof AsistenciaClaseCerrada>[0]> = {}) {
  return {
    ...RUTA,
    sesionId: 's-1',
    numero: 2,
    tema: 'Mis emociones',
    fechaClase: '2026-10-15',
    hoy: '2026-10-26',
    filas: [
      { id: 'a-1', inscripcionId: 'i-1', personaId: 'p-1', nombre: 'Ana Pérez', estado: 'presente' as const, motivo: null },
      { id: 'a-2', inscripcionId: 'i-2', personaId: 'p-2', nombre: 'Rosa Díaz', estado: 'ausente' as const, motivo: 'Viaje' },
      { id: 'a-3', inscripcionId: 'i-3', personaId: 'p-3', nombre: 'Luisa Mora', estado: 'ausente' as const, motivo: null },
    ],
    recuperaciones: [{ id: 'r-1', personaId: 'p-3', fecha: '2026-10-24', dadaPorNombre: 'Yusmary Rojas', nota: null }],
    puedeRecuperar: true,
    facilitadores: [
      { personaId: 'f-1', nombre: 'Yusmary Rojas' },
      { personaId: 'f-2', nombre: 'Thais Briceño' },
    ],
    dadaPorDefecto: 'f-1',
    ...overrides,
  }
}

beforeEach(() => {
  registrarMock.mockReset()
  anularMock.mockReset()
  refreshMock.mockReset()
  successMock.mockReset()
})

describe('AsistenciaClaseCerrada', () => {
  it('shows each state, the recovered mark with date and who gave it, and the legend', () => {
    render(<AsistenciaClaseCerrada {...props()} />)
    expect(screen.getByRole('heading', { name: 'Clase 2 · Mis emociones' })).toBeInTheDocument()
    expect(screen.getByText('Presentes 1 · Recuperadas 1 · Ausentes 1')).toBeInTheDocument()

    const ana = screen.getByRole('listitem', { name: 'Ana Pérez' })
    expect(within(ana).getByText('Presente')).toBeInTheDocument()

    const rosa = screen.getByRole('listitem', { name: 'Rosa Díaz' })
    expect(within(rosa).getByText('Ausente')).toBeInTheDocument()
    expect(within(rosa).getByText('Viaje')).toBeInTheDocument()

    const luisa = screen.getByRole('listitem', { name: 'Luisa Mora' })
    expect(within(luisa).getByText('Recuperada')).toBeInTheDocument()
    expect(within(luisa).getByText('Recuperada el sáb 24 oct con Yusmary Rojas')).toBeInTheDocument()

    expect(screen.getByText('Recuperada aparte (cuenta como asistida)')).toBeInTheDocument()
  })

  it('offers «Recuperar clase» only on an ausente row that is not recovered, and «Anular» on the recovered one', () => {
    render(<AsistenciaClaseCerrada {...props()} />)
    expect(screen.getAllByRole('button', { name: /^Recuperar clase/ })).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Recuperar clase de Rosa Díaz' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Anular la recuperación de Luisa Mora' })).toBeInTheDocument()
  })

  it('hides every action from someone who cannot register (read-only, the R mark stays)', () => {
    render(<AsistenciaClaseCerrada {...props({ puedeRecuperar: false })} />)
    expect(screen.queryByRole('button', { name: /Recuperar clase/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Anular/ })).not.toBeInTheDocument()
    expect(screen.getByText('Recuperada el sáb 24 oct con Yusmary Rojas')).toBeInTheDocument()
  })

  it('registers a recovery from the panel with today, the default facilitador and the nota', async () => {
    registrarMock.mockResolvedValue({ ok: true, id: 'r-2' })
    render(<AsistenciaClaseCerrada {...props()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Recuperar clase de Rosa Díaz' }))

    expect(await screen.findByText('Recuperar clase · Rosa Díaz')).toBeInTheDocument()
    expect(screen.getByText('Clase 2 · Mis emociones · jue 15 oct')).toBeInTheDocument()
    const fecha = screen.getByLabelText('Fecha de la recuperación')
    expect(fecha).toHaveValue('2026-10-26')
    expect(fecha).toHaveAttribute('min', '2026-10-15')
    expect(fecha).toHaveAttribute('max', '2026-10-26')
    expect(screen.getByLabelText('Quién la dio')).toHaveValue('f-1')

    fireEvent.change(fecha, { target: { value: '2026-10-25' } })
    fireEvent.change(screen.getByLabelText('Quién la dio'), { target: { value: 'f-2' } })
    fireEvent.change(screen.getByLabelText('Nota (opcional)'), { target: { value: 'Con el grupo 3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar recuperación' }))

    await waitFor(() =>
      expect(registrarMock).toHaveBeenCalledWith({
        ...RUTA,
        sesionId: 's-1',
        personaId: 'p-2',
        fecha: '2026-10-25',
        dadaPor: 'f-2',
        nota: 'Con el grupo 3',
      }),
    )
    await waitFor(() =>
      expect(successMock).toHaveBeenCalledWith('Clase 2 recuperada por Rosa Díaz. Cuenta para su certificado.'),
    )
    expect(refreshMock).toHaveBeenCalled()
  })

  it('shows the refusal from the server and keeps the panel open', async () => {
    registrarMock.mockResolvedValue({ ok: false, error: 'invalid-input', message: 'La fecha de la recuperación no puede ser futura.' })
    render(<AsistenciaClaseCerrada {...props()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Recuperar clase de Rosa Díaz' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Registrar recuperación' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('La fecha de la recuperación no puede ser futura.')
    expect(screen.getByText('Recuperar clase · Rosa Díaz')).toBeInTheDocument()
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('anula a recovery', async () => {
    anularMock.mockResolvedValue({ ok: true })
    render(<AsistenciaClaseCerrada {...props()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Anular la recuperación de Luisa Mora' }))
    await waitFor(() => expect(anularMock).toHaveBeenCalledWith({ ...RUTA, recuperacionId: 'r-1' }))
    await waitFor(() => expect(successMock).toHaveBeenCalledWith('Se anuló la recuperación de Luisa Mora.'))
    expect(refreshMock).toHaveBeenCalled()
  })
})
