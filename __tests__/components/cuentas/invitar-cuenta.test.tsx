import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))

import { MenuServidor } from '@/components/dream-team/servidores/menu-servidor'
import { InvitarCuentaBoton } from '@/components/cuentas/invitar-cuenta-panel'
import type { FilaServidor } from '@/lib/platform/dream-team/servidores-vista'

const ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const FILA: FilaServidor = {
  clave: 's-1',
  personaId: ID as FilaServidor['personaId'],
  nombre: 'Ana Pérez',
  equipoId: 'e-1',
  equipoLabel: 'Bebés',
  equipoRuta: 'Waumba Land',
  direccionId: 'd-1',
  rolLabel: 'Voluntario',
  estado: 'activo',
  fechaInicio: null,
  telefono: null,
  tieneCuenta: false,
  origen: 'dream_team',
  servicioId: 's-1',
  version: 1,
  editable: false,
  fichaEditable: true,
}

type Respuesta = { status: number; body: unknown }
function mockFetch(get: Respuesta, post?: Respuesta | Respuesta[]) {
  const posts = Array.isArray(post) ? [...post] : post ? [post] : []
  const fn = jest.fn((_url: string, init?: RequestInit) => {
    const r = init?.method === 'POST' ? (posts.shift() ?? { status: 500, body: {} }) : get
    return Promise.resolve({ ok: r.status < 300, status: r.status, json: () => Promise.resolve(r.body) })
  })
  global.fetch = fn as unknown as typeof fetch
  return fn
}

const SIN_CUENTA = { status: 200, body: { estado: { sinCuenta: true, emailFicha: null, invitacion: null } } }

describe('MenuServidor — Invitar a la plataforma (T12)', () => {
  it('offers the invitation when the viewer may fix the ficha and the person has no account', async () => {
    mockFetch(SIN_CUENTA)
    render(<MenuServidor fila={FILA} onActualizado={jest.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Acciones para Ana Pérez' }))
    expect(await screen.findByRole('menuitem', { name: 'Invitar a la plataforma' })).toBeInTheDocument()
  })

  it('does not offer it when the person already has an account', async () => {
    mockFetch(SIN_CUENTA)
    render(<MenuServidor fila={{ ...FILA, tieneCuenta: true }} onActualizado={jest.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Acciones para Ana Pérez' }))
    await screen.findByRole('menuitem', { name: 'Editar ficha' })
    expect(screen.queryByRole('menuitem', { name: 'Invitar a la plataforma' })).not.toBeInTheDocument()
  })

  it('does not offer it without the ficha permission', async () => {
    mockFetch(SIN_CUENTA)
    render(<MenuServidor fila={{ ...FILA, editable: true, fichaEditable: false }} onActualizado={jest.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Acciones para Ana Pérez' }))
    await screen.findByRole('menuitem', { name: 'Cambiar etapa' })
    expect(screen.queryByRole('menuitem', { name: 'Invitar a la plataforma' })).not.toBeInTheDocument()
  })

  it('sends the invitation from the panel', async () => {
    const fetch = mockFetch(SIN_CUENTA, { status: 200, body: { ok: true, email: 'ana@example.test' } })
    render(<MenuServidor fila={FILA} onActualizado={jest.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Acciones para Ana Pérez' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Invitar a la plataforma' }))
    await userEvent.type(await screen.findByLabelText('Correo'), 'ana@example.test')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar invitación' }))
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        `/api/users/${ID}/invitacion-cuenta`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ email: 'ana@example.test', reemplazarEmail: false }),
        }),
      ),
    )
  })

  it('asks to confirm when the ficha holds another email, then resends with the flag', async () => {
    const fetch = mockFetch(
      { status: 200, body: { estado: { sinCuenta: true, emailFicha: 'vieja@example.test', invitacion: null } } },
      [
        { status: 409, body: { error: 'La ficha tiene otro correo.', codigo: 'email_distinto' } },
        { status: 200, body: { ok: true, email: 'nueva@example.test' } },
      ],
    )
    render(<MenuServidor fila={FILA} onActualizado={jest.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Acciones para Ana Pérez' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Invitar a la plataforma' }))
    const correo = await screen.findByLabelText('Correo')
    await waitFor(() => expect(correo).toHaveValue('vieja@example.test'))
    await userEvent.clear(correo)
    await userEvent.type(correo, 'nueva@example.test')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar invitación' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('La ficha tiene otro correo.')
    expect(screen.getByRole('checkbox')).toBeChecked()
    await userEvent.click(screen.getByRole('button', { name: 'Enviar invitación' }))
    await waitFor(() =>
      expect(fetch).toHaveBeenLastCalledWith(
        `/api/users/${ID}/invitacion-cuenta`,
        expect.objectContaining({ body: JSON.stringify({ email: 'nueva@example.test', reemplazarEmail: true }) }),
      ),
    )
  })
})

describe('InvitarCuentaBoton (user detail page)', () => {
  it('shows "Invitar a la plataforma" for a person without account', async () => {
    mockFetch(SIN_CUENTA)
    render(<InvitarCuentaBoton personaId={ID} nombre="Ana" />)
    expect(await screen.findByRole('button', { name: 'Invitar a la plataforma' })).toBeInTheDocument()
  })

  it('shows "Reenviar invitación" and the date when one was sent', async () => {
    mockFetch({
      status: 200,
      body: {
        estado: {
          sinCuenta: true,
          emailFicha: 'ana@example.test',
          invitacion: { estado: 'enviada', email: 'ana@example.test', enviadaEl: '2026-10-08T15:00:00Z' },
        },
      },
    })
    render(<InvitarCuentaBoton personaId={ID} nombre="Ana" />)
    await userEvent.click(await screen.findByRole('button', { name: 'Reenviar invitación' }))
    expect(await screen.findByText(/Invitación enviada el .*ana@example\.test/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reenviar' })).toBeInTheDocument()
  })

  it('renders nothing when the viewer may not invite (404)', async () => {
    const fetch = mockFetch({ status: 404, body: { error: 'Persona no encontrada' } })
    const { container } = render(<InvitarCuentaBoton personaId={ID} nombre="Ana" />)
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when the person already has an account', async () => {
    const fetch = mockFetch({ status: 200, body: { estado: { sinCuenta: false, emailFicha: null, invitacion: null } } })
    const { container } = render(<InvitarCuentaBoton personaId={ID} nombre="Ana" />)
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })
})
