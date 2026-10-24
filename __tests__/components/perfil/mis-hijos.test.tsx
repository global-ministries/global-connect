import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { MisHijos } from '@/components/perfil/mis-hijos'
import { parseMisHijos } from '@/lib/platform/ninos/mis-hijos'

const rpc = jest.fn()
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({ rpc }) }))
jest.mock('@/lib/platform/ninos/fecha', () => ({
  ...jest.requireActual('@/lib/platform/ninos/fecha'),
  hoyEnCaracas: () => '2026-10-10',
}))

beforeEach(() => rpc.mockReset())

const luis = {
  id: 'h1', nombre: 'Luis', apellido: 'Pérez', fecha_nacimiento: '2021-05-05', genero: 'Masculino', edad: 5,
  tiene_ficha: true, grado: null, alergias: 'Maní', necesidades_especiales: null, habitos: null, notas: null,
  puede_comer: null, cambio_panal: null, autoriza_imagen: null, escolarizado: null,
  autorizados: [{ id: 'a1', nombre: 'Abuela Rosa', telefono: '04140000000', relacion: 'Abuela' }],
  otros_padres: [{ nombre: 'Juan', apellido: 'Pérez' }], puede_editar_identidad: true,
}
const eva = {
  ...luis, id: 'h2', nombre: 'Eva', fecha_nacimiento: '2014-02-02', edad: 12, alergias: null, autorizados: [],
  otros_padres: [], puede_editar_identidad: false,
}

describe('MisHijos', () => {
  it('shows one card per child with age, allergies and the other parents', () => {
    render(<MisHijos hijos={parseMisHijos([luis, eva])} />)
    expect(screen.getByRole('heading', { name: 'Mis hijos' })).toBeInTheDocument()
    const [tarjetaLuis, tarjetaEva] = screen.getAllByTestId('mi-hijo')
    expect(tarjetaLuis).toHaveTextContent('Luis Pérez')
    expect(tarjetaLuis).toHaveTextContent('5 años')
    expect(tarjetaLuis).toHaveTextContent('Alergias: Maní')
    expect(tarjetaLuis).toHaveTextContent('Otros representantes: Juan Pérez')
    expect(tarjetaEva).toHaveTextContent('12 años')
    expect(tarjetaEva).toHaveTextContent('Sin alergias registradas')
    expect(within(tarjetaEva).queryByText(/Otros representantes/)).not.toBeInTheDocument()
  })

  it('edits a child in parent mode and refreshes the list after saving', async () => {
    rpc
      .mockResolvedValueOnce({ data: { campos: ['alergias'] }, error: null })
      .mockResolvedValueOnce({ data: [{ ...luis, alergias: 'Maní y huevo' }, eva], error: null })
    render(<MisHijos hijos={parseMisHijos([luis, eva])} />)
    fireEvent.click(screen.getByRole('button', { name: 'Editar datos de Luis' }))

    expect(screen.queryByLabelText('Nivel')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Alergias'), { target: { value: 'Maní y huevo' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByText('Guardamos los datos de Luis.')).toBeInTheDocument()
    expect(rpc).toHaveBeenNthCalledWith(1, 'ninos_mis_hijos_guardar', {
      p_nino_id: 'h1',
      p: expect.objectContaining({ alergias: 'Maní y huevo', nombre: 'Luis' }),
    })
    expect(rpc.mock.calls[0][1].p).not.toHaveProperty('salon_preferido_id')
    expect(rpc).toHaveBeenNthCalledWith(2, 'ninos_mis_hijos')
    await waitFor(() => expect(screen.getAllByTestId('mi-hijo')[0]).toHaveTextContent('Alergias: Maní y huevo'))
  })

  it('says the data was saved but not refreshed when the reload fails, and retries', async () => {
    rpc
      .mockResolvedValueOnce({ data: { campos: ['alergias'] }, error: null })
      .mockResolvedValueOnce({ data: null, error: { code: '500', message: 'fetch failed' } })
      .mockResolvedValueOnce({ data: [{ ...luis, alergias: 'Maní y huevo' }], error: null })
    render(<MisHijos hijos={parseMisHijos([luis])} />)
    fireEvent.click(screen.getByRole('button', { name: 'Editar datos de Luis' }))
    fireEvent.change(screen.getByLabelText('Alergias'), { target: { value: 'Maní y huevo' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(
      await screen.findByText('Guardamos los datos de Luis, pero no pudimos actualizar la lista.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Guardamos los datos de Luis.')).not.toBeInTheDocument()
    expect(screen.getAllByTestId('mi-hijo')[0]).toHaveTextContent('Alergias: Maní')

    fireEvent.click(screen.getByRole('button', { name: 'Actualizar lista' }))
    await waitFor(() => expect(screen.getAllByTestId('mi-hijo')[0]).toHaveTextContent('Alergias: Maní y huevo'))
    expect(rpc).toHaveBeenNthCalledWith(3, 'ninos_mis_hijos')
    expect(screen.queryByRole('button', { name: 'Actualizar lista' })).not.toBeInTheDocument()
  })

  it('a child with an own account is edited without identity fields', () => {
    render(<MisHijos hijos={parseMisHijos([luis, eva])} />)
    fireEvent.click(screen.getByRole('button', { name: 'Editar datos de Eva' }))
    expect(screen.queryByLabelText('Nombre del niño 1')).not.toBeInTheDocument()
    expect(screen.getByText(/Eva tiene su propia cuenta/)).toBeInTheDocument()
  })

  it('shows the Spanish message of an RPC error and keeps the form open', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '22023', message: 'nino_no_encontrado' } })
    render(<MisHijos hijos={parseMisHijos([luis])} />)
    fireEvent.click(screen.getByRole('button', { name: 'Editar datos de Luis' }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No encontramos a este niño entre tus hijos. Recarga la página.')
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeInTheDocument()
  })

  it('tells a parent how to add a missing child', () => {
    render(<MisHijos hijos={parseMisHijos([luis])} />)
    expect(screen.getByText(/pide en la mesa de check-in de Niños/)).toBeInTheDocument()
  })
})
