/**
 * @jest-environment jsdom
 *
 * T8a (odd/tasks/talleres-reserva-publica.md, S9 S16) — «Mínimo de inscritos
 * para abrir» in Configuración. Since T9 it is a controlled field of
 * ConfiguracionTaller (saved by «Guardar configuración»): it shows the value,
 * the unit by tipo and the S16 note; a read-only viewer only sees the value.
 */

import { fireEvent, render, screen } from '@testing-library/react'

import { MinimoInscritosCampo } from '@/components/talleres/minimo/minimo-inscritos-campo'

describe('MinimoInscritosCampo', () => {
  it('shows the value with its unit and the S16 note, without its own save', () => {
    render(<MinimoInscritosCampo tipo="individual" valor="10" onCambio={jest.fn()} puedeEditar />)
    expect(screen.getByLabelText('Mínimo de inscritos para abrir (personas)')).toHaveValue(10)
    expect(screen.getByText(/Cuentan solo las inscripciones aprobadas/)).toHaveTextContent(
      'Abrir por debajo del mínimo: solo la dirección de Conexión y el coordinador del taller.',
    )
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('reports every change to its parent', () => {
    const onCambio = jest.fn()
    render(<MinimoInscritosCampo tipo="pareja" valor="" onCambio={onCambio} puedeEditar />)
    fireEvent.change(screen.getByLabelText('Mínimo de inscritos para abrir (parejas)'), { target: { value: '6' } })
    expect(onCambio).toHaveBeenCalledWith('6')
  })

  it.each([
    ['', 'individual', 'Sin mínimo'],
    ['12', 'pareja', '12 parejas'],
  ] as const)('a read-only viewer sees %p as %p → %p, no control', (valor, tipo, texto) => {
    render(<MinimoInscritosCampo tipo={tipo} valor={valor} onCambio={jest.fn()} puedeEditar={false} />)
    expect(screen.getByText('Mínimo de inscritos para abrir')).toBeInTheDocument()
    expect(screen.getByText(texto)).toBeInTheDocument()
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
  })
})
