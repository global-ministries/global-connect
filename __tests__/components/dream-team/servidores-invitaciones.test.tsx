/**
 * `<ServidoresClient>` — invitations to register (T4 of
 * odd/tasks/invitaciones-pendientes.md, S2/S3/S7; artboards
 * design/invitaciones/05-mezcla-escritorio.html and 06-mezcla-celular.html).
 *
 * Under the "Sin cuenta" metric: the account-state pills, the state line of
 * each row, the "Invitación vencida" banner with the bulk resend, the
 * multi-select of expired invitations with its bar, and the drawer actions
 * (Reenviar, Cancelar). Every request is a mocked `fetch`; the toasts are a
 * mocked `useNotificaciones`.
 *
 * `ListaResponsiva` renders the desktop cells and the phone cell of every row
 * (CSS swaps them), so a row's checkbox and texts appear twice in jsdom.
 */
import React from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ServidoresClient, type ServidoresClientProps } from '@/components/dream-team/servidores/servidores-client'
import { FILTROS_INICIALES, type FilaServidor, type FiltrosServidores } from '@/lib/platform/dream-team/servidores-vista'
import type { ResumenInvitacion } from '@/lib/platform/cuentas/invitaciones-pendientes'
import { ID_DHAH, ID_MDH, arbolServidores, fila } from '@/tests/helpers/servidores-conexion'

const replace = jest.fn()
const refresh = jest.fn()
const toast = { success: jest.fn(), error: jest.fn(), info: jest.fn() }

jest.mock('@/hooks/useCampus', () => ({ useCampus: () => ({ campusId: null }) }))
jest.mock('@/hooks/use-notificaciones', () => ({ useNotificaciones: () => toast }))
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, refresh, push: jest.fn() }),
  usePathname: () => '/admin/dream-team/servidores',
}))
jest.mock('@/components/ui/desktop-header', () => ({
  DesktopHeader: ({ breadcrumbs, accionPrincipal }: { breadcrumbs?: React.ReactNode; accionPrincipal?: React.ReactNode }) => (
    <header>
      {breadcrumbs}
      {accionPrincipal}
    </header>
  ),
}))

jest.setTimeout(15_000)

let user: ReturnType<typeof userEvent.setup>
let fetchMock: jest.Mock

const DIA = 24 * 60 * 60 * 1000
const HORA = 60 * 60 * 1000
const haceMs = (ms: number) => new Date(Date.now() - ms).toISOString()
const fechaCorta = (iso: string) => new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short' })

function invitacion(estado: ResumenInvitacion['estado'], enviadaHaceMs: number, invitadoPor: string, extra: Partial<ResumenInvitacion> = {}): ResumenInvitacion {
  const enviadaEl = haceMs(enviadaHaceMs)
  return {
    usuarioId: 'x',
    estado,
    email: 'persona@correo.com',
    enviadaEl,
    aceptadaEl: null,
    invitadoPor,
    envios: 1,
    historial: [{ estado: estado === 'registrada' ? 'aceptada' : 'enviada', email: 'persona@correo.com', fecha: enviadaEl, invitadoPor }],
    ...extra,
  }
}

const ACEPTADA_EL = haceMs(5 * DIA)
const INVITA = { editable: false, fichaEditable: true }

