import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { RegistroMesa as RegistrarFamiliaForm } from '@/components/ninos/registro-rapido/registro-mesa'

const rpc = jest.fn()
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({ rpc }) }))

const duplicado = { indice: 0, nino_id: 'n9', nombre: 'Luis', apellido: 'Ruiz', padre_id: 'p3', padres: ['Ana Ruiz'] }
const AVISO = 'Luis Ruiz ya está registrado en la familia de Ana Ruiz.'

type Respuestas = { coincidencias?: { data: unknown; error: unknown } }

function responder({ coincidencias = { data: [duplicado], error: null } }: Respuestas = {}) {
  rpc.mockImplementation((fn: string) => {
    if (fn === 'ninos_conyuge_de') return Promise.resolve({ data: null, error: null })
    if (fn === 'ninos_buscar_padre') return Promise.resolve({ data: [], error: null })
    if (fn === 'ninos_hijos_coincidencias') return Promise.resolve(coincidencias)
    return Promise.resolve({ data: { padre_id: 'p1', padre_nuevo: false, hijos: ['h1'] }, error: null })
  })
}

function llenarHijo() {
  fireEvent.change(screen.getByLabelText('Nombre del niño 1'), { target: { value: 'Luis' } })
  fireEvent.change(screen.getByLabelText('Apellido del niño 1'), { target: { value: 'Ruiz' } })
  fireEvent.change(screen.getByLabelText('Fecha de nacimiento del niño 1'), { target: { value: '2022-03-10' } })
  fireEvent.click(within(screen.getByRole('group', { name: 'Género del niño 1' })).getByRole('button', { name: 'Niño' }))
}

function llenarRepresentante() {
  fireEvent.change(screen.getByLabelText('Nombre del representante'), { target: { value: 'José' } })
  fireEvent.change(screen.getByLabelText('Apellido del representante'), { target: { value: 'Ruiz' } })
  fireEvent.change(screen.getByLabelText('Teléfono'), { target: { value: '04145551234' } })
  fireEvent.click(within(screen.getByRole('group', { name: 'Género del representante' })).getByRole('button', { name: 'Papá' }))
}

const registros = () => rpc.mock.calls.filter(([fn]) => fn === 'ninos_registrar_familia' || fn === 'ninos_registrar_familia_mesa')

function agregarNino(props: Partial<React.ComponentProps<typeof RegistrarFamiliaForm>> = {}) {
  const onRegistrada = jest.fn()
  render(
    <RegistrarFamiliaForm
      padreExistente={{ id: 'p1', nombre: 'Pedro Ruiz' }}
      onRegistrada={onRegistrada}
      onCancelar={jest.fn()}
      {...props}
    />,
  )
  llenarHijo()
  fireEvent.click(screen.getByRole('button', { name: 'Agregar niño' }))
  return onRegistrada
}

beforeEach(() => rpc.mockReset())

describe('RegistrarFamiliaForm: child already in another family', () => {
  it('checks the children against other families of the existing adult before registering', async () => {
    responder({ coincidencias: { data: [], error: null } })
    const onRegistrada = agregarNino()
    await waitFor(() => expect(onRegistrada).toHaveBeenCalledWith('p1', 'Luis Ruiz'))
    expect(rpc).toHaveBeenCalledWith('ninos_hijos_coincidencias', {
      p_hijos: [expect.objectContaining({ nombre: 'Luis', apellido: 'Ruiz', fecha_nacimiento: '2022-03-10' })],
      p_padre_id: 'p1',
    })
  })

  it('warns and does not register while the anfitrión has not decided', async () => {
    responder()
    const onRegistrada = agregarNino()
    expect(await screen.findByText(AVISO)).toBeInTheDocument()
    expect(registros()).toHaveLength(0)
    expect(onRegistrada).not.toHaveBeenCalled()
  })

  it('"Registrar de todos modos" registers the children as typed', async () => {
    responder()
    const onRegistrada = agregarNino()
    fireEvent.click(await screen.findByRole('button', { name: 'Registrar de todos modos' }))
    await waitFor(() => expect(onRegistrada).toHaveBeenCalledWith('p1', 'Luis Ruiz'))
    expect(registros()).toHaveLength(1)
    expect(registros()[0][1].p).toEqual(expect.objectContaining({ padre: { id: 'p1' } }))
  })

  it('"Abrir esa familia" hands the other family to the screen and registers nothing', async () => {
    responder()
    const onAbrirFamilia = jest.fn()
    agregarNino({ onAbrirFamilia })
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir esa familia' }))
    expect(onAbrirFamilia).toHaveBeenCalledWith('p3', 'Luis Ruiz')
    expect(registros()).toHaveLength(0)
  })

  it('without onAbrirFamilia there is no open button', async () => {
    responder()
    agregarNino()
    await screen.findByText(AVISO)
    expect(screen.queryByRole('button', { name: 'Abrir esa familia' })).not.toBeInTheDocument()
  })

  it('"Corregir datos" closes the warning without registering', async () => {
    responder()
    agregarNino()
    fireEvent.click(await screen.findByRole('button', { name: 'Corregir datos' }))
    expect(screen.queryByText(AVISO)).not.toBeInTheDocument()
    expect(registros()).toHaveLength(0)
  })

  it('a failed lookup never blocks the registration', async () => {
    responder({ coincidencias: { data: null, error: { code: '42883', message: 'function does not exist' } } })
    const onRegistrada = agregarNino()
    await waitFor(() => expect(onRegistrada).toHaveBeenCalled())
    expect(registros()).toHaveLength(1)
  })

  it('a new family is checked with no adult id after the parent check', async () => {
    responder()
    render(<RegistrarFamiliaForm onRegistrada={jest.fn()} onCancelar={jest.fn()} />)
    llenarRepresentante()
    llenarHijo()
    fireEvent.click(screen.getByRole('button', { name: 'Registrar familia' }))
    expect(await screen.findByText(AVISO)).toBeInTheDocument()
    expect(rpc).toHaveBeenCalledWith('ninos_hijos_coincidencias', expect.objectContaining({ p_padre_id: null }))
    expect(registros()).toHaveLength(0)
  })

  it('a pre-registration confirmed through its own route is not checked here (unchanged)', async () => {
    responder()
    const guardar = jest.fn().mockResolvedValue({ padreId: 'p1' })
    const onRegistrada = agregarNino({ guardar, textoGuardar: 'Agregar niño' })
    await waitFor(() => expect(guardar).toHaveBeenCalled())
    expect(onRegistrada).toHaveBeenCalledWith('p1', 'Luis Ruiz')
    expect(rpc).not.toHaveBeenCalledWith('ninos_hijos_coincidencias', expect.anything())
  })
})
