import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { SalonSugerido } from '@/components/ninos/salon-sugerido'
import { RegistrarFamiliaForm } from '@/components/ninos/registrar-familia-form'
import type { SalonFila } from '@/lib/platform/ninos/familias-vista'

const rpc = jest.fn()
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({ rpc }) }))

const salones: SalonFila[] = [
  { id: 's1', nombre: 'Maternal', area: 'waumba', edad_min_meses: 0, edad_max_meses: 23, grado_min: null, grado_max: null, es_necesidades_especiales: false, activo: true, orden: 10 },
  { id: 's2', nombre: '1º grado', area: 'upstreet', edad_min_meses: null, edad_max_meses: null, grado_min: 1, grado_max: 1, es_necesidades_especiales: false, activo: true, orden: 20 },
]

beforeEach(() => rpc.mockReset())

describe('SalonSugerido', () => {
  it('shows the suggested room', () => {
    render(<SalonSugerido resultado={{ tipo: 'sugerido', salon: { ...salones[0], id: 's1', nombre: 'Maternal' } as never }} salones={salones} onElegir={jest.fn()} />)
    expect(screen.getByText(/Maternal/)).toBeInTheDocument()
    expect(screen.queryByText(/Sin salón sugerido/)).not.toBeInTheDocument()
  })

  it('without a suggestion it says so and asks for a manual room', () => {
    const onElegir = jest.fn()
    render(<SalonSugerido resultado={{ tipo: 'ninguno' }} salones={salones} onElegir={onElegir} />)
    expect(screen.getByText('Sin salón sugerido: asígnalo manualmente')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Asignar salón'), { target: { value: 's2' } })
    expect(onElegir).toHaveBeenCalledWith('s2')
  })
})

describe('RegistrarFamiliaForm', () => {
  it('shows validation errors and does not call the RPC', async () => {
    render(<RegistrarFamiliaForm onRegistrada={jest.fn()} onCancelar={jest.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Registrar familia' }))
    expect(await screen.findByText('El nombre del representante es obligatorio.')).toBeInTheDocument()
    expect(rpc).not.toHaveBeenCalled()
  })

  function llenarNuevaFamilia() {
    fireEvent.change(screen.getByLabelText('Nombre del representante'), { target: { value: 'Ana' } })
    fireEvent.change(screen.getByLabelText('Apellido del representante'), { target: { value: 'Pérez' } })
    fireEvent.change(screen.getByLabelText('Teléfono'), { target: { value: '04145551234' } })
    fireEvent.change(screen.getByLabelText('Género del representante'), { target: { value: 'Femenino' } })
    fireEvent.change(screen.getByLabelText('Nombre del niño 1'), { target: { value: 'Luis' } })
    fireEvent.change(screen.getByLabelText('Apellido del niño 1'), { target: { value: 'Pérez' } })
    fireEvent.change(screen.getByLabelText('Fecha de nacimiento del niño 1'), { target: { value: '2022-03-10' } })
    fireEvent.change(screen.getByLabelText('Género del niño 1'), { target: { value: 'Masculino' } })
  }

  async function registrarNueva(onRegistrada = jest.fn()) {
    rpc
      .mockResolvedValueOnce({ data: [], error: null })
      // ninos_hijos_coincidencias: no child in another family.
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: { padre_id: 'p1', padre_nuevo: true, hijos: ['h1'] }, error: null })
    render(<RegistrarFamiliaForm onRegistrada={onRegistrada} onCancelar={jest.fn()} />)
    llenarNuevaFamilia()
    fireEvent.click(screen.getByRole('button', { name: 'Registrar familia' }))
    expect(await screen.findByText('Familia registrada')).toBeInTheDocument()
    return onRegistrada
  }

  it('registers a new family at the table and then offers the account invitation', async () => {
    const onRegistrada = await registrarNueva()
    expect(rpc).toHaveBeenCalledWith('ninos_registrar_familia_mesa', {
      p: expect.objectContaining({
        padre: expect.objectContaining({ nombre: 'Ana', telefono: '04145551234', genero: 'Femenino' }),
        hijos: [expect.objectContaining({ nombre: 'Luis', fecha_nacimiento: '2022-03-10' })],
      }),
    })
    expect(onRegistrada).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Invitar por correo' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(onRegistrada).toHaveBeenCalledWith('p1', 'Luis Pérez')
  })

  it('invites the new adult by email through the route, then continues', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, email: 'ana@example.test' }) })
    global.fetch = fetchMock as unknown as typeof fetch
    const onRegistrada = await registrarNueva()

    fireEvent.click(screen.getByRole('button', { name: 'Invitar por correo' }))
    expect(await screen.findByText('Escribe un correo válido.')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Correo del representante'), { target: { value: ' Ana@Example.test ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Invitar por correo' }))
    expect(await screen.findByText('Le enviamos la invitación a ana@example.test.')).toBeInTheDocument()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/ninos/familia/p1/invitar')
    expect(JSON.parse(init.body)).toEqual({ email: 'ana@example.test' })
    expect(screen.queryByRole('button', { name: 'Invitar por correo' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(onRegistrada).toHaveBeenCalledWith('p1', 'Luis Pérez')
  })

  it('shows why an invitation was refused', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false, status: 409, json: async () => ({ error: 'Ese correo ya pertenece a otra persona o a otra cuenta', codigo: 'email_en_uso' }),
    }) as unknown as typeof fetch
    await registrarNueva()
    fireEvent.change(screen.getByLabelText('Correo del representante'), { target: { value: 'ana@example.test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Invitar por correo' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Ese correo ya pertenece a otra persona o a otra cuenta')
  })

  it('an existing parent goes on directly, with no invitation offer', async () => {
    // An existing parent also triggers the spouse lookup (ninos_conyuge_de): no spouse recorded here.
    rpc.mockImplementation((fn: string) =>
      Promise.resolve(fn === 'ninos_conyuge_de' ? { data: null, error: null } : { data: { padre_id: 'p1', padre_nuevo: false, hijos: ['h1'] }, error: null }),
    )
    const onRegistrada = jest.fn()
    render(<RegistrarFamiliaForm padreExistente={{ id: 'p1', nombre: 'Ana Pérez' }} onRegistrada={onRegistrada} onCancelar={jest.fn()} />)
    fireEvent.change(screen.getByLabelText('Nombre del niño 1'), { target: { value: 'Luis' } })
    fireEvent.change(screen.getByLabelText('Apellido del niño 1'), { target: { value: 'Pérez' } })
    fireEvent.change(screen.getByLabelText('Fecha de nacimiento del niño 1'), { target: { value: '2022-03-10' } })
    fireEvent.change(screen.getByLabelText('Género del niño 1'), { target: { value: 'Masculino' } })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar niño' }))
    await waitFor(() => expect(onRegistrada).toHaveBeenCalledWith('p1', 'Luis Pérez'))
    expect(rpc).toHaveBeenCalledWith('ninos_registrar_familia', expect.anything())
    expect(screen.queryByText('Familia registrada')).not.toBeInTheDocument()
  })

  it('adding a child to a known parent hides the parent fields', () => {
    render(<RegistrarFamiliaForm padreExistente={{ id: 'p1', nombre: 'Ana Pérez' }} onRegistrada={jest.fn()} onCancelar={jest.fn()} />)
    expect(screen.queryByLabelText('Nombre del representante')).not.toBeInTheDocument()
    expect(screen.getByText(/Ana Pérez/)).toBeInTheDocument()
  })

  it('shows the RPC error in Spanish', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'sin_autoridad' } })
    render(<RegistrarFamiliaForm padreExistente={{ id: 'p1', nombre: 'Ana' }} onRegistrada={jest.fn()} onCancelar={jest.fn()} />)
    fireEvent.change(screen.getByLabelText('Nombre del niño 1'), { target: { value: 'Luis' } })
    fireEvent.change(screen.getByLabelText('Apellido del niño 1'), { target: { value: 'Pérez' } })
    fireEvent.change(screen.getByLabelText('Fecha de nacimiento del niño 1'), { target: { value: '2022-03-10' } })
    fireEvent.change(screen.getByLabelText('Género del niño 1'), { target: { value: 'Masculino' } })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar niño' }))
    expect(await screen.findByText('No tienes permiso para registrar familias.')).toBeInTheDocument()
  })
})
