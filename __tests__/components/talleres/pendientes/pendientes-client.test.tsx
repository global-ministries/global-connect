/**
 * @jest-environment jsdom
 *
 * R3e (odd/tasks/talleres-rediseno.md, S1, S2, S4) — the v2 client of
 * /talleres/pendientes (artboard design/talleres-interior/23): attention
 * metrics as filters, scope cards by taller, one drawer per item with the
 * existing actions (approve / reject inscripción with internal motivo and
 * optional mensaje, resolve retiro, link to the edición to assign a grupo),
 * selection mode with bulk approve that leaves por-verificar items out, URL
 * state with replace. Neutral Spanish, no voseo.
 */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

const approveMock = jest.fn()
const rejectMock = jest.fn()
const aprobarRetiroMock = jest.fn()
const rechazarRetiroMock = jest.fn()
const refreshMock = jest.fn()
const exitoMock = jest.fn()
const errorMock = jest.fn()

jest.mock('@/lib/platform/talleres/inscripciones-actions', () => ({
  approveInscripcionAction: (...a: unknown[]) => approveMock(...a),
  rejectInscripcionAction: (...a: unknown[]) => rejectMock(...a),
}))
jest.mock('@/lib/platform/talleres/solicitudes-retiro-actions', () => ({
  aprobarSolicitudRetiroAction: (...a: unknown[]) => aprobarRetiroMock(...a),
  rechazarSolicitudRetiroAction: (...a: unknown[]) => rechazarRetiroMock(...a),
}))
jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock, replace: jest.fn(), push: jest.fn() }),
  usePathname: () => '/talleres/pendientes',
}))
jest.mock('@/components/ui/desktop-header', () => ({
  DesktopHeader: ({ breadcrumbs, accionPrincipal }: { breadcrumbs?: React.ReactNode; accionPrincipal?: React.ReactNode }) => (
    <header data-testid="cabecera">
      {breadcrumbs}
      {accionPrincipal}
    </header>
  ),
}))
jest.mock('@/hooks/use-notificaciones', () => ({
  useNotificaciones: () => ({ success: exitoMock, error: errorMock, info: jest.fn() }),
}))

import { PendientesClient, type PendientesClientProps } from '@/components/talleres/pendientes/pendientes-client'
import { FILTROS_INICIALES, type ItemPendiente } from '@/components/talleres/pendientes/vista-pendientes'

function item(o: Partial<ItemPendiente>): ItemPendiente {
  return {
    clave: 'aprobar:insc-1',
    tipo: 'aprobar',
    id: 'insc-1',
    nombre: 'Rosángela Escalona',
    correo: 'rosangela@example.com',
    enPareja: false,
    tallerClave: 'mujer-de-hoy',
    tallerNombre: 'Mujer de Hoy',
    tallerSlug: 'mujer-de-hoy',
    edicionId: 'ed-nov',
    edicionNombre: 'Edición nov 2026',
    origen: 'app',
    porVerificar: false,
    fecha: '2026-11-04T14:00:00Z',
    motivo: null,
    tipoRetiro: null,
    puedeDecidir: true,
    ...o,
  }
}

const APROBAR = item({})
const OTRA = item({ clave: 'aprobar:insc-2', id: 'insc-2', nombre: 'Kelvin Sequera', tallerClave: 'hombre', tallerNombre: 'De Hombre a Hombre', tallerSlug: 'hombre', fecha: '2026-11-09T14:00:00Z' })
const VERIFICAR = item({ clave: 'aprobar:insc-pv', id: 'insc-pv', nombre: 'Marbelis Colmenárez', porVerificar: true, origen: 'publico', fecha: '2026-11-08T14:00:00Z' })
const AJENA = item({ clave: 'aprobar:insc-x', id: 'insc-x', nombre: 'Jhoan Peraza', puedeDecidir: false, fecha: '2026-11-10T14:00:00Z' })
const RETIRO = item({
  clave: 'retiro:sol-1',
  tipo: 'retiro',
  id: 'sol-1',
  nombre: 'Andreína Colmenárez',
  correo: null,
  origen: null,
  edicionNombre: null,
  edicionId: 'ed-oct',
  motivo: 'Cambié de turno en el trabajo.',
  tipoRetiro: 'participante_retiro',
  fecha: '2026-11-09T12:00:00Z',
})
const SIN_GRUPO = item({ clave: 'sin-grupo:insc-sg', tipo: 'sin-grupo', id: 'insc-sg', nombre: 'Yorbelis Mujica', fecha: '2026-11-03T12:00:00Z' })

