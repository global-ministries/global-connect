/**
 * @jest-environment jsdom
 *
 * T8a (odd/tasks/talleres-reserva-publica.md, S9 S16) — the «No llegó al
 * mínimo» banner and the suspension side panel: which actions each viewer
 * sees (hidden, never disabled; the RPCs check again), «Abrir igual» with its
 * confirm step, and the panel's clase preview and submitted arguments.
 */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

const suspenderMock = jest.fn()
const abrirMock = jest.fn()
const successMock = jest.fn()

jest.mock('@/lib/platform/talleres/minimo-suspension-actions', () => ({
  suspenderEdicion: (...a: unknown[]) => suspenderMock(...a),
  abrirEdicionIgual: (...a: unknown[]) => abrirMock(...a),
}))
// The panel reuses the «Reprogramar» dialog's day math; its module imports
// the edición's server actions.
jest.mock('@/app/(auth)/talleres/[taller]/[edicion]/actions', () => ({ reprogramarEdicion: jest.fn() }))
jest.mock('@/hooks/use-notificaciones', () => ({
  useNotificaciones: () => ({ success: successMock, error: jest.fn(), info: jest.fn() }),
}))

import { AvisoMinimo } from '@/components/talleres/minimo/aviso-minimo'
import { parsePanelMinimo, type PanelMinimo } from '@/lib/platform/talleres/minimo-suspension'

function panel(over: Record<string, unknown> = {}): PanelMinimo {
  return parsePanelMinimo({
    minimo: 15,
    unidad: 'personas',
    bajo_minimo: true,
    fecha_inicio: '2026-11-27',
    cierre_inscripcion: '2026-11-20',
    conteo: { confirmadas: 0, por_telefono: 0, no_puede: 0, sin_responder: 0, salieron_sin_responder: 0, aprobados: 12, pendientes: 2, limite: null },
    clases: [
      { numero: 1, fecha: '2026-11-27' },
      { numero: 2, fecha: '2026-12-04' },
    ],
    suspension: null,
    abierta_igual: null,
    puede_suspender: true,
    puede_abrir_igual: true,
    puede_confirmar: true,
    sin_responder: [],
    ...over,
  })!
}

function renderAviso(p: PanelMinimo, cancelar?: React.ReactNode) {
  return render(
    <AvisoMinimo tallerSlug="dh" tallerNombre="De Hombre a Hombre" edicionId="e-1" panel={p} cancelar={cancelar} />,
  )
}

beforeEach(() => {
  suspenderMock.mockReset()
  abrirMock.mockReset()
  successMock.mockReset()
})

describe('AvisoMinimo — banner', () => {
  it('names the count against the minimum and the deadline', () => {
    renderAviso(panel())
    expect(screen.getByRole('heading', { name: /no llegó al mínimo: 12 de 15/i })).toBeInTheDocument()
    expect(screen.getByText(/el mínimo de De Hombre a Hombre es 15/)).toBeInTheDocument()
    expect(screen.getByText(/Nadie recibe nada hasta que/)).toBeInTheDocument()
  })

  it('the director sees the three ways out and the S16 lock note', () => {
    renderAviso(panel(), <button type="button">Cancelar esta edición</button>)
    expect(screen.getByRole('button', { name: /suspender y mover a nueva fecha/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /abrir igual con 12/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cancelar esta edición/i })).toBeInTheDocument()
    expect(screen.getByText(/solo lo ven la dirección de Conexión y el coordinador del taller/)).toBeInTheDocument()
  })

  it('the coordinator (no suspend, no cancel) sees only «Abrir igual»', () => {
    renderAviso(panel({ puede_suspender: false }))
    expect(screen.queryByRole('button', { name: /suspender/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /cancelar/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /abrir igual/i })).toBeInTheDocument()
  })

  it('admin.manage alone does not see «Abrir igual» nor the lock note', () => {
    renderAviso(panel({ puede_abrir_igual: false }))
    expect(screen.queryByRole('button', { name: /abrir igual/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/solo lo ven/)).not.toBeInTheDocument()
  })

  it('a leader sees the banner without any action', () => {
    renderAviso(panel({ puede_suspender: false, puede_abrir_igual: false }))
    expect(screen.getByRole('heading', { name: /no llegó al mínimo/i })).toBeInTheDocument()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })
})

describe('AvisoMinimo — abrir igual', () => {
  it('asks to confirm and sends the trimmed motivo', async () => {
    abrirMock.mockResolvedValue({ ok: true })
    renderAviso(panel())
    fireEvent.click(screen.getByRole('button', { name: /abrir igual con 12/i }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: '¿Abrir con 12 de mínimo 15?' })).toBeInTheDocument()
    fireEvent.change(within(dialog).getByLabelText(/motivo/i), { target: { value: '  Arrancamos  ' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /^abrir igual$/i }))
    await waitFor(() => expect(abrirMock).toHaveBeenCalledWith({ tallerSlug: 'dh', edicionId: 'e-1', motivo: 'Arrancamos' }))
    await waitFor(() => expect(successMock).toHaveBeenCalledWith('La edición abre con 12 de 15.'))
  })

  it('shows the server refusal inside the dialog', async () => {
    abrirMock.mockResolvedValue({ ok: false, error: 'forbidden', message: 'Solo la dirección y el coordinador del taller pueden abrir por debajo del mínimo.' })
    renderAviso(panel())
    fireEvent.click(screen.getByRole('button', { name: /abrir igual con 12/i }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^abrir igual$/i }))
    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent(/Solo la dirección/)
  })
})

