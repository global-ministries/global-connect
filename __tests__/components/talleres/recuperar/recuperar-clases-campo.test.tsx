/**
 * @jest-environment jsdom
 *
 * T8b (odd/tasks/talleres-reserva-publica.md, S17) — «Recuperar clases
 * aparte» in Configuración (artboard 14). Since T9 it is a controlled switch
 * of ConfiguracionTaller (saved by «Guardar configuración»); a read-only
 * viewer only sees Sí / No.
 */

import { fireEvent, render, screen } from '@testing-library/react'

import { RecuperarClasesCampo } from '@/components/talleres/recuperar/recuperar-clases-campo'

describe('RecuperarClasesCampo', () => {
  it('shows the value as a switch with the explanation', () => {
    render(<RecuperarClasesCampo permite onCambio={jest.fn()} puedeEditar />)
    const sw = screen.getByRole('switch', { name: 'Recuperar clases aparte' })
    expect(sw).toHaveAttribute('aria-checked', 'true')
    expect(sw).toBeEnabled()
    expect(screen.getByText(/cuenta como asistida para el certificado/)).toBeInTheDocument()
  })

  it('a tap reports the new value to its parent', () => {
    const onCambio = jest.fn()
    render(<RecuperarClasesCampo permite onCambio={onCambio} puedeEditar />)
    fireEvent.click(screen.getByRole('switch', { name: 'Recuperar clases aparte' }))
    expect(onCambio).toHaveBeenCalledWith(false)
  })

  it.each([
    [true, 'Sí'],
    [false, 'No'],
  ])('read-only viewer sees %p as %p and no switch', (permite, texto) => {
    render(<RecuperarClasesCampo permite={permite} onCambio={jest.fn()} puedeEditar={false} />)
    expect(screen.getByText(texto)).toBeInTheDocument()
    expect(screen.getByText('Recuperar clases aparte')).toBeInTheDocument()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  })
})
