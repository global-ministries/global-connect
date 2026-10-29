/**
 * Vínculos pendientes on /users (S13; prototype 01-lista-escritorio.html,
 * `renderVinculos` / `openVinculos`): a brand notice with the count and
 * "Revisar", which opens a panel with the masked requests and their
 * Aprobar / Rechazar actions. Same behavior as before: nothing for a caller
 * without requests, a resolved request leaves the list, a failure keeps it
 * and says why.
 */
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
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
const otra = { ...solicitud, id: 'v2', nombre_enmascarado: 'K. M.', cedula_enmascarada: '*****007' }

async function revisar() {
  fireEvent.click(await screen.findByRole('button', { name: 'Revisar' }))
  return screen.findByRole('dialog', { name: 'Vínculos pendientes' })
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

  it('a notice with the count and "Revisar"', async () => {
    listarVinculosPendientes.mockResolvedValue({ ok: true, solicitudes: [solicitud, otra] })
    render(<VinculosPendientesCard />)
    expect(await screen.findByText('vínculos pendientes')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('Se registraron con la cédula de una ficha con servicio.')).toBeInTheDocument()
    // The requests are in the panel, not on the page.
    expect(screen.queryByText(/Z\. Q\./)).toBeNull()
  })

  it('"Revisar" lists the masked requests with approve and reject buttons', async () => {
    listarVinculosPendientes.mockResolvedValue({ ok: true, solicitudes: [solicitud] })
    render(<VinculosPendientesCard />)
    await revisar()
    expect(screen.getByText(/Z\. Q\./)).toBeInTheDocument()
    expect(screen.getByText(/\*\*\*\*\*321/)).toBeInTheDocument()
    expect(screen.getByText(/Solicitado por zq@example\.com/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Aprobar/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Rechazar/ })).toBeInTheDocument()
  })

  it('approves a request and removes it from the list', async () => {
    listarVinculosPendientes.mockResolvedValue({ ok: true, solicitudes: [solicitud] })
    resolverVinculoPendiente.mockResolvedValue({ ok: true })
    render(<VinculosPendientesCard />)
    const panel = await revisar()
    fireEvent.click(screen.getByRole('button', { name: /Aprobar/ }))
    await waitFor(() => expect(resolverVinculoPendiente).toHaveBeenCalledWith('v1', true))
    await waitFor(() => expect(within(panel).queryByRole('listitem')).toBeNull())
    expect(screen.getByRole('status')).toHaveTextContent('Aprobado: Z. Q.')
    expect(screen.getByText('No quedan vínculos pendientes')).toBeInTheDocument()
  })

  it('rejects a request', async () => {
    listarVinculosPendientes.mockResolvedValue({ ok: true, solicitudes: [solicitud] })
    resolverVinculoPendiente.mockResolvedValue({ ok: true })
    render(<VinculosPendientesCard />)
    await revisar()
    fireEvent.click(screen.getByRole('button', { name: /Rechazar/ }))
    await waitFor(() => expect(resolverVinculoPendiente).toHaveBeenCalledWith('v1', false))
    expect(await screen.findByRole('status')).toHaveTextContent('Rechazado: Z. Q.')
  })

  it('shows a message when resolving fails and keeps the request', async () => {
    listarVinculosPendientes.mockResolvedValue({ ok: true, solicitudes: [solicitud] })
    resolverVinculoPendiente.mockResolvedValue({ ok: false, message: 'No se pudo resolver la solicitud.' })
    render(<VinculosPendientesCard />)
    await revisar()
    fireEvent.click(screen.getByRole('button', { name: /Aprobar/ }))
    expect(await screen.findByText('No se pudo resolver la solicitud.')).toBeInTheDocument()
    expect(screen.getByText(/Z\. Q\./)).toBeInTheDocument()
  })
})