describe('SuspenderEdicionPanel', () => {
  it('previews every clase moved by the same delta and the suggested cierre', () => {
    renderAviso(panel())
    fireEvent.click(screen.getByRole('button', { name: /suspender y mover a nueva fecha/i }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Primera clase'), { target: { value: '2027-01-15' } })
    // cierre was 7 days before the start; it keeps that offset.
    expect(within(dialog).getByLabelText('Cierre de inscripción')).toHaveValue('2027-01-08')
    const filas = within(dialog).getAllByRole('row')
    expect(filas).toHaveLength(3)
    expect(filas[1]).toHaveTextContent(/1.*27.*nov.*15.*ene/)
    expect(filas[2]).toHaveTextContent(/2.*4.*dic.*22.*ene/)
    expect(within(dialog).getByText(/Deben confirmar su lugar/)).toHaveTextContent('(12)')
    expect(within(dialog).getByText(/Solicitudes por aprobar/)).toHaveTextContent('(2)')
    expect(within(dialog).getByText(/Faltan 3 para el mínimo de 15/)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Suspender y enviar 14 avisos' })).toBeEnabled()
  })

  it('submits the new date, the default cierre (null), the motivo and the message', async () => {
    suspenderMock.mockResolvedValue({
      ok: true,
      suspension: { fechaInicio: '2027-01-15', cierreInscripcion: '2027-01-08', porConfirmar: 12, correosEnviados: 12, correosFallidos: 0 },
    })
    renderAviso(panel())
    fireEvent.click(screen.getByRole('button', { name: /suspender y mover a nueva fecha/i }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('button', { name: /suspender y enviar/i })).toBeDisabled()
    fireEvent.change(within(dialog).getByLabelText('Primera clase'), { target: { value: '2027-01-15' } })
    fireEvent.change(within(dialog).getByLabelText('Mensaje para los inscritos'), { target: { value: 'Nos vemos en enero.' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /suspender y enviar/i }))
    await waitFor(() =>
      expect(suspenderMock).toHaveBeenCalledWith({
        tallerSlug: 'dh',
        edicionId: 'e-1',
        nuevaFechaInicio: '2027-01-15',
        nuevoCierre: null,
        motivo: 'No se alcanzó el mínimo de inscritos',
        mensaje: 'Nos vemos en enero.',
      }),
    )
    await waitFor(() => expect(successMock).toHaveBeenCalledWith(expect.stringMatching(/12 inscritos deben confirmar/)))
  })

  it('«Otro» requires its own text', () => {
    renderAviso(panel())
    fireEvent.click(screen.getByRole('button', { name: /suspender y mover a nueva fecha/i }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Primera clase'), { target: { value: '2027-01-15' } })
    fireEvent.change(within(dialog).getByRole('combobox', { name: 'Motivo' }), { target: { value: 'Otro' } })
    expect(within(dialog).getByRole('button', { name: /suspender y enviar/i })).toBeDisabled()
    fireEvent.change(within(dialog).getByLabelText('¿Cuál?'), { target: { value: 'Lluvias' } })
    expect(within(dialog).getByRole('button', { name: /suspender y enviar/i })).toBeEnabled()
  })

  it('keeps the panel open with the refusal', async () => {
    suspenderMock.mockResolvedValue({ ok: false, error: 'invalid-input', message: 'La nueva primera clase debe ser después de hoy.' })
    renderAviso(panel())
    fireEvent.click(screen.getByRole('button', { name: /suspender y mover a nueva fecha/i }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Primera clase'), { target: { value: '2026-11-01' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /suspender y enviar/i }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('La nueva primera clase debe ser después de hoy.')
  })
})
