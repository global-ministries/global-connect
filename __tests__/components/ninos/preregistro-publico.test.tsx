/**
 * N8 — public pre-registration form (/ninos/registro).
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { PreregistroPublico } from '@/components/ninos/preregistro-publico'

const fetchMock = jest.fn()
beforeEach(() => {
  fetchMock.mockReset()
  global.fetch = fetchMock as unknown as typeof fetch
})

const campus = [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', nombre: 'Barquisimeto' }]

function llenar() {
  fireEvent.change(screen.getByLabelText('Tu nombre'), { target: { value: 'Ana' } })
  fireEvent.change(screen.getByLabelText('Tu apellido'), { target: { value: 'Pérez' } })
  fireEvent.change(screen.getByLabelText('Teléfono'), { target: { value: '04145551234' } })
  fireEvent.change(screen.getByLabelText('Nombre del niño 1'), { target: { value: 'Sofía' } })
  fireEvent.change(screen.getByLabelText('Apellido del niño 1'), { target: { value: 'Pérez' } })
  fireEvent.change(screen.getByLabelText('Fecha de nacimiento del niño 1'), { target: { value: '2021-03-04' } })
  fireEvent.change(screen.getByLabelText('Género del niño 1'), { target: { value: 'Femenino' } })
}

describe('PreregistroPublico', () => {
  it('sends the form and shows only the confirmation, no data back', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) })
    render(<PreregistroPublico campus={campus} />)
    llenar()
    fireEvent.click(screen.getByRole('button', { name: 'Enviar registro' }))

    expect(await screen.findByText('¡Listo! Acércate a la mesa de check-in y di tu nombre.')).toBeInTheDocument()
    expect(screen.queryByText('Sofía')).not.toBeInTheDocument()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/ninos/preregistro')
    const body = JSON.parse(init.body)
    expect(body).toMatchObject({ campusId: campus[0].id, padre: { nombre: 'Ana', telefono: '04145551234' }, sitioWeb: '' })
    expect(body.hijos[0]).toMatchObject({ nombre: 'Sofía', fechaNacimiento: '2021-03-04', genero: 'Femenino' })
  })

  it('validates on the client before sending', async () => {
    render(<PreregistroPublico campus={campus} />)
    fireEvent.click(screen.getByRole('button', { name: 'Enviar registro' }))
    expect(await screen.findByText('Escribe tu nombre.')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows the server message when rate limited', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429, json: async () => ({ errores: ['Espera unos minutos.'] }) })
    render(<PreregistroPublico campus={campus} />)
    llenar()
    fireEvent.click(screen.getByRole('button', { name: 'Enviar registro' }))
    expect(await screen.findByText('Espera unos minutos.')).toBeInTheDocument()
  })

  it('has a hidden honeypot field out of the tab order', () => {
    render(<PreregistroPublico campus={campus} />)
    const trampa = document.querySelector('input[name="sitioWeb"]') as HTMLInputElement
    expect(trampa).not.toBeNull()
    expect(trampa.tabIndex).toBe(-1)
    expect(trampa.closest('[aria-hidden="true"]')).not.toBeNull()
  })

  it('asks for the campus when there is more than one', async () => {
    render(<PreregistroPublico campus={[...campus, { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', nombre: 'Cabudare' }]} />)
    llenar()
    fireEvent.click(screen.getByRole('button', { name: 'Enviar registro' }))
    expect(await screen.findByText('Elige tu campus.')).toBeInTheDocument()
    await waitFor(() => expect(fetchMock).not.toHaveBeenCalled())
  })

  it('offers the optional level with the Waumba rooms of the chosen campus and sends it', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) })
    const sala = {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', campus_id: campus[0].id, nombre: 'Preescolar III', area: 'waumba' as const,
      edad_min_meses: 48, edad_max_meses: 59, grado_min: null, grado_max: null, es_necesidades_especiales: false, activo: true, orden: 40,
    }
    const otra = { ...sala, id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', campus_id: 'otro', nombre: 'Otro campus' }
    render(<PreregistroPublico campus={campus} salones={[sala, otra]} />)
    llenar()
    const nivel = screen.getByLabelText('Nivel (si lo sabes)')
    expect(nivel).toHaveTextContent('Preescolar III')
    expect(nivel).not.toHaveTextContent('Otro campus')
    fireEvent.change(nivel, { target: { value: `salon:${sala.id}` } })
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).hijos[0].salonPreferidoId).toBe(sala.id)
  })
})
