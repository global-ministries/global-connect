/**
 * «Sin cuenta» on the family at the desk (odd/tasks/ninos-checkin-pco.md,
 * T2k, S9.9): a parent without an account can be invited at any visit; the
 * email of the ficha comes written; nothing shows for a parent with an
 * account or when the database refuses.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { CuentaFamilia } from '@/components/ninos/checkin/cuenta-familia'

const rpc = jest.fn()
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({ rpc }) }))

const fetchMock = jest.fn()
global.fetch = fetchMock as unknown as typeof fetch

function cuenta(data: unknown, error: unknown = null) {
  rpc.mockReset()
  rpc.mockResolvedValue({ data, error })
}

beforeEach(() => fetchMock.mockReset())

describe('CuentaFamilia', () => {
  it('a parent without an account: «Sin cuenta» and the invitation with the written email', async () => {
    cuenta({ sin_cuenta: true, email_ficha: null, invitacion: null })
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, email: 'ana@example.test' }) })
    render(<CuentaFamilia padreId="p1" />)

    expect(await screen.findByText('Sin cuenta')).toBeInTheDocument()
    expect(rpc).toHaveBeenCalledWith('ninos_familia_cuenta', { p_padre_id: 'p1' })
    fireEvent.click(screen.getByRole('button', { name: 'Invitar a crear su cuenta' }))
    fireEvent.change(screen.getByLabelText('Correo del representante'), { target: { value: ' Ana@Example.test ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Invitar por correo' }))

    expect(await screen.findByText('Le enviamos la invitación a ana@example.test.')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/ninos/familia/p1/invitar')
    expect(JSON.parse(init.body)).toEqual({ email: 'ana@example.test' })
  })

  it('the email already on the ficha comes written, and a sent invitation is shown', async () => {
    cuenta({
      sin_cuenta: true,
      email_ficha: 'ana@example.test',
      invitacion: { estado: 'enviada', email: 'ana@example.test', created_at: '2026-11-08T10:00:00Z' },
    })
    render(<CuentaFamilia padreId="p1" />)
    expect(await screen.findByText('Invitación enviada a ana@example.test.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Invitar a crear su cuenta' }))
    expect(screen.getByLabelText('Correo del representante')).toHaveValue('ana@example.test')
  })

  it('the reason of a refusal is shown (e.g. the 10-minute wait)', async () => {
    cuenta({ sin_cuenta: true, email_ficha: 'ana@example.test', invitacion: null })
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: 'Ya le enviamos una invitación hace poco. Espera unos minutos para reenviarla.', codigo: 'invitacion_reciente' }),
    })
    render(<CuentaFamilia padreId="p1" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Invitar a crear su cuenta' }))
    fireEvent.click(screen.getByRole('button', { name: 'Invitar por correo' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Ya le enviamos una invitación hace poco. Espera unos minutos para reenviarla.')
  })

  it('nothing for a parent with an account', async () => {
    cuenta({ sin_cuenta: false })
    const { container } = render(<CuentaFamilia padreId="p1" />)
    await waitFor(() => expect(rpc).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('nothing when the database refuses (another campus)', async () => {
    cuenta(null, { code: '42501', message: 'sin_autoridad' })
    const { container } = render(<CuentaFamilia padreId="p1" />)
    await waitFor(() => expect(rpc).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByText('Sin cuenta')).not.toBeInTheDocument()
  })
})
