/**
 * Public registration wizard: any shared-validation error blocks the children
 * step, even one the wizard cannot place next to a field.
 */
import { fireEvent, render, screen, within } from '@testing-library/react'

import { RegistroFamilia } from '@/components/ninos/registro/registro-familia'
import * as familia from '@/lib/platform/ninos/familia'

jest.mock('@/lib/platform/ninos/familia', () => {
  const real = jest.requireActual('@/lib/platform/ninos/familia')
  return { ...real, validarFamilia: jest.fn(real.validarFamilia) }
})

const validarFamilia = familia.validarFamilia as jest.MockedFunction<typeof familia.validarFamilia>
const campus = [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', nombre: 'Campus Uno' }]
const escribir = (etiqueta: string, valor: string) => fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } })
const continuar = () => fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))

it('blocks the children step on an error it cannot map to a field and shows it', () => {
  render(<RegistroFamilia campus={campus} />)
  escribir('Tu nombre', 'Ana')
  escribir('Tu apellido', 'Prueba')
  escribir('Teléfono', '04140000000')
  continuar()
  escribir('Nombre del niño 1', 'Sol')
  escribir('Fecha de nacimiento del niño 1', '2021-03-04')
  fireEvent.click(within(screen.getByRole('group', { name: 'Género del niño 1' })).getByRole('button', { name: 'Niña' }))

  validarFamilia.mockReturnValue({ ok: false, errores: ['Niño 1: el salón no está disponible.'] })
  continuar()

  expect(screen.getByText('Paso 2 de 6')).toBeInTheDocument()
  const alerta = screen.getByText('Niño 1: el salón no está disponible.')
  expect(alerta.closest('[role="alert"]')).not.toBeNull()
  expect(alerta.closest('[role="alert"]')).toHaveFocus()

  validarFamilia.mockImplementation(jest.requireActual('@/lib/platform/ninos/familia').validarFamilia)
  continuar()
  expect(screen.getByText('Paso 3 de 6')).toBeInTheDocument()
})
