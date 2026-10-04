import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { VinculosPendientesCard } from '@/components/users/vinculos-pendientes-card'

const listarVinculosPendientes = jest.fn()
const resolverVinculoPendiente = jest.fn()

jest.mock('@/lib/actions/auth.actions', () => ({
  listarVinculosPendientes: (...a: unknown[]) => listarVinculosPendientes(...a),
  resolverVinculoPendiente: (...a: unknown[]) => resolverVinculoPendiente(...a),
}))

const solicitud = {
  id: 'v1',
  ficha_id: 'f1',
  nombre_enmascarado: 'Z. Q.',
  cedula_enmascarada: '*****321',
  correo_solicitante: 'zq@example.com',
  creado_en: '2026-10-04T10:00:00Z',
}

describe('VinculosPendientesCard', () => {
  beforeEach(() => {
    listarVinculosPendientes.mockReset()
    resolverVinculoPendiente.mockReset()
  })

  it('renders nothing when the caller has no requests to resolve', async () => {
    listarVinculosPendientes.mockResolvedValue({ ok: true, solicitudes: [] })
    const { container } = render(<VinculosPendientesCard />)
    await waitFor(() => expect(listarVinculosPendientes).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('lists the masked requests with approve and reject buttons', async () => {
    listarVinculosPendientes.mockResolvedValue({ ok: true, solicitudes: [solicitud] })
    render(<VinculosPendientesCard />)
    expect(await screen.findByText('Vínculos pendientes')).toBeInTheDocument()
    expect(screen.getByText(/Z\. Q\./)).toBeInTheDocument()
    expect(screen.getByText(/\*\*\*\*\*321/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Aprobar/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Rechazar/ })).toBeInTheDocument()
  })

  it('approves a request and removes it from the list', async () => {
    listarVinculosPendientes.mockResolvedValue({ ok: true, solicitudes: [solicitud] })
    resolverVinculoPendiente.mockResolvedValue({ ok: true })
    render(<VinculosPendientesCard />)
    fireEvent.click(await screen.findByRole('button', { name: /Aprobar/ }))
    await waitFor(() => expect(resolverVinculoPendiente).toHaveBeenCalledWith('v1', true))
    await waitFor(() => expect(screen.queryByText(/Z\. Q\./)).not.toBeInTheDocument())
  })

  it('rejects a request', async () => {
    listarVinculosPendientes.mockResolvedValue({ ok: true, solicitudes: [solicitud] })
    resolverVinculoPendiente.mockResolvedValue({ ok: true })
    render(<VinculosPendientesCard />)
    fireEvent.click(await screen.findByRole('button', { name: /Rechazar/ }))
    await waitFor(() => expect(resolverVinculoPendiente).toHaveBeenCalledWith('v1', false))
  })

  it('shows a message when resolving fails and keeps the request', async () => {
    listarVinculosPendientes.mockResolvedValue({ ok: true, solicitudes: [solicitud] })
    resolverVinculoPendiente.mockResolvedValue({ ok: false, message: 'No se pudo resolver la solicitud.' })
    render(<VinculosPendientesCard />)
    fireEvent.click(await screen.findByRole('button', { name: /Aprobar/ }))
    expect(await screen.findByText('No se pudo resolver la solicitud.')).toBeInTheDocument()
    expect(screen.getByText(/Z\. Q\./)).toBeInTheDocument()
  })
})
