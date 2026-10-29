/**
 * `<Interruptor>` — the on/off switch of the design system
 * (docs/design-system/components.md): a real button with role="switch" and
 * aria-checked, a 44px target, and the tap reports the next state.
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { Interruptor } from '@/components/ui/interruptor'

describe('Interruptor', () => {
  it('is a named switch that reports its state', () => {
    render(<Interruptor activo aria-label="Rol Coordinador" onCambio={jest.fn()} />)
    const interruptor = screen.getByRole('switch', { name: 'Rol Coordinador' })
    expect(interruptor).toHaveAttribute('aria-checked', 'true')
    expect(interruptor).toHaveAttribute('type', 'button')
  })

  it('reports the opposite state when tapped', async () => {
    const onCambio = jest.fn()
    const { rerender } = render(<Interruptor activo={false} aria-label="Turno Domingo" onCambio={onCambio} />)
    const interruptor = screen.getByRole('switch', { name: 'Turno Domingo' })
    expect(interruptor).toHaveAttribute('aria-checked', 'false')

    await userEvent.click(interruptor)
    expect(onCambio).toHaveBeenLastCalledWith(true)

    rerender(<Interruptor activo aria-label="Turno Domingo" onCambio={onCambio} />)
    await userEvent.click(interruptor)
    expect(onCambio).toHaveBeenLastCalledWith(false)
  })

  it('toggles from the keyboard', async () => {
    const onCambio = jest.fn()
    render(<Interruptor activo={false} aria-label="Rol Líder" onCambio={onCambio} />)
    screen.getByRole('switch', { name: 'Rol Líder' }).focus()
    await userEvent.keyboard(' ')
    expect(onCambio).toHaveBeenCalledWith(true)
  })

  it('does nothing while disabled', async () => {
    const onCambio = jest.fn()
    render(<Interruptor activo aria-label="Rol Líder" disabled onCambio={onCambio} />)
    const interruptor = screen.getByRole('switch', { name: 'Rol Líder' })
    expect(interruptor).toBeDisabled()
    await userEvent.click(interruptor)
    expect(onCambio).not.toHaveBeenCalled()
  })

  it('keeps a 44px target and a visible focus ring', () => {
    render(<Interruptor activo aria-label="Rol Líder" onCambio={jest.fn()} />)
    const interruptor = screen.getByRole('switch', { name: 'Rol Líder' })
    expect(interruptor).toHaveClass('h-11', 'focus-ring')
  })
})