function props(o: Partial<PendientesClientProps> = {}): PendientesClientProps {
  return {
    items: [APROBAR, OTRA, VERIFICAR, AJENA, RETIRO, SIN_GRUPO],
    hoy: '2026-11-11T15:00:00Z',
    filtrosIniciales: FILTROS_INICIALES,
    itemInicial: null,
    ...o,
  }
}

const replaceStateSpy = jest.spyOn(window.history, 'replaceState')

beforeEach(() => {
  for (const m of [approveMock, rejectMock, aprobarRetiroMock, rechazarRetiroMock, refreshMock, exitoMock, errorMock]) m.mockReset()
  replaceStateSpy.mockClear()
})

const ultimaUrl = () => String(replaceStateSpy.mock.calls.at(-1)?.[2])
const lista = () => screen.getByRole('table', { name: 'Pendientes' })
const filas = () =>
  within(lista())
    .getAllByRole('button')
    .map((b) => b.getAttribute('aria-label'))

const VOSEO = /\b(tenés|necesitás|podés|querés|tocá|elegí|escribí|confirmá|refrescá|aprobá|vos|acá)\b/i

describe('list', () => {
  it('shows the summary, the four attention metrics and the rows in order: retiros, por aprobar, sin grupo', () => {
    render(<PendientesClient {...props()} />)
    expect(screen.getAllByText(/cosas esperan/)[0].closest('p')).toHaveTextContent(
      '6 cosas esperan tu decisión en 2 talleres · la más antigua, hace 8 días',
    )
    const metricas = screen.getByRole('group', { name: 'Qué espera tu decisión' })
    expect(within(metricas).getByRole('button', { name: /Por aprobar\s*4/ })).toHaveAttribute('aria-pressed', 'false')
    expect(within(metricas).getByRole('button', { name: /Por verificar identidad\s*1/ })).toBeInTheDocument()
    expect(within(metricas).getByRole('button', { name: /Solicitudes de retiro\s*1/ })).toBeInTheDocument()
    expect(within(metricas).getByRole('button', { name: /Sin grupo\s*1/ })).toBeInTheDocument()
    expect(filas()).toEqual([
      'Abrir Andreína Colmenárez',
      'Abrir Rosángela Escalona',
      'Abrir Marbelis Colmenárez',
      'Abrir Kelvin Sequera',
      'Abrir Jhoan Peraza',
      'Abrir Yorbelis Mujica',
    ])
    expect(document.body.textContent).not.toMatch(VOSEO)
  })

  it('a metric filters the list and the URL; a second press clears it', () => {
    render(<PendientesClient {...props()} />)
    const metrica = screen.getByRole('button', { name: /Por verificar identidad/ })
    fireEvent.click(metrica)
    expect(metrica).toHaveAttribute('aria-pressed', 'true')
    expect(filas()).toEqual(['Abrir Marbelis Colmenárez'])
    expect(ultimaUrl()).toBe('/talleres/pendientes?atencion=identidad')
    fireEvent.click(metrica)
    expect(filas()).toHaveLength(6)
  })

  it('scope cards by taller filter the list', () => {
    render(<PendientesClient {...props()} />)
    const alcance = screen.getByRole('group', { name: 'Filtrar por taller' })
    fireEvent.click(within(alcance).getByRole('button', { name: /De Hombre a Hombre/ }))
    expect(filas()).toEqual(['Abrir Kelvin Sequera'])
    expect(ultimaUrl()).toBe('/talleres/pendientes?taller=hombre')
  })

  it('shows the calm empty state when nothing is pending', () => {
    render(<PendientesClient {...props({ items: [] })} />)
    expect(screen.getByText('No tienes nada pendiente')).toBeInTheDocument()
    expect(screen.getByText('Cuando algo necesite tu decisión, aparece aquí.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Aprobar varias' })).toBeNull()
  })
})

