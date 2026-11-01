import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { RegistroMesa as RegistrarFamiliaForm } from '@/components/ninos/registro-rapido/registro-mesa'

jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({ rpc: jest.fn() }) }))

function formulario() {
  render(<RegistrarFamiliaForm padreExistente={{ id: 'p1', nombre: 'Ana Pérez' }} onRegistrada={jest.fn()} onCancelar={jest.fn()} />)
  fireEvent.change(screen.getByLabelText('Nombre del niño 1'), { target: { value: 'Luis' } })
  fireEvent.change(screen.getByLabelText('Apellido del niño 1'), { target: { value: 'Pérez' } })
  fireEvent.click(screen.getByRole('button', { name: 'Agregar otro niño' }))
}

describe('RegistrarFamiliaForm (one-screen desk form): several children', () => {
  it('keeps every child on screen and focuses the new one', async () => {
    formulario()
    expect(screen.getByLabelText('Nombre del niño 1')).toHaveValue('Luis')
    expect(screen.getByTestId('nino-1')).toHaveTextContent('Luis Pérez')
    await waitFor(() => expect(screen.getByLabelText('Nombre del niño 2')).toHaveFocus())
  })

  it('the new child takes the surname of the first one when the parent is known', () => {
    formulario()
    expect(screen.getByLabelText('Apellido del niño 2')).toHaveValue('Pérez')
  })

  it('the submit button counts the children', () => {
    formulario()
    expect(screen.getByRole('button', { name: 'Agregar 2 niños' })).toBeInTheDocument()
  })

  it('a child can be removed only when there are several', () => {
    formulario()
    fireEvent.click(screen.getByRole('button', { name: 'Quitar niño 2' }))
    expect(screen.queryByLabelText('Nombre del niño 2')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Quitar a Luis/ })).not.toBeInTheDocument()
  })
})

describe('RegistrarFamiliaForm (one-screen desk form): layout', () => {
  it('the sticky footer has a top border and safe-area bottom padding', () => {
    render(<RegistrarFamiliaForm onRegistrada={jest.fn()} onCancelar={jest.fn()} />)
    const pie = screen.getByRole('button', { name: 'Registrar familia' }).parentElement
    expect(pie).toHaveClass('sticky', 'bottom-0', 'border-t', 'safe-area-pb-md')
  })

  it('the authorized-person row cannot grow wider than its card', () => {
    render(<RegistrarFamiliaForm onRegistrada={jest.fn()} onCancelar={jest.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Agregar a alguien más' }))
    const fila = screen.getByLabelText('Nombre del autorizado 1').closest('.grid.sm\\:grid-cols-\\[minmax\\(0\\,1fr\\)_minmax\\(0\\,1fr\\)_minmax\\(0\\,1fr\\)\\]')
    expect(fila).not.toBeNull()
  })

  it('the ficha extras (level, school, snack, diaper, photos, habits, notes) stay in «Para después»', () => {
    render(<RegistrarFamiliaForm onRegistrada={jest.fn()} onCancelar={jest.fn()} />)
    const despues = screen.getByText('Para después').closest('details') as HTMLElement
    expect(despues).not.toHaveAttribute('open')
    for (const etiqueta of ['Nivel', '¿Escolarizado?', '¿Puede comer merienda?', '¿Necesita cambio de pañal?', '¿Autoriza fotos?', 'Hábitos', 'Notas', 'Cédula (opcional)']) {
      expect(despues).toContainElement(screen.getByLabelText(etiqueta))
    }
  })
})
