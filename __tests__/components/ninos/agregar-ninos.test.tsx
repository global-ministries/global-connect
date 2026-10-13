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
})