describe('drawer — por aprobar', () => {
  it('approves with the existing action, tells who gets the notice and refreshes', async () => {
    approveMock.mockResolvedValue({ ok: true })
    render(<PendientesClient {...props()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Abrir Rosángela Escalona' }))
    const panel = await screen.findByRole('dialog')
    expect(ultimaUrl()).toBe('/talleres/pendientes?item=aprobar%3Ainsc-1')
    expect(within(panel).getByRole('link', { name: /Ver la edición/ })).toHaveAttribute('href', '/talleres/mujer-de-hoy/ed-nov')
    fireEvent.click(within(panel).getByRole('button', { name: 'Aprobar' }))
    await waitFor(() => expect(approveMock).toHaveBeenCalledWith('insc-1'))
    await waitFor(() => expect(refreshMock).toHaveBeenCalled())
    expect(exitoMock).toHaveBeenCalledWith('Aprobaste a Rosángela Escalona. Le llega el aviso «Aprobada».')
  })

  it('rejects only with an internal motivo; the optional mensaje goes to the person', async () => {
    rejectMock.mockResolvedValue({ ok: true })
    render(<PendientesClient {...props({ itemInicial: 'aprobar:insc-1' })} />)
    const panel = await screen.findByRole('dialog')
    fireEvent.click(within(panel).getByRole('button', { name: 'Rechazar…' }))

    const motivo = within(panel).getByRole('textbox', { name: 'Motivo interno (obligatorio)' })
    const mensaje = within(panel).getByRole('textbox', { name: 'Mensaje para la persona (opcional)' })
    expect(motivo).toHaveAccessibleDescription('Solo lo ve el equipo')
    expect(mensaje).toHaveAccessibleDescription('Le llega a la persona y a su pareja por correo y en la app')
    expect(mensaje).toHaveAttribute('maxLength', '600')

    fireEvent.click(within(panel).getByRole('button', { name: 'Rechazar y avisar' }))
    expect(await within(panel).findByText('Escribe el motivo interno.')).toBeInTheDocument()
    expect(rejectMock).not.toHaveBeenCalled()

    fireEvent.change(motivo, { target: { value: '  No cumple el requisito  ' } })
    fireEvent.change(mensaje, { target: { value: 'Te esperamos en la próxima edición.' } })
    fireEvent.click(within(panel).getByRole('button', { name: 'Rechazar y avisar' }))
    await waitFor(() =>
      expect(rejectMock).toHaveBeenCalledWith('insc-1', 'No cumple el requisito', 'Te esperamos en la próxima edición.'),
    )
    await waitFor(() => expect(refreshMock).toHaveBeenCalled())
    expect(exitoMock).toHaveBeenCalledWith('Rechazaste la solicitud de Rosángela Escalona. Le llega el aviso con tu mensaje.')
  })

  it('rejects without mensaje by passing undefined, and «Volver» returns to the detail', async () => {
    rejectMock.mockResolvedValue({ ok: true })
    render(<PendientesClient {...props({ itemInicial: 'aprobar:insc-1' })} />)
    const panel = await screen.findByRole('dialog')
    fireEvent.click(within(panel).getByRole('button', { name: 'Rechazar…' }))
    fireEvent.click(within(panel).getByRole('button', { name: 'Volver' }))
    expect(within(panel).getByRole('button', { name: 'Aprobar' })).toBeInTheDocument()
    fireEvent.click(within(panel).getByRole('button', { name: 'Rechazar…' }))
    fireEvent.change(within(panel).getByRole('textbox', { name: 'Motivo interno (obligatorio)' }), { target: { value: 'Duplicada' } })
    fireEvent.click(within(panel).getByRole('button', { name: 'Rechazar y avisar' }))
    await waitFor(() => expect(rejectMock).toHaveBeenCalledWith('insc-1', 'Duplicada', undefined))
  })

  it('shows a neutral error and keeps the drawer when the action fails', async () => {
    approveMock.mockResolvedValue({ ok: false, error: 'NOT_FOUND_OR_NOT_PENDIENTE', message: 'Refrescá la página.' })
    render(<PendientesClient {...props({ itemInicial: 'aprobar:insc-1' })} />)
    const panel = await screen.findByRole('dialog')
    fireEvent.click(within(panel).getByRole('button', { name: 'Aprobar' }))
    await waitFor(() => expect(errorMock).toHaveBeenCalledWith('Esta inscripción ya no está pendiente. Actualiza la página.'))
    expect(refreshMock).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('a por-verificar item says what to check and is still approved one by one', async () => {
    render(<PendientesClient {...props({ itemInicial: 'aprobar:insc-pv' })} />)
    const panel = await screen.findByRole('dialog')
    expect(within(panel).getByText(/No confirmó el código/)).toBeInTheDocument()
    expect(within(panel).getByText('Página pública')).toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: 'Aprobar' })).toBeEnabled()
  })

  it('an item of a taller the viewer does not coordinate shows no decision buttons', async () => {
    render(<PendientesClient {...props({ itemInicial: 'aprobar:insc-x' })} />)
    const panel = await screen.findByRole('dialog')
    expect(within(panel).getByText('Solo quien coordina este taller puede aprobarla o rechazarla.')).toBeInTheDocument()
    expect(within(panel).queryByRole('button', { name: 'Aprobar' })).toBeNull()
    expect(within(panel).queryByRole('button', { name: 'Rechazar…' })).toBeNull()
  })
})

describe('drawer — retiro and sin grupo', () => {
  it('resolves a retiro with the existing controls (confirm step) and refreshes', async () => {
    aprobarRetiroMock.mockResolvedValue({ ok: true, message: 'ok' })
    render(<PendientesClient {...props({ itemInicial: 'retiro:sol-1' })} />)
    const panel = await screen.findByRole('dialog')
    expect(within(panel).getByText('«Cambié de turno en el trabajo.»', { exact: false })).toBeInTheDocument()
    fireEvent.click(within(panel).getByRole('button', { name: 'Aprobar' }))
    fireEvent.click(within(panel).getByRole('button', { name: 'Confirmar aprobación' }))
    await waitFor(() => expect(aprobarRetiroMock).toHaveBeenCalledWith('sol-1'))
    await waitFor(() => expect(refreshMock).toHaveBeenCalled())
    expect(exitoMock).toHaveBeenCalledWith('Aprobaste el retiro de Andreína Colmenárez.')
  })

  it('rewrites a retiro error in neutral Spanish', async () => {
    rechazarRetiroMock.mockResolvedValue({ ok: false, error: 'FORBIDDEN', message: 'No tenés permiso para resolver esta solicitud.' })
    render(<PendientesClient {...props({ itemInicial: 'retiro:sol-1' })} />)
    const panel = await screen.findByRole('dialog')
    fireEvent.click(within(panel).getByRole('button', { name: 'Rechazar' }))
    fireEvent.click(within(panel).getByRole('button', { name: 'Confirmar rechazo' }))
    expect(await within(panel).findByRole('alert')).toHaveTextContent('No tienes permiso para resolver esta solicitud.')
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('hides the retiro controls without resolverRetiros', async () => {
    render(<PendientesClient {...props({ items: [{ ...RETIRO, puedeDecidir: false }], itemInicial: 'retiro:sol-1' })} />)
    const panel = await screen.findByRole('dialog')
    expect(within(panel).getByText('Solo quien coordina este taller puede resolver esta solicitud.')).toBeInTheDocument()
    expect(within(panel).queryByRole('button', { name: 'Aprobar' })).toBeNull()
  })

  it('«Asignar grupo» links to the edición; without gestionarGrupos it only offers to see it', async () => {
    const { unmount } = render(<PendientesClient {...props({ itemInicial: 'sin-grupo:insc-sg' })} />)
    const panel = await screen.findByRole('dialog')
    expect(within(panel).getByRole('link', { name: 'Asignar grupo' })).toHaveAttribute('href', '/talleres/mujer-de-hoy/ed-nov')
    unmount()

    render(<PendientesClient {...props({ items: [{ ...SIN_GRUPO, puedeDecidir: false }], itemInicial: 'sin-grupo:insc-sg' })} />)
    const otro = await screen.findByRole('dialog')
    expect(within(otro).queryByRole('link', { name: 'Asignar grupo' })).toBeNull()
    expect(within(otro).getByRole('link', { name: 'Ver la edición' })).toHaveAttribute('href', '/talleres/mujer-de-hoy/ed-nov')
  })
})

describe('selection mode («Aprobar varias»)', () => {
  it('narrows to por aprobar, leaves por-verificar and non-decidable items out, and approves the selection', async () => {
    approveMock.mockResolvedValue({ ok: true })
    render(<PendientesClient {...props()} />)
    const boton = within(screen.getByTestId('cabecera')).getByRole('button', { name: 'Aprobar varias' })
    fireEvent.click(boton)
    expect(boton).toHaveAttribute('aria-pressed', 'true')
    expect(filas()).toEqual([
      'Seleccionar a Rosángela Escalona',
      'Abrir Marbelis Colmenárez',
      'Seleccionar a Kelvin Sequera',
      'Abrir Jhoan Peraza',
    ])

    const barra = screen.getByRole('region', { name: 'Acciones en lote' })
    expect(within(barra).getByRole('button', { name: 'Aprobar' })).toBeDisabled()
    expect(barra).toHaveTextContent('2 por aprobar se revisan una por una')

    fireEvent.click(screen.getByRole('button', { name: 'Seleccionar a Kelvin Sequera' }))
    expect(screen.getByRole('button', { name: 'Quitar de la selección a Kelvin Sequera' })).toBeInTheDocument()
    expect(barra).toHaveTextContent('1 seleccionada')
    fireEvent.click(within(barra).getByRole('button', { name: 'Aprobar 1' }))

    await waitFor(() => expect(refreshMock).toHaveBeenCalled())
    expect(approveMock).toHaveBeenCalledTimes(1)
    expect(approveMock).toHaveBeenCalledWith('insc-2')
    expect(exitoMock).toHaveBeenCalledWith('Aprobaste 1 inscripción. Cada persona recibe el aviso «Aprobada».')
    expect(screen.queryByRole('region', { name: 'Acciones en lote' })).toBeNull()
  })

  it('«Seleccionar las N» takes every eligible item; failures are reported, not hidden', async () => {
    approveMock.mockImplementation(async (id: string) => (id === 'insc-1' ? { ok: true } : { ok: false, error: 'UPDATE_FAILED' }))
    render(<PendientesClient {...props()} />)
    fireEvent.click(within(screen.getByTestId('cabecera')).getByRole('button', { name: 'Aprobar varias' }))
    const barra = screen.getByRole('region', { name: 'Acciones en lote' })
    fireEvent.click(within(barra).getByRole('button', { name: 'Seleccionar las 2' }))
    fireEvent.click(within(barra).getByRole('button', { name: 'Aprobar 2' }))
    await waitFor(() => expect(refreshMock).toHaveBeenCalled())
    expect(approveMock.mock.calls.map((c) => c[0]).sort()).toEqual(['insc-1', 'insc-2'])
    expect(exitoMock).toHaveBeenCalledWith('Aprobaste 1 inscripción. Cada persona recibe el aviso «Aprobada».')
    expect(errorMock).toHaveBeenCalledWith('1 no se pudo aprobar. Ábrelas para revisarlas.')
  })

  it('«Cancelar» leaves selection mode without approving', () => {
    render(<PendientesClient {...props()} />)
    fireEvent.click(within(screen.getByTestId('cabecera')).getByRole('button', { name: 'Aprobar varias' }))
    fireEvent.click(screen.getByRole('button', { name: 'Seleccionar a Kelvin Sequera' }))
    fireEvent.click(within(screen.getByRole('region', { name: 'Acciones en lote' })).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('region', { name: 'Acciones en lote' })).toBeNull()
    expect(approveMock).not.toHaveBeenCalled()
  })

  it('is not offered when nothing can be approved in bulk', () => {
    render(<PendientesClient {...props({ items: [VERIFICAR, AJENA, RETIRO] })} />)
    expect(screen.queryByRole('button', { name: 'Aprobar varias' })).toBeNull()
  })
})
