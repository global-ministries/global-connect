import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { FamiliasClient } from '@/components/ninos/familias-client'

const rpc = jest.fn()
const push = jest.fn()
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({ rpc }) }))
jest.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: jest.fn() }) }))

it('a family registered from the check-in goes back with it selected', async () => {
  rpc.mockResolvedValueOnce({ data: [], error: null }).mockResolvedValueOnce({ data: { padre_id: 'p1' }, error: null })
  render(<FamiliasClient salones={[]} fechaServicio="2026-10-11" registrarAlInicio volverCheckin="/ninos/checkin?turno=t9&fecha=2026-10-11" />)

  fireEvent.change(screen.getByLabelText('Nombre del representante'), { target: { value: 'Ana' } })
  fireEvent.change(screen.getByLabelText('Apellido del representante'), { target: { value: 'Pérez' } })
  fireEvent.change(screen.getByLabelText('Teléfono'), { target: { value: '04145551234' } })
  fireEvent.change(screen.getByLabelText('Género del representante'), { target: { value: 'Femenino' } })
  fireEvent.change(screen.getByLabelText('Nombre del niño 1'), { target: { value: 'Luis' } })
  fireEvent.change(screen.getByLabelText('Apellido del niño 1'), { target: { value: 'Pérez' } })
  fireEvent.change(screen.getByLabelText('Fecha de nacimiento del niño 1'), { target: { value: '2022-03-10' } })
  fireEvent.change(screen.getByLabelText('Género del niño 1'), { target: { value: 'Masculino' } })
  fireEvent.click(screen.getByRole('button', { name: 'Registrar familia' }))

  await waitFor(() =>
    expect(push).toHaveBeenCalledWith('/ninos/checkin?turno=t9&fecha=2026-10-11&padre=p1&q=Luis%20P%C3%A9rez'),
  )
})
