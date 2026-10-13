import { fireEvent, render, screen, within } from '@testing-library/react'

import { RegistrarFamiliaForm } from '@/components/ninos/registrar-familia-form'

jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({ rpc: jest.fn() }) }))

function formulario() {
  render(<RegistrarFamiliaForm padreExistente={{ id: 'p1', nombre: 'Ana Pérez' }} onRegistrada={jest.fn()} onCancelar={jest.fn()} />)
  fireEvent.change(screen.getByLabelText('Nombre del niño 1'), { target: { value: 'Luis' } })
  fireEvent.change(screen.getByLabelText('Apellido del niño 1'), { target: { value: 'Pérez' } })
  fireEvent.click(screen.getByRole('button', { name: 'Agregar otro niño' }))
}

describe('RegistrarFamiliaForm: several children', () => {
  it('collapses the previous child into a summary and focuses the new one', () => {
    formulario()
    expect(screen.getByLabelText('Nombre del niño 1')).not.toBeVisible()
    const primero = screen.getByTestId('nino-1')
    expect(within(primero).getByText('Luis Pérez')).toBeInTheDocument()
    expect(screen.getByLabelText('Nombre del niño 2')).toHaveFocus()
  })

  it('expanding a collapsed child shows its fields again', () => {
    formulario()
    fireEvent.click(within(screen.getByTestId('nino-1')).getByRole('button', { name: /Luis Pérez/ }))
    expect(screen.getByLabelText('Nombre del niño 1')).toBeVisible()
  })

  it('the submit button counts the children', () => {
    formulario()
    expect(screen.getByRole('button', { name: 'Agregar 2 niños' })).toBeInTheDocument()
  })

  it('a collapsed child is a compact single row without the expanded spacing', () => {
    formulario()
    const primero = screen.getByTestId('nino-1')
    expect(primero).toHaveClass('py-2')
    expect(primero).not.toHaveClass('space-y-4')
    expect(screen.getByTestId('nino-2')).toHaveClass('p-4')
  })

  it('the collapsed summary shows the age only when the birth date exists', () => {
    formulario()
    const resumen = within(screen.getByTestId('nino-1')).getByRole('button', { name: /Luis Pérez/ })
    expect(resumen).toHaveTextContent(/Luis Pérez$/)
  })
})

describe('RegistrarFamiliaForm: layout', () => {
  it('the sticky footer has the page background, a top border and safe-area bottom padding', () => {
    render(<RegistrarFamiliaForm onRegistrada={jest.fn()} onCancelar={jest.fn()} />)
    const pie = screen.getByRole('button', { name: 'Registrar familia' }).parentElement
    expect(pie).toHaveClass('sticky', 'bottom-0', 'bg-background', 'border-t', 'pb-[max(1rem,env(safe-area-inset-bottom))]')
  })

  it('the authorized-person row cannot grow wider than its card', () => {
    render(<RegistrarFamiliaForm onRegistrada={jest.fn()} onCancelar={jest.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Agregar persona autorizada' }))
    const fila = screen.getByLabelText('Nombre del autorizado 1').closest('.grid')
    expect(fila?.className).toContain('minmax(0,1fr)')
  })
})
