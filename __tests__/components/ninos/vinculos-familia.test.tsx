import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { AgregarPadreForm } from '@/components/ninos/agregar-padre-form'
import { EditarNinoForm } from '@/components/ninos/editar-nino-form'
import { FamiliasClient } from '@/components/ninos/familias-client'
import type { FamiliaEncontrada, HijoEncontrado } from '@/lib/platform/ninos/familias-vista'

const rpc = jest.fn()
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({ rpc }) }))
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn() }) }))

beforeEach(() => rpc.mockReset())

function hijo(h: Partial<HijoEncontrado> & { id: string; nombre: string }): HijoEncontrado {
  return {
    apellido: 'Pérez', fecha_nacimiento: '2021-06-01', genero: 'Masculino', grado: null, alergias: null,
    necesidades_especiales: null, habitos: null, notas: null, puede_comer: null, cambio_panal: null,
    autoriza_imagen: null, escolarizado: null, salon_preferido_id: null, es_vip_desde: null, tiene_ficha: true,
    autorizados: [], ...h,
  }
}

const familia: FamiliaEncontrada = {
  id: 'p1', nombre: 'Ana', apellido: 'Pérez', telefono: '04145551234', cedula: null,
  hijos: [hijo({ id: 'h1', nombre: 'Luis' }), hijo({ id: 'h2', nombre: 'Eva', tiene_ficha: false })],
  padres: [{ id: 'p1', nombre: 'Ana', apellido: 'Pérez', telefono: '04145551234' }],
}

describe('EditarNinoForm for a child without ficha', () => {
  it('creates the ficha with ninos_crear_ficha', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null })
    const onGuardado = jest.fn()
    render(<EditarNinoForm hijo={familia.hijos[1]} onGuardado={onGuardado} onCancelar={jest.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Crear ficha' }))
    await waitFor(() => expect(onGuardado).toHaveBeenCalled())
    expect(rpc).toHaveBeenCalledWith('ninos_crear_ficha', {
      p_nino_id: 'h2',
      p_ficha: expect.objectContaining({ nombre: 'Eva', fecha_nacimiento: '2021-06-01' }),
      p_autorizados: [],
    })
  })
})

describe('FamiliasClient card (N10)', () => {
  it('shows both parents, the missing-ficha badge and its action, merging duplicate cards', async () => {
    const padres = [
      { id: 'p1', nombre: 'Ana', apellido: 'Pérez', telefono: null },
      { id: 'p2', nombre: 'Juan', apellido: 'Pérez', telefono: null },
    ]
    rpc.mockResolvedValueOnce({
      data: [
        { ...familia, padres },
        { ...familia, id: 'p2', nombre: 'Juan', padres: [padres[1], padres[0]] },
      ],
      error: null,
    })
    render(<FamiliasClient salones={[]} fechaServicio="2026-10-11" />)
    fireEvent.change(screen.getByLabelText('Buscar familia'), { target: { value: 'Pérez' } })
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))

    const tarjetas = await screen.findAllByTestId('familia-tarjeta')
    expect(tarjetas).toHaveLength(1)
    const t = within(tarjetas[0])
    expect(t.getByText('Ana Pérez · Juan Pérez')).toBeInTheDocument()
    expect(t.getByText('Sin ficha de niños')).toBeInTheDocument()
    expect(t.getAllByRole('button', { name: 'Completar ficha' })).toHaveLength(1)
    expect(t.getByRole('button', { name: 'Agregar padre o madre' })).toBeInTheDocument()
  })
})

describe('AgregarPadreForm', () => {
  it('links an existing person after an explicit confirmation, for the checked children', async () => {
    rpc
      .mockResolvedValueOnce({
        data: [{ id: 'p2', nombre: 'Juan', apellido: 'Pérez', telefono: '•••9876', cedula: null, coincide_por: 'telefono' }],
        error: null,
      })
      .mockResolvedValueOnce({ data: { padre_id: 'p2', padre_nuevo: false, vinculados: 1 }, error: null })
    const onVinculado = jest.fn()
    render(<AgregarPadreForm familia={familia} onVinculado={onVinculado} onCancelar={jest.fn()} />)

    expect(screen.getByLabelText('Luis Pérez')).toBeChecked()
    expect(screen.getByLabelText('Eva Pérez')).toBeChecked()
    fireEvent.click(screen.getByLabelText('Eva Pérez'))

    fireEvent.change(screen.getByLabelText('Teléfono de la persona'), { target: { value: '0414 555 9876' } })
    fireEvent.click(screen.getByRole('button', { name: 'Buscar persona' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Sí, es esta persona' }))

    await waitFor(() => expect(onVinculado).toHaveBeenCalled())
    expect(rpc).toHaveBeenNthCalledWith(1, 'ninos_buscar_padre', { p_cedula: '', p_telefono: '0414 555 9876' })
    expect(rpc).toHaveBeenNthCalledWith(2, 'ninos_vincular_padre', { p_nino_ids: ['h1'], p_padre_id: 'p2', p_padre_nuevo: null })
  })

  it('creates a new person as the second parent', async () => {
    rpc.mockResolvedValueOnce({ data: { padre_id: 'p3', padre_nuevo: true, vinculados: 2 }, error: null })
    const onVinculado = jest.fn()
    render(<AgregarPadreForm familia={familia} onVinculado={onVinculado} onCancelar={jest.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Persona nueva' }))
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Juan' } })
    fireEvent.change(screen.getByLabelText('Apellido'), { target: { value: 'Pérez' } })
    fireEvent.change(screen.getByLabelText('Teléfono'), { target: { value: '04145559876' } })
    fireEvent.change(screen.getByLabelText('Género'), { target: { value: 'Masculino' } })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar a la familia' }))

    await waitFor(() => expect(onVinculado).toHaveBeenCalled())
    expect(rpc).toHaveBeenCalledWith('ninos_vincular_padre', {
      p_nino_ids: ['h1', 'h2'],
      p_padre_id: null,
      p_padre_nuevo: { nombre: 'Juan', apellido: 'Pérez', telefono: '04145559876', genero: 'Masculino', cedula: null, email: null },
    })
  })

  it('needs at least one child checked', async () => {
    render(<AgregarPadreForm familia={familia} onVinculado={jest.fn()} onCancelar={jest.fn()} />)
    fireEvent.click(screen.getByLabelText('Luis Pérez'))
    fireEvent.click(screen.getByLabelText('Eva Pérez'))
    fireEvent.click(screen.getByRole('button', { name: 'Persona nueva' }))
    fireEvent.click(screen.getByRole('button', { name: 'Agregar a la familia' }))
    expect(await screen.findByText('Elige al menos un niño.')).toBeInTheDocument()
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('EditarNinoForm — age range (N10)', () => {
  it('does not create a ficha for someone 13 or older', async () => {
    render(
      <EditarNinoForm
        hijo={{ ...familia.hijos[1], fecha_nacimiento: '2000-01-01' }}
        onGuardado={jest.fn()}
        onCancelar={jest.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Crear ficha' }))
    expect(await screen.findByText('Solo se registran en Niños los menores de 13 años con fecha de nacimiento.')).toBeInTheDocument()
    expect(rpc).not.toHaveBeenCalled()
  })
})
