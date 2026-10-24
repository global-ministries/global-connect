import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { MisHijos } from '@/components/perfil/mis-hijos'
import { parseMisHijos } from '@/lib/platform/ninos/mis-hijos'

const rpc = jest.fn()
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({ rpc }) }))
jest.mock('@/lib/platform/ninos/fecha', () => ({
  ...jest.requireActual('@/lib/platform/ninos/fecha'),
  hoyEnCaracas: () => '2026-10-10',
}))

const fetchMock = jest.fn()
global.fetch = fetchMock as unknown as typeof fetch

beforeEach(() => {
  rpc.mockReset()
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ campos: ['alergias'] }) })
})

/** The JSON body of the n-th save sent to the route. */
const guardado = (n = 0) => JSON.parse(fetchMock.mock.calls[n][1].body) as { payload: Record<string, unknown> }

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
    rpc.mockResolvedValueOnce({ data: [{ ...luis, alergias: 'Maní y huevo' }, eva], error: null })
    render(<MisHijos hijos={parseMisHijos([luis, eva])} />)
    fireEvent.click(screen.getByRole('button', { name: 'Editar datos de Luis' }))

    expect(screen.queryByLabelText('Nivel')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Alergias'), { target: { value: 'Maní y huevo' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByText('Guardamos los datos de Luis.')).toBeInTheDocument()
    // Saved through the route (it emails the other parents when the pickup list changes).
    expect(fetchMock).toHaveBeenCalledWith('/api/ninos/mis-hijos/h1', expect.objectContaining({ method: 'POST' }))
    expect(guardado().payload).toEqual(expect.objectContaining({ alergias: 'Maní y huevo', nombre: 'Luis' }))
    expect(guardado().payload).not.toHaveProperty('salon_preferido_id')
    expect(rpc).not.toHaveBeenCalledWith('ninos_mis_hijos_guardar', expect.anything())
    expect(rpc).toHaveBeenNthCalledWith(1, 'ninos_mis_hijos')
    await waitFor(() => expect(screen.getAllByTestId('mi-hijo')[0]).toHaveTextContent('Alergias: Maní y huevo'))
  })

  it('says the data was saved but not refreshed when the reload fails, and retries', async () => {
    rpc
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
    expect(rpc).toHaveBeenNthCalledWith(2, 'ninos_mis_hijos')
    expect(screen.queryByRole('button', { name: 'Actualizar lista' })).not.toBeInTheDocument()
  })

  it('a child with an own account is edited without identity fields', () => {
    render(<MisHijos hijos={parseMisHijos([luis, eva])} />)
    fireEvent.click(screen.getByRole('button', { name: 'Editar datos de Eva' }))
    expect(screen.queryByLabelText('Nombre del niño 1')).not.toBeInTheDocument()
    expect(screen.getByText(/Eva tiene su propia cuenta/)).toBeInTheDocument()
  })

  it('shows the Spanish message of an RPC error and keeps the form open', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: async () => ({ error: { code: '22023', message: 'nino_no_encontrado' } }),
    })
    render(<MisHijos hijos={parseMisHijos([luis])} />)
    fireEvent.click(screen.getByRole('button', { name: 'Editar datos de Luis' }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No encontramos a este niño entre tus hijos. Recarga la página.')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(rpc).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeInTheDocument()
  })

  it('a network failure while saving keeps the form open with a retry message', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'))
    render(<MisHijos hijos={parseMisHijos([luis])} />)
    fireEvent.click(screen.getByRole('button', { name: 'Editar datos de Luis' }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo guardar. Intenta de nuevo.')
  })

  it('tells a parent how to add a missing child', () => {
    render(<MisHijos hijos={parseMisHijos([luis])} />)
    expect(screen.getByText(/pide en la mesa de check-in de Niños/)).toBeInTheDocument()
  })
})