/** Two invitable vencidas, one vencida the viewer may not invite, one enviada, one never invited, one registered. */
const FILAS: readonly FilaServidor[] = [
  fila('1', 'Fernando Ramos', ID_DHAH, 'Facilitador', {
    ...INVITA,
    tieneCuenta: false,
    invitacion: invitacion('vencida', 24 * DIA, 'Edmir Muñoz', { email: 'fernando.ramos@gmail.com' }),
  }),
  fila('2', 'Blanca Rojas', ID_MDH, 'Facilitadora', {
    ...INVITA,
    tieneCuenta: false,
    invitacion: invitacion('vencida', 20 * DIA, 'Edith Pérez', { envios: 2 }),
  }),
  fila('3', 'Rafael Escalona', ID_DHAH, 'Facilitador', {
    editable: false,
    fichaEditable: false,
    tieneCuenta: false,
    invitacion: invitacion('vencida', 15 * DIA, 'Jose Jimenez'),
  }),
  fila('4', 'Wito González', ID_DHAH, 'Facilitador', {
    ...INVITA,
    tieneCuenta: false,
    invitacion: invitacion('enviada', 2 * HORA + 60_000, 'Antholy Ludovic Gómez'),
  }),
  fila('5', 'Mariela Torres', ID_MDH, 'Facilitadora', { ...INVITA, tieneCuenta: false, invitacion: null }),
  fila('6', 'Edmir Muñoz', ID_DHAH, 'Coordinador', {
    ...INVITA,
    tieneCuenta: true,
    invitacion: invitacion('registrada', 6 * DIA, 'Antholy Ludovic Gómez', { aceptadaEl: ACEPTADA_EL }),
  }),
]

const ID = (nombre: string) => `persona-${nombre}`

beforeEach(() => {
  replace.mockClear()
  refresh.mockClear()
  toast.success.mockClear()
  toast.error.mockClear()
  user = userEvent.setup({ delay: null })
  fetchMock = jest.fn(async () => ({ ok: true, json: async () => ({ ok: true }) }))
  global.fetch = fetchMock as unknown as typeof fetch
})

function props(filtros: Partial<FiltrosServidores> = {}, filas: readonly FilaServidor[] = FILAS): ServidoresClientProps {
  return {
    filas,
    arbol: arbolServidores,
    rolesPorEquipo: {},
    puedeEditar: false,
    filtrosIniciales: { ...FILTROS_INICIALES, ...filtros },
  }
}

const lista = () => screen.getByRole('table', { name: /^(Servidores|Servicios)$/, hidden: true })
const filaDe = (nombre: string) =>
  within(within(lista()).getByRole('button', { name: `Abrir ${nombre}`, hidden: true }).closest('[role="row"]') as HTMLElement)
const pastillas = () => within(screen.getByRole('group', { name: 'Estado de la invitación a registrarse' }))
const metrica = (etiqueta: string) =>
  within(screen.getByRole('group', { name: 'Necesitan atención', hidden: true })).getByRole('button', {
    name: (nombre) => nombre.startsWith(etiqueta),
  })
const casillas = (nombre: string) => screen.queryAllByRole('checkbox', { name: `Seleccionar ${nombre}` })
const barra = () => within(screen.getByRole('region', { name: 'Acciones de la selección' }))

describe('Servidores — account-state pills (S3)', () => {
  it('show under the "Sin cuenta" metric with their counts, and not before', async () => {
    render(<ServidoresClient {...props()} />)
    expect(screen.queryByRole('group', { name: 'Estado de la invitación a registrarse' })).not.toBeInTheDocument()

    await user.click(metrica('Sin cuenta'))
    expect(screen.getByText('Cuenta en la plataforma')).toBeInTheDocument()
    expect(screen.getByText('Invitaciones para registrarse en Global Connect')).toBeInTheDocument()
    expect(pastillas().getAllByRole('button').map((b) => [b.textContent, b.getAttribute('aria-pressed')])).toEqual([
      ['Sin cuenta5', 'true'],
      ['Invitación vencida3', 'false'],
      ['Invitación enviada1', 'false'],
      ['Sin invitar1', 'false'],
      ['Se registraron (30 días)1', 'false'],
    ])
  })

  it('a pill applies its filter through the URL and stays pressed; the metric stays pressed too', async () => {
    render(<ServidoresClient {...props({ sinCuenta: true })} />)
    const urlFiltros = jest.spyOn(window.history, 'replaceState').mockImplementation(() => undefined)
    await user.click(pastillas().getByRole('button', { name: 'Invitación vencida 3' }))
    expect(urlFiltros).toHaveBeenLastCalledWith(null, '', '/admin/dream-team/servidores?invitacion=vencida')
    expect(replace).not.toHaveBeenCalled()
    expect(pastillas().getByRole('button', { name: 'Invitación vencida 3' })).toHaveAttribute('aria-pressed', 'true')
    expect(metrica('Sin cuenta')).toHaveAttribute('aria-pressed', 'true')

    // The metric clears every account filter.
    await user.click(metrica('Sin cuenta'))
    expect(urlFiltros).toHaveBeenLastCalledWith(null, '', '/admin/dream-team/servidores')
    expect(screen.queryByRole('group', { name: 'Estado de la invitación a registrarse' })).not.toBeInTheDocument()
    urlFiltros.mockRestore()
  })

  it('stay hidden without invitation data', () => {
    const sinDatos = FILAS.map(({ invitacion: _omitida, ...resto }) => resto)
    render(<ServidoresClient {...props({ sinCuenta: true }, sinDatos)} />)
    expect(screen.queryByRole('group', { name: 'Estado de la invitación a registrarse' })).not.toBeInTheDocument()
  })
})

