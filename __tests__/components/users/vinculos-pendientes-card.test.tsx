/**
 * Vínculos pendientes on /users (S13; prototype 01-lista-escritorio.html,
 * `renderVinculos` / `openVinculos`): a brand notice with the count and
 * "Revisar", which opens a panel with the masked requests and their
 * Aprobar / Rechazar actions. Same behavior as before: nothing for a caller
 * without requests, a resolved request leaves the list, a failure keeps it
 * and says why.
 *
 * Familia (S15 decision 10): the notice counts both kinds and the panel gains
 * a «Familia» section with Aprobar / Aprobar y crear ficha / Rechazar.
 */
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { VinculosPendientesCard } from '@/components/users/vinculos-pendientes-card'

const listarVinculosPendientes = jest.fn()
const resolverVinculoPendiente = jest.fn()
const listarFamiliaPendientes = jest.fn()
const resolverFamiliaPendiente = jest.fn()

jest.mock('@/lib/actions/auth.actions', () => ({
  listarVinculosPendientes: (...a: unknown[]) => listarVinculosPendientes(...a),
  resolverVinculoPendiente: (...a: unknown[]) => resolverVinculoPendiente(...a),
}))

jest.mock('@/lib/actions/familia-pendientes.actions', () => ({
  listarFamiliaPendientes: (...a: unknown[]) => listarFamiliaPendientes(...a),
  resolverFamiliaPendiente: (...a: unknown[]) => resolverFamiliaPendiente(...a),
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
    listarFamiliaPendientes.mockReset()
    resolverFamiliaPendiente.mockReset()
    listarFamiliaPendientes.mockResolvedValue({ ok: true, solicitudes: [] })
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

const maria = { id: 'u1', nombre: 'María Fernanda', apellido: 'Colmenárez' }
const hermano = {
  id: 'f1', tipo: 'hermano', creadoEn: '2026-10-30T10:00:00Z', solicitante: maria,
  destino: { id: 'u2', nombre: 'Luis', apellido: 'Barrios', cuenta: true }, sinCuenta: null, creaFicha: false,
}
const padre = {
  id: 'f2', tipo: 'padre', creadoEn: '2026-10-31T10:00:00Z', solicitante: maria, destino: null, creaFicha: true,
  sinCuenta: { nombre: 'Rafael', apellido: 'Colmenárez', fechaNacimiento: '1958-03-12', genero: 'Masculino', cedula: 'V-4123456', telefono: null },
}

describe('VinculosPendientesCard · Familia', () => {
  beforeEach(() => {
    listarVinculosPendientes.mockReset()
    resolverVinculoPendiente.mockReset()
    listarFamiliaPendientes.mockReset()
    resolverFamiliaPendiente.mockReset()
    listarVinculosPendientes.mockResolvedValue({ ok: true, solicitudes: [] })
  })

  it('the notice counts both kinds', async () => {
    listarVinculosPendientes.mockResolvedValue({ ok: true, solicitudes: [solicitud] })
    listarFamiliaPendientes.mockResolvedValue({ ok: true, solicitudes: [hermano, padre] })
    render(<VinculosPendientesCard />)
    expect(await screen.findByText('1 cuenta por cédula · 2 de familia')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('vínculos pendientes')).toBeInTheDocument()
  })

  it('shows the notice with family requests only', async () => {
    listarFamiliaPendientes.mockResolvedValue({ ok: true, solicitudes: [hermano] })
    render(<VinculosPendientesCard />)
    expect(await screen.findByText('1 de familia')).toBeInTheDocument()
    expect(screen.getByText('vínculo pendiente')).toBeInTheDocument()
    expect(screen.queryByText('Se registraron con la cédula de una ficha con servicio.')).toBeNull()
  })

  it('"Revisar" lists the Familia section with the relation, the typed data and the actions', async () => {
    listarVinculosPendientes.mockResolvedValue({ ok: true, solicitudes: [solicitud] })
    listarFamiliaPendientes.mockResolvedValue({ ok: true, solicitudes: [hermano, padre] })
    render(<VinculosPendientesCard />)
    const panel = await revisar()
    const familia = within(panel).getByRole('region', { name: 'Familia' })
    expect(within(familia).getByText('María Fernanda Colmenárez dice que Luis Barrios es su hermano o hermana')).toBeInTheDocument()
    expect(within(familia).getByText('María Fernanda Colmenárez agregó a Rafael Colmenárez como su padre')).toBeInTheDocument()
    expect(within(familia).getByText('Sin cuenta · nació el 12 mar 1958 · cédula V-4123456')).toBeInTheDocument()
    expect(within(familia).getByRole('button', { name: 'Aprobar' })).toBeInTheDocument()
    expect(within(familia).getByRole('button', { name: 'Aprobar y crear ficha' })).toBeInTheDocument()
    expect(within(familia).getAllByRole('button', { name: 'Rechazar' })).toHaveLength(2)
    // The cédula requests keep their own section.
    expect(within(panel).getByRole('region', { name: 'Cuentas por cédula' })).toHaveTextContent('Z. Q.')
  })

  it('"Aprobar y crear ficha" resolves the request and removes it', async () => {
    listarFamiliaPendientes.mockResolvedValue({ ok: true, solicitudes: [padre] })
    resolverFamiliaPendiente.mockResolvedValue({ ok: true, codigo: 'APROBADA', fichaCreada: true })
    render(<VinculosPendientesCard />)
    const panel = await revisar()
    fireEvent.click(screen.getByRole('button', { name: 'Aprobar y crear ficha' }))
    await waitFor(() => expect(resolverFamiliaPendiente).toHaveBeenCalledWith('f2', true))
    await waitFor(() => expect(within(panel).queryByRole('listitem')).toBeNull())
    expect(screen.getByRole('status')).toHaveTextContent(
      'Aprobado: se creó la ficha de Rafael Colmenárez y ya está en la familia de María Fernanda Colmenárez.',
    )
    expect(screen.getByText('No quedan vínculos pendientes')).toBeInTheDocument()
  })

  it('rejects a family request', async () => {
    listarFamiliaPendientes.mockResolvedValue({ ok: true, solicitudes: [hermano] })
    resolverFamiliaPendiente.mockResolvedValue({ ok: true, codigo: 'RECHAZADA', fichaCreada: false })
    render(<VinculosPendientesCard />)
    await revisar()
    fireEvent.click(screen.getByRole('button', { name: 'Rechazar' }))
    await waitFor(() => expect(resolverFamiliaPendiente).toHaveBeenCalledWith('f1', false))
    expect(await screen.findByRole('status')).toHaveTextContent('Rechazado: la solicitud de María Fernanda Colmenárez.')
    expect(resolverVinculoPendiente).not.toHaveBeenCalled()
  })

  it('shows the error message and keeps the request', async () => {
    listarFamiliaPendientes.mockResolvedValue({ ok: true, solicitudes: [padre] })
    resolverFamiliaPendiente.mockResolvedValue({
      ok: false, codigo: 'CEDULA_EXISTENTE',
      mensaje: 'Ya existe una ficha con esa cédula, así que no se creó otra. Rechaza esta solicitud y revisa esa ficha.',
    })
    render(<VinculosPendientesCard />)
    await revisar()
    fireEvent.click(screen.getByRole('button', { name: 'Aprobar y crear ficha' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Ya existe una ficha con esa cédula')
    expect(screen.getByText('María Fernanda Colmenárez agregó a Rafael Colmenárez como su padre')).toBeInTheDocument()
  })

  it('a request already resolved leaves the list with its message', async () => {
    listarFamiliaPendientes.mockResolvedValue({ ok: true, solicitudes: [hermano] })
    resolverFamiliaPendiente.mockResolvedValue({ ok: false, codigo: 'YA_RESUELTO', mensaje: 'Esta solicitud ya se resolvió.' })
    render(<VinculosPendientesCard />)
    const panel = await revisar()
    fireEvent.click(screen.getByRole('button', { name: 'Aprobar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Esta solicitud ya se resolvió.')
    expect(within(panel).queryByRole('listitem')).toBeNull()
  })
})
