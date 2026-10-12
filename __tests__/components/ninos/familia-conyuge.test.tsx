import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { RegistrarFamiliaForm } from '@/components/ninos/registrar-familia-form'

const rpc = jest.fn()
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({ rpc }) }))

const conyuge = { id: 'c1', nombre: 'Marta', apellido: 'Ruiz', genero: 'Femenino' }

function responder(conyugeData: unknown) {
  rpc.mockImplementation((fn: string) =>
    Promise.resolve(
      fn === 'ninos_conyuge_de'
        ? { data: conyugeData, error: null }
        : { data: { padre_id: 'p1', padre_nuevo: false, hijos: ['h1'] }, error: null },
    ),
  )
}

function llenarHijo() {
  fireEvent.change(screen.getByLabelText('Nombre del niño 1'), { target: { value: 'Luis' } })
  fireEvent.change(screen.getByLabelText('Apellido del niño 1'), { target: { value: 'Ruiz' } })
  fireEvent.change(screen.getByLabelText('Fecha de nacimiento del niño 1'), { target: { value: '2022-03-10' } })
  fireEvent.change(screen.getByLabelText('Género del niño 1'), { target: { value: 'Masculino' } })
}

function payloadRegistrado() {
  const llamada = rpc.mock.calls.find(([fn]) => fn === 'ninos_registrar_familia')
  return llamada?.[1].p
}

beforeEach(() => rpc.mockReset())

describe('RegistrarFamiliaForm: spouse as second parent', () => {
  it('looks up the spouse of the existing adult', async () => {
    responder(null)
    render(<RegistrarFamiliaForm padreExistente={{ id: 'p1', nombre: 'Pedro Ruiz' }} onRegistrada={jest.fn()} onCancelar={jest.fn()} />)
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('ninos_conyuge_de', { p_usuario_id: 'p1' }))
  })

  it('shows no prompt and sends no spouse when there is none', async () => {
    responder(null)
    const onRegistrada = jest.fn()
    render(<RegistrarFamiliaForm padreExistente={{ id: 'p1', nombre: 'Pedro Ruiz' }} onRegistrada={onRegistrada} onCancelar={jest.fn()} />)
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('ninos_conyuge_de', expect.anything()))
    expect(screen.queryByRole('checkbox', { name: /Vincular también/ })).not.toBeInTheDocument()
    llenarHijo()
    fireEvent.click(screen.getByRole('button', { name: 'Agregar niño' }))
    await waitFor(() => expect(onRegistrada).toHaveBeenCalled())
    expect(payloadRegistrado()).not.toHaveProperty('conyuge_id')
  })

  it('offers the spouse unchecked; declining sends no spouse', async () => {
    responder(conyuge)
    const onRegistrada = jest.fn()
    render(<RegistrarFamiliaForm padreExistente={{ id: 'p1', nombre: 'Pedro Ruiz' }} onRegistrada={onRegistrada} onCancelar={jest.fn()} />)
    const casilla = await screen.findByRole('checkbox', { name: '¿Vincular también a Marta Ruiz como madre?' })
    expect(casilla).not.toBeChecked()
    llenarHijo()
    fireEvent.click(screen.getByRole('button', { name: 'Agregar niño' }))
    await waitFor(() => expect(onRegistrada).toHaveBeenCalled())
    expect(payloadRegistrado()).not.toHaveProperty('conyuge_id')
  })

  it('confirming the spouse sends conyuge_id', async () => {
    responder(conyuge)
    const onRegistrada = jest.fn()
    render(<RegistrarFamiliaForm padreExistente={{ id: 'p1', nombre: 'Pedro Ruiz' }} onRegistrada={onRegistrada} onCancelar={jest.fn()} />)
    fireEvent.click(await screen.findByRole('checkbox', { name: /Vincular también a Marta Ruiz/ }))
    llenarHijo()
    fireEvent.click(screen.getByRole('button', { name: 'Agregar niño' }))
    await waitFor(() => expect(onRegistrada).toHaveBeenCalled())
    expect(payloadRegistrado()).toEqual(expect.objectContaining({ padre: { id: 'p1' }, conyuge_id: 'c1' }))
  })

  it('shows a readable error when the spouse is no longer valid', async () => {
    rpc.mockImplementation((fn: string) =>
      Promise.resolve(
        fn === 'ninos_conyuge_de'
          ? { data: conyuge, error: null }
          : { data: null, error: { code: '22023', message: 'conyuge_invalido' } },
      ),
    )
    const onRegistrada = jest.fn()
    render(<RegistrarFamiliaForm padreExistente={{ id: 'p1', nombre: 'Pedro Ruiz' }} onRegistrada={onRegistrada} onCancelar={jest.fn()} />)
    fireEvent.click(await screen.findByRole('checkbox', { name: /Vincular también a Marta Ruiz/ }))
    llenarHijo()
    fireEvent.click(screen.getByRole('button', { name: 'Agregar niño' }))
    expect(await screen.findByText('Esa persona ya no figura como cónyuge del representante. Vuelve a abrir el formulario.')).toBeInTheDocument()
    expect(onRegistrada).not.toHaveBeenCalled()
  })

  it('does not look up a spouse when registering a new family', () => {
    responder(conyuge)
    render(<RegistrarFamiliaForm onRegistrada={jest.fn()} onCancelar={jest.fn()} />)
    expect(rpc).not.toHaveBeenCalled()
  })
})

const coincidencia = { id: 'p9', nombre: 'José', apellido: 'Ruiz', telefono: '•••1234', cedula: null, coincide_por: 'telefono' }

