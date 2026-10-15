/**
 * @jest-environment jsdom
 *
 * T4 (odd/tasks/uno-a-uno.md) — the "Agendar 1 a 1" dialog: pick someone the
 * user leads, a date and a time (Caracas) and an optional place.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const agendarMock = jest.fn()

jest.mock('@/app/(auth)/mis-uno-a-uno/actions', () => ({
  agendarUnoAUno: (...args: unknown[]) => agendarMock(...args),
}))

import { AgendarUnoAUnoDialog } from '@/components/uno-a-uno/agendar-uno-a-uno'

const dirigidos = [
  { valor: 'd-1', etiqueta: 'Luis Gómez y María Gómez — GDV: Norte' },
  { valor: 'd-3', etiqueta: 'Pedro Ruiz — Dream Team: Sonido' },
]

beforeEach(() => {
  agendarMock.mockReset()
})

function abrir() {
  render(<AgendarUnoAUnoDialog dirigidos={dirigidos} />)
  fireEvent.click(screen.getByRole('button', { name: /agendar 1 a 1/i }))
}

function llenar() {
  fireEvent.change(screen.getByLabelText('¿Con quién?'), { target: { value: 'd-3' } })
  fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '2026-10-20' } })
  fireEvent.change(screen.getByLabelText('Hora'), { target: { value: '18:30' } })
  fireEvent.change(screen.getByLabelText('Lugar (opcional)'), { target: { value: 'Café Centro' } })
}

describe('AgendarUnoAUnoDialog', () => {
  it('shows no field until opened', () => {
    render(<AgendarUnoAUnoDialog dirigidos={dirigidos} />)
    expect(screen.queryByLabelText('Fecha')).not.toBeInTheDocument()
  })

  it('opens with every dirigido in the picker', () => {
    abrir()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Luis Gómez y María Gómez/ })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Pedro Ruiz/ })).toBeInTheDocument()
  })

  it('keeps the submit disabled until person, date and time are set', () => {
    abrir()
    const enviar = screen.getByRole('button', { name: /^agendar$/i })
    expect(enviar).toBeDisabled()
    llenar()
    expect(enviar).toBeEnabled()
  })

  it('submits the chosen person, date, time and place, then closes', async () => {
    agendarMock.mockResolvedValue({ ok: true })
    abrir()
    llenar()
    fireEvent.click(screen.getByRole('button', { name: /^agendar$/i }))
    await waitFor(() =>
      expect(agendarMock).toHaveBeenCalledWith({
        dirigidoId: 'd-3',
        fecha: '2026-10-20',
        hora: '18:30',
        lugar: 'Café Centro',
      }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('shows the action error inline and stays open', async () => {
    agendarMock.mockResolvedValue({ ok: false, error: 'forbidden', message: 'No lideras a esta persona.' })
    abrir()
    llenar()
    fireEvent.click(screen.getByRole('button', { name: /^agendar$/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No lideras a esta persona.')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
