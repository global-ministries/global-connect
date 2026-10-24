/**
 * @jest-environment jsdom
 *
 * T4 (odd/tasks/uno-a-uno.md) — the "Mis 1 a 1" sections: actions and the
 * private fields only on the leader side; the dirigido side is read-only.
 */

import { render, screen, within } from '@testing-library/react'

jest.mock('@/app/(auth)/mis-uno-a-uno/actions', () => ({
  registrarUnoAUno: jest.fn(),
  registrarSinAgenda: jest.fn(),
  reprogramarUnoAUno: jest.fn(),
  cancelarUnoAUno: jest.fn(),
}))

import { ListaUnoAUno } from '@/components/uno-a-uno/lista-uno-a-uno'
import type { UnoAUno } from '@/lib/uno-a-uno/vista'

const ana = { id: 'l-1', nombre: 'Ana', apellido: 'Pérez' }
const luis = { id: 'd-1', nombre: 'Luis', apellido: 'Gómez' }
const maria = { id: 'd-2', nombre: 'María', apellido: 'Gómez' }

function uno(over: Partial<UnoAUno>): UnoAUno {
  return {
    id: 'u-1',
    estado: 'agendado',
    fechaHora: '2026-10-20T19:30:00Z',
    lugar: null,
    miLado: 'lider',
    lideres: [ana],
    dirigidos: [luis, maria],
    resumen: null,
    notaPrivada: null,
    motivoCancelacion: null,
    ...over,
  }
}

describe('ListaUnoAUno', () => {
  it('shows the couple together with the actions on the leader side', () => {
    render(<ListaUnoAUno lista={[uno({ lugar: 'Café Centro' })]} lideraAAlguien />)
    const proximos = within(screen.getByRole('region', { name: 'Próximos' }))
    expect(proximos.getByText('Luis Gómez y María Gómez')).toBeInTheDocument()
    expect(proximos.getByText('martes 20 de octubre de 2026, 15:30')).toBeInTheDocument()
    expect(proximos.getByText('Café Centro')).toBeInTheDocument()
    expect(proximos.getByRole('button', { name: /^registrar$/i })).toBeInTheDocument()
    expect(proximos.getByRole('button', { name: /^reprogramar$/i })).toBeInTheDocument()
    expect(proximos.getByRole('button', { name: /cancelar 1 a 1/i })).toBeInTheDocument()
  })

  it('shows the leaders and no action on the dirigido side', () => {
    render(<ListaUnoAUno lista={[uno({ miLado: 'dirigido' })]} lideraAAlguien={false} />)
    expect(screen.getByText('Ana Pérez')).toBeInTheDocument()
    expect(screen.getByText('Te lidera')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('shows the resumen and the private note of a realizado to the leader side', () => {
    render(
      <ListaUnoAUno
        lista={[uno({ estado: 'realizado', resumen: 'Hablamos de su familia.', notaPrivada: 'Orar por su trabajo' })]}
        lideraAAlguien
      />,
    )
    const realizados = within(screen.getByRole('region', { name: 'Realizados' }))
    expect(realizados.getByText('Hablamos de su familia.')).toBeInTheDocument()
    expect(realizados.getByText('Orar por su trabajo')).toBeInTheDocument()
    expect(realizados.queryByRole('button')).not.toBeInTheDocument()
  })

  it('shows empty states and hides Cancelados when there are none', () => {
    render(<ListaUnoAUno lista={[]} lideraAAlguien />)
    expect(screen.getByText(/No tienes 1 a 1 agendados\. Usa «Agendar 1 a 1»/)).toBeInTheDocument()
    expect(screen.getByText('Todavía no hay 1 a 1 registrados.')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Cancelados' })).not.toBeInTheDocument()
  })

  it('lists a cancelled 1:1 with its motivo', () => {
    render(<ListaUnoAUno lista={[uno({ estado: 'cancelado', motivoCancelacion: 'Viaje' })]} lideraAAlguien />)
    const cancelados = within(screen.getByRole('region', { name: 'Cancelados' }))
    expect(cancelados.getByText('Motivo: Viaje')).toBeInTheDocument()
    expect(cancelados.queryByRole('button')).not.toBeInTheDocument()
  })
})