function responderNuevaFamilia(conyugeDe: Record<string, unknown>) {
  rpc.mockImplementation((fn: string, args: { p_usuario_id?: string }) => {
    if (fn === 'ninos_buscar_padre') return Promise.resolve({ data: [coincidencia], error: null })
    if (fn === 'ninos_conyuge_de') return Promise.resolve({ data: conyugeDe[args.p_usuario_id ?? ''] ?? null, error: null })
    return Promise.resolve({ data: { padre_id: 'p9', padre_nuevo: false, hijos: ['h1'] }, error: null })
  })
}

function llenarRepresentante() {
  fireEvent.change(screen.getByLabelText('Nombre del representante'), { target: { value: 'José' } })
  fireEvent.change(screen.getByLabelText('Apellido del representante'), { target: { value: 'Ruiz' } })
  fireEvent.change(screen.getByLabelText('Teléfono'), { target: { value: '04145551234' } })
  fireEvent.change(screen.getByLabelText('Género del representante'), { target: { value: 'Masculino' } })
}

describe('RegistrarFamiliaForm: spouse when the new family confirms an existing adult', () => {
  it('confirming an existing adult with a spouse offers the spouse and waits; checking it sends conyuge_id', async () => {
    responderNuevaFamilia({ p9: conyuge })
    const onRegistrada = jest.fn()
    render(<RegistrarFamiliaForm onRegistrada={onRegistrada} onCancelar={jest.fn()} />)
    llenarRepresentante()
    llenarHijo()
    fireEvent.click(screen.getByRole('button', { name: 'Registrar familia' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Sí, es esta persona' }))

    const casilla = await screen.findByRole('checkbox', { name: '¿Vincular también a Marta Ruiz como madre?' })
    expect(rpc).toHaveBeenCalledWith('ninos_conyuge_de', { p_usuario_id: 'p9' })
    expect(casilla).not.toBeChecked()
    expect(onRegistrada).not.toHaveBeenCalled()

    fireEvent.click(casilla)
    fireEvent.click(screen.getByRole('button', { name: 'Registrar familia' }))
    await waitFor(() => expect(onRegistrada).toHaveBeenCalledWith('p9', 'Luis Ruiz'))
    expect(payloadRegistrado()).toEqual(expect.objectContaining({ padre: { id: 'p9' }, conyuge_id: 'c1' }))
  })

  it('confirming an existing adult with a spouse and leaving it unchecked sends no spouse', async () => {
    responderNuevaFamilia({ p9: conyuge })
    const onRegistrada = jest.fn()
    render(<RegistrarFamiliaForm onRegistrada={onRegistrada} onCancelar={jest.fn()} />)
    llenarRepresentante()
    llenarHijo()
    fireEvent.click(screen.getByRole('button', { name: 'Registrar familia' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Sí, es esta persona' }))
    await screen.findByRole('checkbox', { name: /Vincular también a Marta Ruiz/ })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar familia' }))
    await waitFor(() => expect(onRegistrada).toHaveBeenCalled())
    expect(payloadRegistrado()).toEqual(expect.objectContaining({ padre: { id: 'p9' } }))
    expect(payloadRegistrado()).not.toHaveProperty('conyuge_id')
  })

  it('confirming an existing adult without a spouse registers right away with no prompt', async () => {
    responderNuevaFamilia({})
    const onRegistrada = jest.fn()
    render(<RegistrarFamiliaForm onRegistrada={onRegistrada} onCancelar={jest.fn()} />)
    llenarRepresentante()
    llenarHijo()
    fireEvent.click(screen.getByRole('button', { name: 'Registrar familia' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Sí, es esta persona' }))
    await waitFor(() => expect(onRegistrada).toHaveBeenCalledWith('p9', 'Luis Ruiz'))
    expect(screen.queryByRole('checkbox', { name: /Vincular también/ })).not.toBeInTheDocument()
    expect(payloadRegistrado()).not.toHaveProperty('conyuge_id')
  })

  it('changing the confirmed adult resets the choice and drops the spouse', async () => {
    responderNuevaFamilia({ p9: conyuge })
    const onRegistrada = jest.fn()
    render(<RegistrarFamiliaForm onRegistrada={onRegistrada} onCancelar={jest.fn()} />)
    llenarRepresentante()
    llenarHijo()
    fireEvent.click(screen.getByRole('button', { name: 'Registrar familia' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Sí, es esta persona' }))
    fireEvent.click(await screen.findByRole('checkbox', { name: /Vincular también a Marta Ruiz/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar representante' }))

    expect(screen.queryByRole('checkbox', { name: /Vincular también/ })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Nombre del representante')).toHaveValue('José')
    fireEvent.click(screen.getByRole('button', { name: 'Registrar familia' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Sí, es esta persona' }))
    expect(await screen.findByRole('checkbox', { name: /Vincular también a Marta Ruiz/ })).not.toBeChecked()
  })

  it('a brand-new adult gets no spouse prompt and no lookup', async () => {
    rpc.mockImplementation((fn: string) =>
      Promise.resolve(fn === 'ninos_buscar_padre' ? { data: [], error: null } : { data: { padre_id: 'n1', padre_nuevo: true, hijos: ['h1'] }, error: null }),
    )
    const onRegistrada = jest.fn()
    render(<RegistrarFamiliaForm onRegistrada={onRegistrada} onCancelar={jest.fn()} />)
    llenarRepresentante()
    llenarHijo()
    fireEvent.click(screen.getByRole('button', { name: 'Registrar familia' }))
    await waitFor(() => expect(onRegistrada).toHaveBeenCalledWith('n1', 'Luis Ruiz'))
    expect(rpc).not.toHaveBeenCalledWith('ninos_conyuge_de', expect.anything())
    expect(screen.queryByRole('checkbox', { name: /Vincular también/ })).not.toBeInTheDocument()
    expect(payloadRegistrado()).not.toHaveProperty('conyuge_id')
  })
})
