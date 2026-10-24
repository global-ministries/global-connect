/**
 * @jest-environment jsdom
 *
 * T4 (odd/tasks/uno-a-uno.md) — the log dialog, used to register a scheduled
 * 1:1 and to register one that was never scheduled. T7 (S7.3, S7.6): an
 * optional celebración and who sees each field.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const registrarMock = jest.fn()
const sinAgendaMock = jest.fn()

jest.mock('@/app/(auth)/mis-uno-a-uno/actions', () => ({
  registrarUnoAUno: (...args: unknown[]) => registrarMock(...args),
  registrarSinAgenda: (...args: unknown[]) => sinAgendaMock(...args),
}))

import { RegistrarUnoAUnoDialog } from '@/components/uno-a-uno/registrar-uno-a-uno'

beforeEach(() => {
  registrarMock.mockReset()
  sinAgendaMock.mockReset()
})

describe('RegistrarUnoAUnoDialog — scheduled 1:1', () => {
  function abrir() {
    render(<RegistrarUnoAUnoDialog unoAUnoId="u-1" conQuien="Luis Gómez" />)
    fireEvent.click(screen.getByRole('button', { name: /^registrar$/i }))
  }

  it('opens with who the 1:1 was with and no date fields', () => {
    abrir()
    expect(screen.getByRole('dialog')).toHaveTextContent('Luis Gómez')
    expect(screen.queryByLabelText('Fecha')).not.toBeInTheDocument()
  })

  it('requires a resumen before saving', () => {
    abrir()
    const guardar = screen.getByRole('button', { name: /^guardar$/i })
    expect(guardar).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Resumen'), { target: { value: '   ' } })
    expect(guardar).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Resumen'), { target: { value: 'Hablamos de su familia.' } })
    expect(guardar).toBeEnabled()
  })

  it('says who sees each field (S7.6)', () => {
    abrir()
    const dialogo = screen.getByRole('dialog')
    expect(dialogo).toHaveTextContent('Lo ve tu cadena de supervisión.')
    expect(dialogo).toHaveTextContent('Solo la ves tú (y tu cónyuge).')
    expect(dialogo).toHaveTextContent('La ve tu cadena de supervisión.')
    expect(dialogo).not.toHaveTextContent('El resumen y la nota solo los ve quien lidera este 1 a 1.')
  })

  it('caps the celebración at 500 characters', () => {
    abrir()
    expect(screen.getByLabelText('Celebración (opcional)')).toHaveAttribute('maxLength', '500')
  })

  it('submits the resumen, the private note and the celebración, then closes', async () => {
    registrarMock.mockResolvedValue({ ok: true })
    abrir()
    fireEvent.change(screen.getByLabelText('Resumen'), { target: { value: 'Hablamos de su familia.' } })
    fireEvent.change(screen.getByLabelText('Nota privada (opcional)'), { target: { value: 'Orar por su trabajo' } })
    fireEvent.change(screen.getByLabelText('Celebración (opcional)'), { target: { value: 'Se bautizó' } })
    fireEvent.click(screen.getByRole('button', { name: /^guardar$/i }))
    await waitFor(() =>
      expect(registrarMock).toHaveBeenCalledWith({
        id: 'u-1',
        resumen: 'Hablamos de su familia.',
        notaPrivada: 'Orar por su trabajo',
        celebracion: 'Se bautizó',
      }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(sinAgendaMock).not.toHaveBeenCalled()
  })

  it('shows the action error inline', async () => {
    registrarMock.mockResolvedValue({ ok: false, error: 'invalid-input', message: 'Este 1 a 1 ya no está agendado.' })
    abrir()
    fireEvent.change(screen.getByLabelText('Resumen'), { target: { value: 'Bien' } })
    fireEvent.click(screen.getByRole('button', { name: /^guardar$/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Este 1 a 1 ya no está agendado.')
  })
})

describe('RegistrarUnoAUnoDialog — without a schedule', () => {
  const dirigidos = [{ valor: 'd-3', etiqueta: 'Pedro Ruiz — GDV: Norte' }]

  function abrir() {
    render(<RegistrarUnoAUnoDialog dirigidos={dirigidos} />)
    fireEvent.click(screen.getByRole('button', { name: /registrar sin agenda/i }))
  }

  it('asks for the person, the date and the time as well', () => {
    abrir()
    expect(screen.getByLabelText('¿Con quién?')).toBeInTheDocument()
    expect(screen.getByLabelText('Fecha')).toBeInTheDocument()
    expect(screen.getByLabelText('Hora')).toBeInTheDocument()
  })

  it('shows the same field help as a scheduled 1:1 (S7.6)', () => {
    abrir()
    const dialogo = screen.getByRole('dialog')
    expect(dialogo).toHaveTextContent('Lo ve tu cadena de supervisión.')
    expect(dialogo).toHaveTextContent('Solo la ves tú (y tu cónyuge).')
    expect(dialogo).toHaveTextContent('La ve tu cadena de supervisión.')
  })

  it('submits every field to registrarSinAgenda', async () => {
    sinAgendaMock.mockResolvedValue({ ok: true })
    abrir()
    const guardar = screen.getByRole('button', { name: /^guardar$/i })
    fireEvent.change(screen.getByLabelText('Resumen'), { target: { value: 'Bien' } })
    expect(guardar).toBeDisabled()
    fireEvent.change(screen.getByLabelText('¿Con quién?'), { target: { value: 'd-3' } })
    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '2026-10-10' } })
    fireEvent.change(screen.getByLabelText('Hora'), { target: { value: '09:00' } })
    fireEvent.change(screen.getByLabelText('Lugar (opcional)'), { target: { value: 'Su casa' } })
    fireEvent.change(screen.getByLabelText('Celebración (opcional)'), { target: { value: 'Consiguió trabajo' } })
    fireEvent.click(guardar)
    await waitFor(() =>
      expect(sinAgendaMock).toHaveBeenCalledWith({
        dirigidoId: 'd-3',
        fecha: '2026-10-10',
        hora: '09:00',
        resumen: 'Bien',
        notaPrivada: '',
        celebracion: 'Consiguió trabajo',
        lugar: 'Su casa',
      }),
    )
    expect(registrarMock).not.toHaveBeenCalled()
  })
})
