/**
 * N8 — "Pre-registros pendientes" at the table: review, confirm (with the
 * confirm-existing-parent rule) or discard.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { PreregistrosPendientes } from '@/components/ninos/preregistros-pendientes'

const rpc = jest.fn()
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({ rpc }) }))

const fetchMock = jest.fn()
global.fetch = fetchMock as unknown as typeof fetch

const pendiente = {
  id: 'pr1',
  campus_id: 'c1',
  created_at: '2026-10-11T12:50:00Z',
  payload: {
    padre: { nombre: 'Ana', apellido: 'Pérez', telefono: '04145551234', email: 'ana@example.test', cedula: null, genero: null },
    hijos: [{ nombre: 'Sofía', apellido: 'Pérez', fecha_nacimiento: '2021-03-04', genero: 'Femenino', grado: null }],
    autorizados: [],
  },
}

function responder(coincidencias: unknown[] = []) {
  rpc.mockImplementation((nombre: string) => {
    if (nombre === 'ninos_preregistros_pendientes') return Promise.resolve({ data: [pendiente], error: null })
    if (nombre === 'ninos_buscar_padre') return Promise.resolve({ data: coincidencias, error: null })
    return Promise.resolve({ data: null, error: null })
  })
}

beforeEach(() => {
  rpc.mockReset()
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, padreId: 'p1', correo: 'programado', invitacion: 'enviada' }) })
})

describe('PreregistrosPendientes', () => {
  it('lists the pending ones and renders nothing when there are none', async () => {
    rpc.mockResolvedValue({ data: [], error: null })
    const { container } = render(<PreregistrosPendientes onConfirmado={jest.fn()} />)
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('ninos_preregistros_pendientes'))
    expect(container).toBeEmptyDOMElement()
  })

  it('reviews, requires the parent gender and confirms with the edited payload', async () => {
    responder()
    const onConfirmado = jest.fn()
    render(<PreregistrosPendientes onConfirmado={onConfirmado} />)
    fireEvent.click(await screen.findByRole('button', { name: /Ana Pérez/ }))
    expect(screen.getByLabelText('Correo del representante')).toHaveValue('ana@example.test')

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar familia' }))
    expect(await screen.findByText('El género del representante es obligatorio.')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Género del representante'), { target: { value: 'Femenino' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar familia' }))
    await waitFor(() => expect(onConfirmado).toHaveBeenCalledWith('p1', 'Sofía Pérez'))
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/ninos/preregistro/pr1')
    expect(JSON.parse(init.body)).toMatchObject({
      accion: 'confirmar',
      email: 'ana@example.test',
      payload: { padre: { nombre: 'Ana', genero: 'Femenino' }, hijos: [{ nombre: 'Sofía' }] },
    })
  })

  it('an existing parent must be chosen explicitly before confirming', async () => {
    responder([{ id: 'px', nombre: 'Ana', apellido: 'Pérez', telefono: '•••1234', cedula: null, coincide_por: 'telefono' }])
    render(<PreregistrosPendientes onConfirmado={jest.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: /Ana Pérez/ }))
    fireEvent.change(screen.getByLabelText('Género del representante'), { target: { value: 'Femenino' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar familia' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Sí, es esta persona' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).payload.padre).toEqual({ id: 'px' })
  })

  it('discards', async () => {
    responder()
    render(<PreregistrosPendientes onConfirmado={jest.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: /Ana Pérez/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }))
    await waitFor(() => expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ accion: 'descartar' }))
  })
})
