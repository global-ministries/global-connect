import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { EditarFichaPanel } from '@/components/dream-team/servidores/editar-ficha-panel'

const ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const FICHA = {
  id: ID, nombre: 'Ana', apellido: 'Pérez', fechaNacimiento: null, cedula: null,
  genero: 'Femenino', estadoCivil: 'No especificado', telefono: '04141234567', redesSociales: null,
}

function respuesta(status: number, cuerpo: unknown) {
  return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(cuerpo) } as Response)
}

const fetchMock = jest.fn()
const toast = { success: jest.fn(), error: jest.fn() }

beforeEach(() => {
  fetchMock.mockReset()
  toast.success.mockReset()
  toast.error.mockReset()
  global.fetch = fetchMock as unknown as typeof fetch
})

function abrir() {
  const onGuardado = jest.fn()
  const onAbiertoChange = jest.fn()
  render(
    <EditarFichaPanel personaId={ID} nombre="Ana Pérez" abierto onAbiertoChange={onAbiertoChange} onGuardado={onGuardado} toast={toast as never} />,
  )
  return { onGuardado, onAbiertoChange }
}

describe('EditarFichaPanel', () => {
  it('loads the ficha and prefills it, with hints for the gaps', async () => {
    fetchMock.mockReturnValueOnce(respuesta(200, { ficha: FICHA }))
    abrir()
    expect(screen.getByRole('dialog', { name: 'Editar ficha' })).toBeInTheDocument()
    expect(await screen.findByLabelText('Teléfono')).toHaveValue('04141234567')
    expect(screen.getByLabelText('Estado civil')).toHaveValue('No especificado')
    expect(screen.getByText('Sin fecha de nacimiento registrada.')).toBeInTheDocument()
    expect(screen.getByText('Estado civil sin especificar.')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(`/api/dream-team/personas/${ID}/ficha`, expect.objectContaining({ cache: 'no-store' }))
  })

  it('sends only the changed fields and reports success', async () => {
    fetchMock.mockReturnValueOnce(respuesta(200, { ficha: FICHA }))
    const { onGuardado, onAbiertoChange } = abrir()
    await userEvent.type(await screen.findByLabelText('Cédula'), '20111222')
    fetchMock.mockReturnValueOnce(respuesta(200, { ficha: { ...FICHA, cedula: '20111222' } }))
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(onGuardado).toHaveBeenCalled())
    const [url, init] = fetchMock.mock.calls[1]
    expect(url).toBe(`/api/dream-team/personas/${ID}/ficha`)
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body)).toEqual({ cedula: '20111222' })
    expect(toast.success).toHaveBeenCalledWith('Ficha actualizada.')
    expect(onAbiertoChange).toHaveBeenCalledWith(false)
  })

  it('shows the API error in the panel and keeps it open', async () => {
    fetchMock.mockReturnValueOnce(respuesta(200, { ficha: FICHA }))
    const { onGuardado } = abrir()
    await userEvent.type(await screen.findByLabelText('Cédula'), '12345678')
    fetchMock.mockReturnValueOnce(respuesta(409, { error: 'Esa cédula ya pertenece a otra persona' }))
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Esa cédula ya pertenece a otra persona')
    expect(onGuardado).not.toHaveBeenCalled()
  })

  it('validates a future birth date before calling the API', async () => {
    fetchMock.mockReturnValueOnce(respuesta(200, { ficha: FICHA }))
    abrir()
    const fecha = await screen.findByLabelText('Fecha de nacimiento')
    await userEvent.type(fecha, '2999-01-01')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('La fecha de nacimiento no puede ser futura')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('without changes, Guardar is disabled', async () => {
    fetchMock.mockReturnValueOnce(respuesta(200, { ficha: FICHA }))
    abrir()
    await screen.findByLabelText('Teléfono')
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled()
  })

  it('reports a load failure', async () => {
    fetchMock.mockReturnValueOnce(respuesta(403, { error: 'Permiso denegado' }))
    abrir()
    expect(await screen.findByRole('alert')).toHaveTextContent('Permiso denegado')
  })
})