describe('Servidores — the state line of each row', () => {
  it('vencida: state, how long ago and who; with several sends, how many', () => {
    render(<ServidoresClient {...props({ invitacion: 'vencida' })} />)
    expect(filaDe('Fernando Ramos').getAllByText('Invitación vencida').length).toBeGreaterThan(0)
    expect(filaDe('Fernando Ramos').getByText('Enviada hace 24 días por Edmir Muñoz')).toBeInTheDocument()
    expect(filaDe('Blanca Rojas').getByText('Enviada hace 20 días por Edith Pérez · 2 envíos')).toBeInTheDocument()
    // Phone second line: the state and the time, without who.
    expect(filaDe('Fernando Ramos').getByText('Invitación vencida · Enviada hace 24 días')).toBeInTheDocument()
  })

  it('enviada: how long ago and when it expires', () => {
    render(<ServidoresClient {...props({ invitacion: 'enviada' })} />)
    expect(filaDe('Wito González').getByText('Enviada hace 2 horas · vence en 22 h')).toBeInTheDocument()
  })

  it('sin invitar and registrada', () => {
    render(<ServidoresClient {...props({ invitacion: 'sin_invitar' })} />)
    expect(filaDe('Mariela Torres').getByText('Nunca se le envió una invitación')).toBeInTheDocument()
    expect(filaDe('Mariela Torres').getByText('Sin invitar · nunca invitado')).toBeInTheDocument()
  })

  it('sin invitar after a cancelled invitation: when it was cancelled, not "never sent"', () => {
    const cancelada = invitacion('sin_invitar', 3 * DIA, 'Edmir Muñoz', {
      envios: 1,
      historial: [{ estado: 'cancelada', email: 'persona@correo.com', fecha: haceMs(3 * DIA), invitadoPor: 'Edmir Muñoz' }],
    })
    const filas = [...FILAS, fila('7', 'Lucía Paz', ID_DHAH, 'Facilitadora', { ...INVITA, tieneCuenta: false, invitacion: cancelada })]
    render(<ServidoresClient {...props({ invitacion: 'sin_invitar' }, filas)} />)
    const fecha = fechaCorta(cancelada.enviadaEl)
    expect(filaDe('Lucía Paz').getByText(`Invitación cancelada el ${fecha}`)).toBeInTheDocument()
    expect(filaDe('Lucía Paz').getByText(`Sin invitar · cancelada el ${fecha}`)).toBeInTheDocument()
    expect(filaDe('Lucía Paz').queryByText('Nunca se le envió una invitación')).not.toBeInTheDocument()
  })

  it('registrada: when they entered and who invited', () => {
    render(<ServidoresClient {...props({ invitacion: 'registrada' })} />)
    expect(filaDe('Edmir Muñoz').getAllByText('Ya se registró').length).toBeGreaterThan(0)
    expect(filaDe('Edmir Muñoz').getByText(`Entró el ${fechaCorta(ACEPTADA_EL)} · invitado por Antholy Ludovic Gómez`)).toBeInTheDocument()
  })
})

