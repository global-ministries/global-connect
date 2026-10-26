/**
 * `<ContadoresEdad>` — the age metrics of the selected sub-area (D10) as the
 * shared count pills: one `aria-pressed` pill per range with its count; a tap
 * filters, a second tap on the active range clears it.
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ContadoresEdad } from '@/components/dream-team/contadores-edad'

const contadores = { menor_12: 3, '12_17': 5, '18_25': 0, '26_mas': 12, sin_fecha: 2 }

describe('ContadoresEdad', () => {
  it('shows one pill per range with its count, in order', () => {
    render(<ContadoresEdad contadores={contadores} edad={null} onEdadChange={jest.fn()} />)
    const grupo = screen.getByRole('group', { name: 'Filtrar por edad' })
    expect(grupo).toBeInTheDocument()
    expect(screen.getAllByRole('button').map((boton) => boton.textContent)).toEqual([
      'Menos de 123',
      '12–175',
      '18–250',
      '26+12',
      'Sin fecha2',
    ])
    expect(screen.getAllByRole('button').every((boton) => boton.getAttribute('aria-pressed') === 'false')).toBe(true)
  })

  it('selects a range, and a second tap on the active one clears it', async () => {
    const onEdadChange = jest.fn()
    const { rerender } = render(<ContadoresEdad contadores={contadores} edad={null} onEdadChange={onEdadChange} />)
    await userEvent.click(screen.getByRole('button', { name: /^12–17/ }))
    expect(onEdadChange).toHaveBeenLastCalledWith('12_17')

    rerender(<ContadoresEdad contadores={contadores} edad="12_17" onEdadChange={onEdadChange} />)
    expect(screen.getByRole('button', { name: /^12–17/ })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: /^12–17/ }))
    expect(onEdadChange).toHaveBeenLastCalledWith(null)
  })
})
