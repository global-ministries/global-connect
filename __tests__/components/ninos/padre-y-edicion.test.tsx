import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { EditarNinoForm } from '@/components/ninos/editar-nino-form'
import { RegistrarFamiliaForm } from '@/components/ninos/registrar-familia-form'
import type { HijoEncontrado } from '@/lib/platform/ninos/familias-vista'

const rpc = jest.fn()
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({ rpc }) }))

beforeEach(() => rpc.mockReset())

function llenarFamilia() {
  fireEvent.change(screen.getByLabelText('Nombre del representante'), { target: { value: 'Ana' } })
  fireEvent.change(screen.getByLabelText('Apellido del representante'), { target: { value: 'Pérez' } })
  fireEvent.change(screen.getByLabelText('Teléfono'), { target: { value: '04145551234' } })
  fireEvent.change(screen.getByLabelText('Género del representante'), { target: { value: 'Femenino' } })
  fireEvent.change(screen.getByLabelText('Nombre del niño 1'), { target: { value: 'Luis' } })
  fireEvent.change(screen.getByLabelText('Apellido del niño 1'), { target: { value: 'Pérez' } })
  fireEvent.change(screen.getByLabelText('Fecha de nacimiento del niño 1'), { target: { value: '2022-03-10' } })
  fireEvent.change(screen.getByLabelText('Género del niño 1'), { target: { value: 'Masculino' } })
}

const coincidencia = { id: 'p9', nombre: 'Ana', apellido: 'Pérez', telefono: '•••1234', cedula: null, coincide_por: 'telefono' }

describe('RegistrarFamiliaForm — existing parent', () => {
  it('shows the masked match and does not register before confirming', async () => {
    rpc.mockResolvedValueOnce({ data: [coincidencia], error: null })
    render(<RegistrarFamiliaForm onRegistrada={jest.fn()} onCancelar={jest.fn()} />)
    llenarFamilia()
    fireEvent.click(screen.getByRole('button', { name: 'Registrar familia' }))

    expect(await screen.findByText(/Ya existe una persona con estos datos/)).toBeInTheDocument()
    expect(screen.getByText(/•••1234/)).toBeInTheDocument()
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('ninos_buscar_padre', { p_cedula: '', p_telefono: '04145551234' })
  })

  it('"Sí, es esta persona" registers with the explicit parent id', async () => {
    rpc
      .mockResolvedValueOnce({ data: [coincidencia], error: null })
      .mockResolvedValueOnce({ data: { padre_id: 'p9', padre_nuevo: false, hijos: ['h1'] }, error: null })
    const onRegistrada = jest.fn()
    render(<RegistrarFamiliaForm onRegistrada={onRegistrada} onCancelar={jest.fn()} />)
    llenarFamilia()
    fireEvent.click(screen.getByRole('button', { name: 'Registrar familia' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Sí, es esta persona' }))

    await waitFor(() => expect(onRegistrada).toHaveBeenCalledWith('p9', 'Luis Pérez'))
    expect(rpc).toHaveBeenLastCalledWith('ninos_registrar_familia', { p: expect.objectContaining({ padre: { id: 'p9' } }) })
  })

  it('"No, corregir datos" closes the match without registering', async () => {
    rpc.mockResolvedValueOnce({ data: [coincidencia], error: null })
    render(<RegistrarFamiliaForm onRegistrada={jest.fn()} onCancelar={jest.fn()} />)
    llenarFamilia()
    fireEvent.click(screen.getByRole('button', { name: 'Registrar familia' }))
    fireEvent.click(await screen.findByRole('button', { name: 'No, corregir datos' }))

    expect(screen.queryByText(/Ya existe una persona con estos datos/)).not.toBeInTheDocument()
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('without a match it registers the new parent', async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null }).mockResolvedValueOnce({ data: { padre_id: 'p1' }, error: null })
    const onRegistrada = jest.fn()
    render(<RegistrarFamiliaForm onRegistrada={onRegistrada} onCancelar={jest.fn()} />)
    llenarFamilia()
    fireEvent.click(screen.getByRole('button', { name: 'Registrar familia' }))
    await waitFor(() => expect(onRegistrada).toHaveBeenCalledWith('p1', 'Luis Pérez'))
  })
})

const hijo: HijoEncontrado = {
  id: 'h1', nombre: 'Luis', apellido: 'Pérez', fecha_nacimiento: '2022-03-10', genero: 'Masculino', grado: null,
  alergias: null, necesidades_especiales: null, habitos: null, notas: null, puede_comer: null, cambio_panal: null,
  autoriza_imagen: null, escolarizado: null, salon_preferido_id: null, es_vip_desde: null, autorizados: [],
}

describe('EditarNinoForm — identity', () => {
  it('edits the name, birth date and gender through ninos_actualizar_nino', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    const onGuardado = jest.fn()
    render(<EditarNinoForm hijo={hijo} onGuardado={onGuardado} onCancelar={jest.fn()} />)
    fireEvent.change(screen.getByLabelText('Nombre del niño 1'), { target: { value: 'Luis Miguel' } })
    fireEvent.change(screen.getByLabelText('Fecha de nacimiento del niño 1'), { target: { value: '2022-04-11' } })
    fireEvent.change(screen.getByLabelText('Género del niño 1'), { target: { value: 'Otro' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar ficha' }))

    await waitFor(() => expect(onGuardado).toHaveBeenCalled())
    expect(rpc).toHaveBeenCalledWith('ninos_actualizar_nino', {
      p_nino_id: 'h1',
      p: expect.objectContaining({ nombre: 'Luis Miguel', apellido: 'Pérez', fecha_nacimiento: '2022-04-11', genero: 'Otro' }),
    })
  })

  it('a blank name is not sent', async () => {
    render(<EditarNinoForm hijo={hijo} onGuardado={jest.fn()} onCancelar={jest.fn()} />)
    fireEvent.change(screen.getByLabelText('Nombre del niño 1'), { target: { value: ' ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar ficha' }))
    expect(await screen.findByText('El nombre es obligatorio.')).toBeInTheDocument()
    expect(rpc).not.toHaveBeenCalled()
  })
})
