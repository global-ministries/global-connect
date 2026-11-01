import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { FamiliasClient } from '@/components/ninos/familias-client'

const rpc = jest.fn()
const push = jest.fn()
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({ rpc }) }))
jest.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: jest.fn() }) }))

it('a family registered from the check-in goes back with it selected', async () => {
  // ninos_buscar_padre, ninos_hijos_coincidencias (none), then the registration.
  rpc
    .mockResolvedValueOnce({ data: [], error: null })
    .mockResolvedValueOnce({ data: [], error: null })
    .mockResolvedValueOnce({ data: { padre_id: 'p1' }, error: null })
  render(<FamiliasClient salones={[]} fechaServicio="2026-10-11" registrarAlInicio volverCheckin="/ninos/checkin?turno=t9&fecha=2026-10-11" />)

  fireEvent.change(screen.getByLabelText('Nombre del representante'), { target: { value: 'Ana' } })
  fireEvent.change(screen.getByLabelText('Apellido del representante'), { target: { value: 'Pérez' } })
  fireEvent.change(screen.getByLabelText('Teléfono'), { target: { value: '04145551234' } })
  fireEvent.click(within(screen.getByRole('group', { name: 'Género del representante' })).getByRole('button', { name: 'Mamá' }))
  fireEvent.change(screen.getByLabelText('Nombre del niño 1'), { target: { value: 'Luis' } })
  fireEvent.change(screen.getByLabelText('Apellido del niño 1'), { target: { value: 'Pérez' } })
  fireEvent.change(screen.getByLabelText('Fecha de nacimiento del niño 1'), { target: { value: '2022-03-10' } })
  fireEvent.click(within(screen.getByRole('group', { name: 'Género del niño 1' })).getByRole('button', { name: 'Niño' }))
  fireEvent.click(screen.getByRole('button', { name: 'Registrar familia' }))

  await waitFor(() =>
    expect(push).toHaveBeenCalledWith('/ninos/checkin?turno=t9&fecha=2026-10-11&padre=p1&q=Luis%20P%C3%A9rez'),
  )
})

it('opening the other family of a duplicate child goes back to the check-in with that family', async () => {
  rpc.mockReset()
  push.mockReset()
  rpc
    .mockResolvedValueOnce({ data: [], error: null })
    .mockResolvedValueOnce({
      data: [{ indice: 0, nino_id: 'n9', nombre: 'Luis', apellido: 'Pérez', padre_id: 'p3', padres: ['Rosa Pérez'] }],
      error: null,
    })
  render(<FamiliasClient salones={[]} fechaServicio="2026-10-11" registrarAlInicio volverCheckin="/ninos/checkin?turno=t9&fecha=2026-10-11" />)

  fireEvent.change(screen.getByLabelText('Nombre del representante'), { target: { value: 'Ana' } })
  fireEvent.change(screen.getByLabelText('Apellido del representante'), { target: { value: 'Pérez' } })
  fireEvent.change(screen.getByLabelText('Teléfono'), { target: { value: '04145551234' } })
  fireEvent.click(within(screen.getByRole('group', { name: 'Género del representante' })).getByRole('button', { name: 'Mamá' }))
  fireEvent.change(screen.getByLabelText('Nombre del niño 1'), { target: { value: 'Luis' } })
  fireEvent.change(screen.getByLabelText('Apellido del niño 1'), { target: { value: 'Pérez' } })
  fireEvent.change(screen.getByLabelText('Fecha de nacimiento del niño 1'), { target: { value: '2022-03-10' } })
  fireEvent.click(within(screen.getByRole('group', { name: 'Género del niño 1' })).getByRole('button', { name: 'Niño' }))
  fireEvent.click(screen.getByRole('button', { name: 'Registrar familia' }))

  fireEvent.click(await screen.findByRole('button', { name: 'Abrir esa familia' }))
  expect(push).toHaveBeenCalledWith('/ninos/checkin?turno=t9&fecha=2026-10-11&padre=p3&q=Luis%20P%C3%A9rez')
  expect(rpc).not.toHaveBeenCalledWith('ninos_registrar_familia_mesa', expect.anything())
})
