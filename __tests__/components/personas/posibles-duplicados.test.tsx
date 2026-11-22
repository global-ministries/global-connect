/**
 * Personas — the «¿Es alguna de estas personas?» panel (T4, S6b): each match
 * with its short name, campus, servicios, account and the reason it matched;
 * «Usar esta persona» picks it and «No, es otra persona, crear» goes on.
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { PosiblesDuplicados } from '@/components/personas/posibles-duplicados'
import type { PosibleDuplicado } from '@/lib/platform/personas/posibles-duplicados'

const ISAAC: PosibleDuplicado = {
  id: 'u1',
  nombre: 'Isaac José',
  apellido: 'Paez Cordero',
  nombreCorto: 'Isaac Paez',
  campus: 'Valencia',
  servicios: 2,
  tieneCuenta: true,
  coincide: ['nombre', 'telefono'],
}
const ANA: PosibleDuplicado = {
  id: 'u2',
  nombre: 'Ana',
  apellido: 'Pérez',
  nombreCorto: 'Ana Pérez',
  campus: null,
  servicios: 1,
  tieneCuenta: false,
  coincide: ['cedula'],
}

function abrir() {
  const onUsar = jest.fn()
  const onCrear = jest.fn()
  render(<PosiblesDuplicados personas={[ISAAC, ANA]} onUsar={onUsar} onCrear={onCrear} />)
  return { onUsar, onCrear }
}

describe('PosiblesDuplicados', () => {
  it('asks «¿Es alguna de estas personas?» and lists every match with its details', () => {
    abrir()
    const panel = screen.getByRole('region', { name: '¿Es alguna de estas personas?' })
    const filas = within(panel).getAllByRole('listitem')
    expect(filas).toHaveLength(2)
    expect(within(filas[0]).getByText('Isaac Paez')).toBeInTheDocument()
    expect(within(filas[0]).getByText('Valencia · 2 servicios · Con cuenta')).toBeInTheDocument()
    expect(within(filas[0]).getByText('Mismo teléfono · Nombre parecido')).toBeInTheDocument()
    expect(within(filas[1]).getByText('Ana Pérez')).toBeInTheDocument()
    expect(within(filas[1]).getByText('Sin campus · 1 servicio · Sin cuenta')).toBeInTheDocument()
    expect(within(filas[1]).getByText('Misma cédula')).toBeInTheDocument()
  })

  it('«Usar esta persona» picks that person', async () => {
    const { onUsar, onCrear } = abrir()
    const fila = screen.getAllByRole('listitem')[1]
    await userEvent.click(within(fila).getByRole('button', { name: 'Usar esta persona: Ana Pérez' }))
    expect(onUsar).toHaveBeenCalledWith(ANA)
    expect(onCrear).not.toHaveBeenCalled()
  })

  it('«No, es otra persona, crear» goes on without picking anyone', async () => {
    const { onUsar, onCrear } = abrir()
    await userEvent.click(screen.getByRole('button', { name: 'No, es otra persona, crear' }))
    expect(onCrear).toHaveBeenCalledTimes(1)
    expect(onUsar).not.toHaveBeenCalled()
  })
})
