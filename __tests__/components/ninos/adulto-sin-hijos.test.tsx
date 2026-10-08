import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { FamiliasClient } from '@/components/ninos/familias-client'
import { VincularHijoForm } from '@/components/ninos/vincular-hijo-form'

const rpc = jest.fn()
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({ rpc }) }))
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn() }) }))
jest.mock('@/components/ninos/preregistros-pendientes', () => ({ PreregistrosPendientes: () => null }))

beforeEach(() => rpc.mockReset())

const adulto = {
  id: 'a1', nombre: 'Adela', apellido: 'Ruiz', telefono: '•••0951', cedula: '•••0951', hijos: [],
  padres: [{ id: 'a1', nombre: 'Adela', apellido: 'Ruiz', telefono: '•••0951' }], sin_hijos: true,
}

async function buscarAdulto() {
  rpc.mockResolvedValueOnce({ data: [adulto], error: null })
  render(<FamiliasClient salones={[]} fechaServicio="2026-10-11" />)
  fireEvent.change(screen.getByLabelText('Buscar familia'), { target: { value: 'V-99990951' } })
  fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))
  return screen.findByTestId('adulto-sin-hijos')
}

describe('Familias: an adult without children (N11)', () => {
  it('shows the masked card instead of "No se encontraron familias"', async () => {
    const tarjeta = await buscarAdulto()
    expect(within(tarjeta).getByText('Adela Ruiz')).toBeInTheDocument()
    expect(within(tarjeta).getByText(/•••0951/)).toBeInTheDocument()
    expect(within(tarjeta).getByText('Aún no tiene niños registrados')).toBeInTheDocument()
    expect(screen.queryByText('No se encontraron familias.')).not.toBeInTheDocument()
  })

  it('"Agregar niño" opens the add-child form with the person preselected', async () => {
    const tarjeta = await buscarAdulto()
    fireEvent.click(within(tarjeta).getByRole('button', { name: 'Agregar niño' }))
    expect(screen.getByText('Adela Ruiz')).toBeInTheDocument()
    expect(screen.queryByLabelText('Nombre del representante')).not.toBeInTheDocument()
  })

  it('"Vincular hijo existente" opens the link panel', async () => {
    const tarjeta = await buscarAdulto()
    fireEvent.click(within(tarjeta).getByRole('button', { name: 'Vincular hijo existente' }))
    expect(await screen.findByLabelText('Nombre o cédula del niño')).toBeInTheDocument()
  })
})

describe('VincularHijoForm', () => {
  it('finds a child (with or without family) and links it to the adult with ninos_vincular_padre', async () => {
    rpc
      .mockResolvedValueOnce({ data: [{ id: 'h1', nombre: 'Cami', apellido: 'Ruiz', edad_anos: 8, cedula: '•••5504' }], error: null })
      .mockResolvedValueOnce({ data: { vinculados: 1 }, error: null })
    const onVinculado = jest.fn()
    render(<VincularHijoForm adulto={{ id: 'a1', nombre: 'Adela Ruiz' }} onVinculado={onVinculado} onCancelar={jest.fn()} />)
    fireEvent.change(screen.getByLabelText('Nombre o cédula del niño'), { target: { value: 'Cami Ruiz' } })
    fireEvent.click(screen.getByRole('button', { name: 'Buscar niño' }))
    expect(await screen.findByText('8 años · C.I. •••5504')).toBeInTheDocument()
    expect(rpc).toHaveBeenCalledWith('ninos_buscar_hijos_vincular', { p_q: 'Cami Ruiz', p_padre_id: 'a1' })
    fireEvent.click(screen.getByRole('button', { name: 'Vincular a Cami Ruiz' }))
    await waitFor(() => expect(onVinculado).toHaveBeenCalled())
    expect(rpc).toHaveBeenLastCalledWith('ninos_vincular_padre', { p_nino_ids: ['h1'], p_padre_id: 'a1', p_padre_nuevo: null })
  })

  it('asks for more than two characters before searching', () => {
    render(<VincularHijoForm adulto={{ id: 'a1', nombre: 'Adela Ruiz' }} onVinculado={jest.fn()} onCancelar={jest.fn()} />)
    fireEvent.change(screen.getByLabelText('Nombre o cédula del niño'), { target: { value: 'Ca' } })
    fireEvent.click(screen.getByRole('button', { name: 'Buscar niño' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Escribe el nombre y el apellido del niño, o su cédula.')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('says so when no child is found', async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null })
    render(<VincularHijoForm adulto={{ id: 'a1', nombre: 'Adela Ruiz' }} onVinculado={jest.fn()} onCancelar={jest.fn()} />)
    fireEvent.change(screen.getByLabelText('Nombre o cédula del niño'), { target: { value: 'Nadie' } })
    fireEvent.click(screen.getByRole('button', { name: 'Buscar niño' }))
    expect(await screen.findByText('No se encontraron niños.')).toBeInTheDocument()
  })
})
