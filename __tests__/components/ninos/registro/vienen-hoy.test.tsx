/**
 * P4 (odd/tasks/ninos-precheck.md) — the optional "¿Vienen hoy?" step after
 * the public one-screen registration (N4b) sends the pre-registration.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { RegistroPublico } from '@/components/ninos/registro-rapido/registro-publico'

const fetchMock = jest.fn()
beforeEach(() => {
  fetchMock.mockReset()
  global.fetch = fetchMock as unknown as typeof fetch
})

const campus = [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', nombre: 'Campus Uno' }]
const PRE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const T9 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const T11 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const TOKEN = 'A'.repeat(43)

const escribir = (etiqueta: string, valor: string) => fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } })
const pulsar = (nombre: string | RegExp) => fireEvent.click(screen.getByRole('button', { name: nombre }))
const elegir = (grupo: string, opcion: string) =>
  fireEvent.click(within(screen.getByRole('group', { name: grupo })).getByRole('button', { name: opcion }))

function enviarRegistro() {
  escribir('Tu nombre', 'Ana')
  escribir('Tu apellido', 'Prueba')
  escribir('Teléfono', '04140000000')
  elegir('Eres mamá o papá', 'Mamá')
  escribir('Nombre del niño 1', 'Sol')
  escribir('Fecha de nacimiento del niño 1', '2021-03-04')
  elegir('Género del niño 1', 'Niña')
  elegir('¿Sol tiene alergias?', 'No')
  elegir('¿Sol tiene alguna condición médica o necesidad especial?', 'No')
  pulsar('Enviar registro')
}

const respuesta = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body })
const conServicios = respuesta(200, {
  ok: true,
  aviso: {
    id: PRE,
    token: TOKEN,
    servicios: [
      { turnoId: T9, nombre: 'Domingo 9:00', hora: '09:00:00' },
      { turnoId: T11, nombre: 'Domingo 11:00', hora: '11:00:00' },
    ],
  },
})

describe('¿Vienen hoy?', () => {
  it('offers today\'s services after sending and tells the table the chosen one', async () => {
    fetchMock.mockResolvedValueOnce(conServicios).mockResolvedValueOnce(respuesta(200, { ok: true }))
    render(<RegistroPublico campus={campus} />)
    enviarRegistro()

    expect(await screen.findByRole('heading', { name: '¿Vienen hoy?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Venimos a las 9:00' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Venimos a las 11:00' })).toBeInTheDocument()
    pulsar('Venimos a las 11:00')

    expect(await screen.findByText(/Le avisamos a la mesa que vienen a las/)).toHaveTextContent('Le avisamos a la mesa que vienen a las 11:00.')
    expect(screen.getByText(/Acércate a la mesa de Niños con Sol/)).toBeInTheDocument()
    const [url, init] = fetchMock.mock.calls[1]
    expect(url).toBe('/api/ninos/preregistro/aviso')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ id: PRE, token: TOKEN, turnoId: T11 })
  })

  it('can be skipped without telling the table anything', async () => {
    fetchMock.mockResolvedValueOnce(conServicios)
    render(<RegistroPublico campus={campus} />)
    enviarRegistro()
    await screen.findByRole('heading', { name: '¿Vienen hoy?' })
    pulsar('No, otro día')

    expect(await screen.findByText(/Acércate a la mesa de Niños con Sol/)).toBeInTheDocument()
    expect(screen.queryByText(/Le avisamos a la mesa/)).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('is not shown when no service of today is open', async () => {
    fetchMock.mockResolvedValueOnce(respuesta(200, { ok: true }))
    render(<RegistroPublico campus={campus} />)
    enviarRegistro()
    expect(await screen.findByText(/Acércate a la mesa de Niños con Sol/)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '¿Vienen hoy?' })).not.toBeInTheDocument()
  })

  it('shows the server message and still lets the family go on', async () => {
    fetchMock
      .mockResolvedValueOnce(conServicios)
      .mockResolvedValueOnce(respuesta(409, { errores: ['Este servicio ya no recibe avisos. Avísale a la mesa al llegar.'] }))
    render(<RegistroPublico campus={campus} />)
    enviarRegistro()
    await screen.findByRole('heading', { name: '¿Vienen hoy?' })
    pulsar('Venimos a las 9:00')

    expect(await screen.findByRole('alert')).toHaveTextContent('Este servicio ya no recibe avisos. Avísale a la mesa al llegar.')
    pulsar('No, otro día')
    await screen.findByText(/Acércate a la mesa de Niños con Sol/)
  })

  it('a network failure keeps the choice open', async () => {
    fetchMock.mockResolvedValueOnce(conServicios).mockRejectedValueOnce(new Error('offline'))
    render(<RegistroPublico campus={campus} />)
    enviarRegistro()
    await screen.findByRole('heading', { name: '¿Vienen hoy?' })
    pulsar('Venimos a las 9:00')
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos avisar a la mesa. Revisa tu conexión e intenta de nuevo.')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Venimos a las 9:00' })).toBeEnabled())
  })
})