describe('Servidores — the "Invitación vencida" banner', () => {
  it('counts the expired invitations the viewer may resend and resends them in one call', async () => {
    fetchMock.mockImplementation(async () => ({
      ok: true,
      json: async () => ({
        resultados: [
          { id: ID('Fernando Ramos'), ok: true, email: 'fernando.ramos@gmail.com' },
          { id: ID('Blanca Rojas'), ok: false, error: 'El correo rebotó' },
        ],
      }),
    }))
    render(<ServidoresClient {...props({ invitacion: 'vencida' })} />)
    expect(
      screen.getByText(
        (_, el) =>
          el?.tagName === 'P' &&
          el.textContent ===
            '2 personas no abrieron el correo para crear su cuenta y el enlace ya venció. Al reenviar, cada una recibe un enlace nuevo para registrarse, en el mismo correo.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('2 personas no abrieron el correo para crear su cuenta').tagName).toBe('B')

    await user.click(screen.getByRole('button', { name: 'Reenviar invitación a las 2' }))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/api/invitaciones-cuenta/reenviar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [ID('Blanca Rojas'), ID('Fernando Ramos')] }),
    })
    expect(toast.success).toHaveBeenCalledWith('Se reenvió 1 invitación para registrarse.')
    expect(toast.error).toHaveBeenCalledWith('No se pudieron reenviar 1: El correo rebotó')
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('one person reads "a 1 persona" in singular', () => {
    render(<ServidoresClient {...props({ invitacion: 'vencida' }, FILAS.filter((f) => f.nombre !== 'Blanca Rojas'))} />)
    expect(screen.getByText('1 persona no abrió el correo para crear su cuenta')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reenviar invitación a 1 persona' })).toBeInTheDocument()
  })

  it('sends at most 10 ids per request (each send takes seconds; the server caps at 50)', async () => {
    const muchas = Array.from({ length: 51 }, (_, i) =>
      fila(`v${i}`, `Persona ${String(i).padStart(2, '0')}`, ID_DHAH, 'Facilitador', {
        ...INVITA,
        tieneCuenta: false,
        invitacion: invitacion('vencida', 3 * DIA, 'Edmir Muñoz'),
      }),
    )
    fetchMock.mockImplementation(async (_url: string, init: { body: string }) => ({
      ok: true,
      json: async () => ({ resultados: (JSON.parse(init.body) as { ids: string[] }).ids.map((id) => ({ id, ok: true, email: 'x@y.com' })) }),
    }))
    render(<ServidoresClient {...props({ invitacion: 'vencida' }, muchas)} />)
    await user.click(screen.getByRole('button', { name: 'Reenviar invitación a las 51' }))
    expect(fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body).ids.length)).toEqual([10, 10, 10, 10, 10, 1])
    expect(toast.success).toHaveBeenCalledWith('Se reenviaron 51 invitaciones para registrarse.')
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('a failed request reports its error and every id of it as not resent', async () => {
    fetchMock.mockImplementation(async () => ({ ok: false, status: 500, json: async () => ({ error: 'No se pudieron leer las invitaciones' }) }))
    render(<ServidoresClient {...props({ invitacion: 'vencida' })} />)
    await user.click(screen.getByRole('button', { name: 'Reenviar invitación a las 2' }))
    expect(toast.success).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('No se pudieron reenviar 2: No se pudieron leer las invitaciones')
  })

  it('is not there for who may not invite, nor under another pill', () => {
    const { unmount } = render(<ServidoresClient {...props({ invitacion: 'enviada' })} />)
    expect(screen.queryByRole('button', { name: /^Reenviar invitación a/ })).not.toBeInTheDocument()
    unmount()
    render(<ServidoresClient {...props({ invitacion: 'vencida' }, FILAS.map((f) => ({ ...f, fichaEditable: false })))} />)
    expect(screen.queryByText(/no abri(ó|eron) el correo/)).not.toBeInTheDocument()
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
  })
})

describe('Servidores — selecting expired invitations', () => {
  it('only expired invitations the viewer may resend get a checkbox, and checking one does not open the drawer', async () => {
    render(<ServidoresClient {...props({ sinCuenta: true })} />)
    expect(casillas('Fernando Ramos').length).toBeGreaterThan(0)
    expect(casillas('Blanca Rojas').length).toBeGreaterThan(0)
    expect(casillas('Rafael Escalona')).toHaveLength(0)
    expect(casillas('Wito González')).toHaveLength(0)
    expect(casillas('Mariela Torres')).toHaveLength(0)

    await user.click(casillas('Fernando Ramos')[0])
    expect(screen.queryByRole('dialog', { name: 'Fernando Ramos' })).not.toBeInTheDocument()
    expect(barra().getByText((_, el) => el?.tagName === 'P' && el.textContent === '1 invitación seleccionada')).toBeInTheDocument()
    for (const casilla of casillas('Fernando Ramos')) expect(casilla).toBeChecked()

    await user.click(barra().getByRole('button', { name: 'Quitar selección' }))
    expect(screen.queryByRole('region', { name: 'Acciones de la selección' })).not.toBeInTheDocument()
  })

  it('"select all" marks every visible expired invitation, and "Reenviar N" resends them', async () => {
    fetchMock.mockImplementation(async (_url: string, init: { body: string }) => ({
      ok: true,
      json: async () => ({ resultados: (JSON.parse(init.body) as { ids: string[] }).ids.map((id) => ({ id, ok: true, email: 'x@y.com' })) }),
    }))
    render(<ServidoresClient {...props({ sinCuenta: true })} />)
    await user.click(screen.getByRole('checkbox', { name: 'Seleccionar todas las invitaciones vencidas' }))
    expect(barra().getByText((_, el) => el?.tagName === 'P' && el.textContent === '2 invitaciones seleccionadas')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Seleccionar todas las invitaciones vencidas' })).toBeChecked()

    await user.click(barra().getByRole('button', { name: 'Reenviar 2' }))
    expect(fetchMock).toHaveBeenCalledWith('/api/invitaciones-cuenta/reenviar', expect.objectContaining({
      body: JSON.stringify({ ids: [ID('Blanca Rojas'), ID('Fernando Ramos')] }),
    }))
    expect(toast.success).toHaveBeenCalledWith('Se reenviaron 2 invitaciones para registrarse.')
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('region', { name: 'Acciones de la selección' })).not.toBeInTheDocument()
  })

  it('"Cancelar invitaciones" asks first, then cancels one by one', async () => {
    render(<ServidoresClient {...props({ sinCuenta: true })} />)
    await user.click(screen.getByRole('checkbox', { name: 'Seleccionar todas las invitaciones vencidas' }))
    await user.click(barra().getByRole('button', { name: 'Cancelar invitaciones' }))
    const dialogo = within(screen.getByRole('alertdialog', { name: '¿Cancelar 2 invitaciones?' }))
    expect(fetchMock).not.toHaveBeenCalled()

    await user.click(dialogo.getByRole('button', { name: 'Cancelar invitaciones' }))
    expect(fetchMock.mock.calls.map(([url, init]) => [url, init.method])).toEqual([
      [`/api/users/${encodeURIComponent(ID('Blanca Rojas'))}/invitacion-cuenta`, 'DELETE'],
      [`/api/users/${encodeURIComponent(ID('Fernando Ramos'))}/invitacion-cuenta`, 'DELETE'],
    ])
    expect(toast.success).toHaveBeenCalledWith('Se cancelaron 2 invitaciones a la plataforma.')
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('the selection clears when the filters change', async () => {
    render(<ServidoresClient {...props({ sinCuenta: true })} />)
    await user.click(casillas('Fernando Ramos')[0])
    await user.click(pastillas().getByRole('button', { name: 'Invitación vencida 3' }))
    expect(screen.queryByRole('region', { name: 'Acciones de la selección' })).not.toBeInTheDocument()
    expect(casillas('Fernando Ramos')[0]).not.toBeChecked()
  })
})

describe('Servidores — drawer actions (S7)', () => {
  it('"Reenviar invitación" resends to the same email, toasts and refreshes', async () => {
    fetchMock.mockImplementation(async () => ({ ok: true, json: async () => ({ ok: true, email: 'fernando.ramos@gmail.com' }) }))
    render(<ServidoresClient {...props({ invitacion: 'vencida' })} />)
    await user.click(within(lista()).getByRole('button', { name: 'Abrir Fernando Ramos', hidden: true }))
    const panel = within(screen.getByRole('dialog', { name: 'Fernando Ramos' }))
    expect(panel.getByText('Todavía no creó su cuenta')).toBeInTheDocument()

    await user.click(panel.getByRole('button', { name: 'Reenviar invitación' }))
    expect(fetchMock).toHaveBeenCalledWith(`/api/users/${encodeURIComponent(ID('Fernando Ramos'))}/invitacion-cuenta`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'fernando.ramos@gmail.com', reemplazarEmail: false }),
    })
    expect(toast.success).toHaveBeenCalledWith('Invitación para registrarse reenviada a fernando.ramos@gmail.com.')
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('a failed resend shows the server error', async () => {
    fetchMock.mockImplementation(async () => ({ ok: false, status: 403, json: async () => ({ error: 'No tienes permiso para invitar a esta persona' }) }))
    render(<ServidoresClient {...props({ invitacion: 'vencida' })} />)
    await user.click(within(lista()).getByRole('button', { name: 'Abrir Fernando Ramos', hidden: true }))
    await user.click(within(screen.getByRole('dialog', { name: 'Fernando Ramos' })).getByRole('button', { name: 'Reenviar invitación' }))
    expect(toast.error).toHaveBeenCalledWith('No tienes permiso para invitar a esta persona')
    expect(refresh).not.toHaveBeenCalled()
  })

  it('"Cancelar invitación" asks first, then DELETEs, toasts and refreshes', async () => {
    render(<ServidoresClient {...props({ invitacion: 'vencida' })} />)
    await user.click(within(lista()).getByRole('button', { name: 'Abrir Fernando Ramos', hidden: true }))
    await user.click(within(screen.getByRole('dialog', { name: 'Fernando Ramos' })).getByRole('button', { name: 'Cancelar invitación' }))
    const dialogo = within(screen.getByRole('alertdialog', { name: '¿Cancelar la invitación de Fernando Ramos?' }))
    await user.click(dialogo.getByRole('button', { name: 'Cancelar invitación' }))
    expect(fetchMock).toHaveBeenCalledWith(`/api/users/${encodeURIComponent(ID('Fernando Ramos'))}/invitacion-cuenta`, { method: 'DELETE' })
    expect(toast.success).toHaveBeenCalledWith('Invitación a la plataforma cancelada.')
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('a refused cancel shows the server error', async () => {
    fetchMock.mockImplementation(async () => ({ ok: false, status: 409, json: async () => ({ error: 'Esta persona no tiene una invitación abierta' }) }))
    render(<ServidoresClient {...props({ invitacion: 'vencida' })} />)
    await user.click(within(lista()).getByRole('button', { name: 'Abrir Fernando Ramos', hidden: true }))
    await user.click(within(screen.getByRole('dialog', { name: 'Fernando Ramos' })).getByRole('button', { name: 'Cancelar invitación' }))
    await user.click(
      within(screen.getByRole('alertdialog', { name: '¿Cancelar la invitación de Fernando Ramos?' })).getByRole('button', {
        name: 'Cancelar invitación',
      }),
    )
    expect(toast.error).toHaveBeenCalledWith('Esta persona no tiene una invitación abierta')
    expect(toast.success).not.toHaveBeenCalled()
  })
})
