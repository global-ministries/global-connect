/**
 * @jest-environment jsdom
 *
 * T8a (odd/tasks/talleres-reserva-publica.md, S14 S15) — the edición after a
 * suspension: counters, the deadline sentence, and the call list with
 * Llamar (tel:), the manual WhatsApp link with the text ready, and «Marcar
 * como confirmado por teléfono».
 */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

const confirmarMock = jest.fn()
const successMock = jest.fn()

jest.mock('@/lib/platform/talleres/minimo-suspension-actions', () => ({
  confirmarPorTelefono: (...a: unknown[]) => confirmarMock(...a),
}))
jest.mock('@/hooks/use-notificaciones', () => ({
  useNotificaciones: () => ({ success: successMock, error: jest.fn(), info: jest.fn() }),
}))

import { EstadoSuspension } from '@/components/talleres/minimo/estado-suspension'
import { parsePanelMinimo, type PanelMinimo } from '@/lib/platform/talleres/minimo-suspension'

function panel(over: Record<string, unknown> = {}): PanelMinimo {
  return parsePanelMinimo({
    minimo: 15,
    bajo_minimo: false,
    fecha_inicio: '2027-01-15',
    cierre_inscripcion: '2027-01-11',
    conteo: { confirmadas: 8, por_telefono: 1, no_puede: 1, sin_responder: 3, salieron_sin_responder: 0, aprobados: 11, pendientes: 2, limite: '2027-01-11' },
    clases: [],
    suspension: { en: '2026-11-20T15:00:00Z', motivo: 'No se alcanzó el mínimo de inscritos', mensaje: null, fecha_anterior: '2026-11-27', por: 'Javier Torrealba' },
    abierta_igual: null,
    puede_suspender: false,
    puede_abrir_igual: true,
    puede_confirmar: true,
    sin_responder: [
      { inscripcion_id: 'i-1', nombre: 'Luis Alberto Pérez', telefono: '04141110001', companero_nombre: null, companero_telefono: null, limite: '2027-01-11' },
      { inscripcion_id: 'i-2', nombre: 'Edgar Lucena', telefono: null, companero_nombre: null, companero_telefono: null, limite: '2027-01-11' },
      { inscripcion_id: 'i-3', nombre: 'Ana Ruiz', telefono: null, companero_nombre: 'Beto Ruiz', companero_telefono: '0424-111.0002', limite: '2027-01-11' },
    ],
    ...over,
  })!
}

function renderEstado(p: PanelMinimo) {
  return render(<EstadoSuspension tallerSlug="dh" tallerNombre="De Hombre a Hombre" edicionId="e-1" panel={p} />)
}

beforeEach(() => {
  confirmarMock.mockReset()
  successMock.mockReset()
})

describe('EstadoSuspension', () => {
  it('shows who suspended, why, the counters and the deadline', () => {
    renderEstado(panel())
    expect(screen.getByRole('heading', { name: /suspendida · nueva fecha/i })).toHaveTextContent('15')
    expect(screen.getByText(/La suspendió Javier Torrealba/)).toHaveTextContent('«No se alcanzó el mínimo de inscritos»')
    expect(screen.getByText(/Si no confirman antes del .*11.*, salen de la edición\./)).toBeInTheDocument()
    const contadores = screen.getByRole('list', { name: /respuestas al aviso/i })
    expect(contadores).toHaveTextContent('8 confirmaron (1 por teléfono)')
    expect(contadores).toHaveTextContent('1 no puede')
    expect(contadores).toHaveTextContent('3 sin responder')
  })

  it('lists who to call with tel:, the manual WhatsApp text and the phone confirmation', () => {
    renderEstado(panel())
    const lista = screen.getByRole('heading', { name: /sin responder · llámalos antes del/i }).closest('section')!
    const filas = within(lista).getAllByRole('listitem')
    expect(filas).toHaveLength(3)

    const llamar = within(filas[0]).getByRole('link', { name: 'Llamar a Luis Alberto Pérez' })
    expect(llamar).toHaveAttribute('href', 'tel:+584141110001')
    const wa = within(filas[0]).getByRole('link', { name: 'Abrir WhatsApp con Luis Alberto Pérez' })
    const href = wa.getAttribute('href')!
    expect(href.startsWith('https://wa.me/584141110001?text=')).toBe(true)
    expect(decodeURIComponent(href.split('text=')[1])).toBe(
      'Hola Luis, De Hombre a Hombre ahora empieza el viernes 15 de enero. ¿Mantienes tu lugar? Confírmalo antes del lunes 11 de enero.',
    )
    expect(wa).toHaveAttribute('target', '_blank')

    // No phone: no call buttons, still markable after another contact.
    expect(within(filas[1]).getByText(/Sin teléfono en su ficha/)).toBeInTheDocument()
    expect(within(filas[1]).queryByRole('link')).not.toBeInTheDocument()
    expect(within(filas[1]).getByRole('button', { name: /marcar como confirmado por teléfono/i })).toBeInTheDocument()

    // A couple without the principal's phone is reached through the companero.
    expect(within(filas[2]).getByRole('link', { name: 'Llamar a Beto Ruiz' })).toHaveAttribute('href', 'tel:+584241110002')
  })

  it('marks a confirmation by phone', async () => {
    confirmarMock.mockResolvedValue({ ok: true })
    renderEstado(panel())
    fireEvent.click(screen.getAllByRole('button', { name: /marcar como confirmado por teléfono/i })[0])
    await waitFor(() => expect(confirmarMock).toHaveBeenCalledWith({ tallerSlug: 'dh', edicionId: 'e-1', inscripcionId: 'i-1' }))
    await waitFor(() => expect(successMock).toHaveBeenCalledWith('Luis Alberto Pérez confirmó por teléfono. Mantiene su lugar.'))
  })

  it('shows a refusal on the row', async () => {
    confirmarMock.mockResolvedValue({ ok: false, error: 'conflict', message: 'El plazo para confirmar ya venció.' })
    renderEstado(panel())
    fireEvent.click(screen.getAllByRole('button', { name: /marcar como confirmado por teléfono/i })[1])
    expect(await screen.findByRole('alert')).toHaveTextContent('El plazo para confirmar ya venció.')
  })

  it('without the right to confirm there is no call list', () => {
    renderEstado(panel({ puede_confirmar: false, sin_responder: [] }))
    expect(screen.queryByRole('heading', { name: /llámalos/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
