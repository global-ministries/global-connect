/**
 * @jest-environment jsdom
 *
 * R3f (odd/tasks/talleres-rediseno.md, S1, S2, S4) — the client island of
 * the edición screen (artboards design/talleres-reserva/12 and
 * design/talleres-interior/24): attention metrics as filters, origen filter,
 * ListaResponsiva of inscritas with origen, one drawer per inscripción with
 * the existing actions (approve, reject with internal motivo + optional
 * mensaje, assign grupo through the asignar-grupo route), selection mode
 * with bulk approve that leaves por-verificar inscriptions out, the Grupos
 * tab with «Sin grupo», URL state with replace. Neutral Spanish, no voseo.
 */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

const approveMock = jest.fn()
const rejectMock = jest.fn()
const reenviarMock = jest.fn()
const refreshMock = jest.fn()
const exitoMock = jest.fn()
const errorMock = jest.fn()

jest.mock('@/lib/platform/talleres/inscripciones-actions', () => ({
  approveInscripcionAction: (...a: unknown[]) => approveMock(...a),
  rejectInscripcionAction: (...a: unknown[]) => rejectMock(...a),
  reenviarAccesoAction: (...a: unknown[]) => reenviarMock(...a),
}))
jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock, replace: jest.fn(), push: jest.fn() }),
  usePathname: () => '/talleres/mujer-de-hoy/ed-nov',
}))
jest.mock('@/hooks/use-notificaciones', () => ({
  useNotificaciones: () => ({ success: exitoMock, error: errorMock, info: jest.fn() }),
}))

import { EdicionCliente, type EdicionClienteProps } from '@/components/talleres/edicion/edicion-cliente'
import { FILTROS_INICIALES, type InscritaEdicion } from '@/components/talleres/edicion/modelo'

function inscrita(o: Partial<InscritaEdicion>): InscritaEdicion {
  return {
    id: 'i-1',
    nombre: 'Rosángela Escalona',
    correo: 'rosangela@example.com',
    companero: null,
    vinculo: null,
    estado: 'pendiente',
    origen: 'app',
    porVerificar: false,
    grupoId: null,
    grupoNombre: null,
    solicito: '2026-11-04T14:00:00Z',
    sobreCupo: false,
    sobreCupoPor: null,
    sobreCupoEn: null,
    resultado: null,
    fichaNueva: false,
    accesoEstado: null,
    accesoFallido: false,
    ...o,
  }
}

const PENDIENTE = inscrita({})
const VERIFICAR = inscrita({ id: 'i-pv', nombre: 'Marbelis Colmenárez', origen: 'publico', porVerificar: true, solicito: '2026-11-08T14:00:00Z' })
const OTRA = inscrita({ id: 'i-2', nombre: 'Deyanira Torrealba', origen: 'publico', solicito: '2026-11-06T14:00:00Z' })
const APROBADA = inscrita({ id: 'i-ap', nombre: 'Carolina Mendoza', estado: 'aprobado', origen: 'admin', grupoId: 'g-1', grupoNombre: 'Grupo 1' })
const SIN_GRUPO = inscrita({ id: 'i-sg', nombre: 'Yorbelis Mujica', estado: 'aprobado', origen: 'publico' })

const GRUPOS = [
  { id: 'g-1', nombre: 'Grupo 1', facilitadora: 'Yelitza Rojas', ocupacion: 4, capacidad: 8 },
  { id: 'g-2', nombre: 'Grupo 2', facilitadora: null, ocupacion: null, capacidad: 8 },
]

function props(o: Partial<EdicionClienteProps> = {}): EdicionClienteProps {
  return {
    inscritas: [PENDIENTE, VERIFICAR, OTRA, APROBADA, SIN_GRUPO],
    grupos: GRUPOS,
    puedeAprobar: true,
    puedeAsignar: true,
    mostrarResultado: false,
    panelGrupos: <div data-testid="grupos-section">GruposSection</div>,
    vistaInicial: 'inscripciones',
    filtrosIniciales: FILTROS_INICIALES,
    itemInicial: null,
    ...o,
  }
}

interface LlamadaFetch {
  readonly url: string
  readonly cuerpo: unknown
}
let llamadas: LlamadaFetch[] = []
let respuestaRuta: { status: number; body: unknown } = { status: 200, body: { asignadas: 1, ocupacion: 5, capacidad: 8 } }

const replaceStateSpy = jest.spyOn(window.history, 'replaceState')

beforeEach(() => {
  for (const m of [approveMock, rejectMock, reenviarMock, refreshMock, exitoMock, errorMock]) m.mockReset()
  replaceStateSpy.mockClear()
  llamadas = []
  respuestaRuta = { status: 200, body: { asignadas: 1, ocupacion: 5, capacidad: 8 } }
  ;(global as unknown as { fetch: jest.Mock }).fetch = jest.fn(async (url: string, init?: RequestInit) => {
    llamadas.push({ url, cuerpo: JSON.parse(String(init?.body)) })
    return { ok: respuestaRuta.status < 300, status: respuestaRuta.status, json: async () => respuestaRuta.body }
  })
})

const ultimaUrl = () => String(replaceStateSpy.mock.calls.at(-1)?.[2])
const lista = () => screen.getByRole('table', { name: 'Inscritas en la edición' })
const filas = () =>
  within(lista())
    .getAllByRole('button')
    .map((b) => b.getAttribute('aria-label'))

const VOSEO = /\b(tenés|necesitás|podés|querés|tocá|elegí|escribí|confirmá|refrescá|intentá|seleccioná|aprobá|vos|acá)\b/i

describe('list', () => {
  it('shows the attention metrics, every inscrita with its origen, and no voseo', () => {
    render(<EdicionCliente {...props()} />)
    const metricas = screen.getByRole('group', { name: 'Necesita atención' })
    expect(within(metricas).getByRole('button', { name: /Por aprobar\s*3/ })).toHaveAttribute('aria-pressed', 'false')
    expect(within(metricas).getByRole('button', { name: /Sin grupo\s*1/ })).toBeInTheDocument()
    expect(within(metricas).getByRole('button', { name: /Por verificar identidad\s*1/ })).toBeInTheDocument()
    expect(filas()).toEqual([
      'Abrir Rosángela Escalona',
      'Abrir Marbelis Colmenárez',
      'Abrir Deyanira Torrealba',
      'Abrir Carolina Mendoza',
      'Abrir Yorbelis Mujica',
    ])
    const tabla = lista()
    expect(within(tabla).getAllByText('Página pública').length).toBeGreaterThan(0)
    expect(within(tabla).getAllByText('Coordinación').length).toBeGreaterThan(0)
    expect(within(tabla).getAllByText('App').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Verificar identidad').length).toBeGreaterThan(0)
    expect(document.body.textContent).not.toMatch(VOSEO)
  })

  it('a metric filters the list and the URL; a second press clears it', () => {
    render(<EdicionCliente {...props()} />)
    const metrica = screen.getByRole('button', { name: /Por verificar identidad/ })
    fireEvent.click(metrica)
    expect(metrica).toHaveAttribute('aria-pressed', 'true')
    expect(filas()).toEqual(['Abrir Marbelis Colmenárez'])
    expect(ultimaUrl()).toBe('/talleres/mujer-de-hoy/ed-nov?atencion=identidad')
    fireEvent.click(metrica)
    expect(filas()).toHaveLength(5)
    fireEvent.click(screen.getByRole('button', { name: /Sin grupo\s*1/ }))
    expect(filas()).toEqual(['Abrir Yorbelis Mujica'])
  })

  it('the origen switch filters by where the inscription came from and shows a removable chip', () => {
    render(<EdicionCliente {...props()} />)
    const origen = screen.getByRole('group', { name: 'Origen' })
    fireEvent.click(within(origen).getByRole('button', { name: 'Página pública' }))
    expect(filas()).toEqual(['Abrir Marbelis Colmenárez', 'Abrir Deyanira Torrealba', 'Abrir Yorbelis Mujica'])
    expect(ultimaUrl()).toBe('/talleres/mujer-de-hoy/ed-nov?origen=publico')
    fireEvent.click(screen.getByRole('button', { name: /Quitar Origen: Página pública/ }))
    expect(filas()).toHaveLength(5)
  })

  it('searches by name or correo, ignoring accents', () => {
    render(<EdicionCliente {...props()} />)
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar inscritas' }), { target: { value: 'colmenarez' } })
    expect(filas()).toEqual(['Abrir Marbelis Colmenárez'])
    expect(ultimaUrl()).toBe('/talleres/mujer-de-hoy/ed-nov?q=colmenarez')
  })

  it('shows the empty states: nobody yet, and nobody with these filters with «Limpiar todo»', () => {
    const { unmount } = render(<EdicionCliente {...props({ inscritas: [] })} />)
    expect(screen.getByText('Nadie se ha inscrito todavía')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Seleccionar' })).toBeNull()
    unmount()
    render(<EdicionCliente {...props({ filtrosIniciales: { atencion: 'identidad', origen: 'admin', q: '' } })} />)
    expect(screen.getByText('Nadie con estos filtros')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Limpiar todo' })[0])
    expect(filas()).toHaveLength(5)
  })

  it('adds the Resultado column once the edición is closed', () => {
    render(<EdicionCliente {...props({ mostrarResultado: true, inscritas: [inscrita({ estado: 'aprobado', resultado: 'completado' })] })} />)
    expect(within(lista()).getByRole('columnheader', { name: 'Resultado' })).toBeInTheDocument()
    expect(within(lista()).getByText('Completado')).toBeInTheDocument()
  })
})

describe('drawer', () => {
  it('approves with the existing action, tells who gets the notice and refreshes', async () => {
    approveMock.mockResolvedValue({ ok: true })
    render(<EdicionCliente {...props()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Abrir Rosángela Escalona' }))
    const panel = await screen.findByRole('dialog')
    expect(ultimaUrl()).toBe('/talleres/mujer-de-hoy/ed-nov?item=i-1')
    expect(within(panel).getByRole('link', { name: 'rosangela@example.com' })).toHaveAttribute('href', 'mailto:rosangela@example.com')
    fireEvent.click(within(panel).getByRole('button', { name: 'Aprobar' }))
    await waitFor(() => expect(approveMock).toHaveBeenCalledWith('i-1'))
    await waitFor(() => expect(refreshMock).toHaveBeenCalled())
    expect(exitoMock).toHaveBeenCalledWith('Aprobaste a Rosángela Escalona. Le llega el aviso «Aprobada».')
    expect(llamadas).toEqual([])
  })

  it('approves and then places the inscription in the grupo picked in the drawer', async () => {
    approveMock.mockResolvedValue({ ok: true })
    render(<EdicionCliente {...props({ itemInicial: 'i-1' })} />)
    const panel = await screen.findByRole('dialog')
    const select = within(panel).getByRole('combobox', { name: 'Grupo de Rosángela Escalona' })
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Sin grupo todavía',
      'Grupo 1 · Yelitza Rojas · 4 de 8',
      'Grupo 2 · — de 8',
    ])
    fireEvent.change(select, { target: { value: 'g-1' } })
    fireEvent.click(within(panel).getByRole('button', { name: 'Aprobar' }))
    await waitFor(() => expect(llamadas).toEqual([{ url: '/api/talleres/inscripciones/asignar-grupo', cuerpo: { inscripcion_ids: ['i-1'], grupo_id: 'g-1' } }]))
    expect(approveMock).toHaveBeenCalledWith('i-1')
    await waitFor(() =>
      expect(exitoMock).toHaveBeenCalledWith('Aprobaste a Rosángela Escalona y le asignaste grupo. Le llega el aviso con su facilitadora.'),
    )
  })

  it('shows a neutral error and keeps the drawer when the approval fails', async () => {
    approveMock.mockResolvedValue({ ok: false, error: 'NOT_FOUND_OR_NOT_PENDIENTE' })
    render(<EdicionCliente {...props({ itemInicial: 'i-1' })} />)
    const panel = await screen.findByRole('dialog')
    fireEvent.click(within(panel).getByRole('button', { name: 'Aprobar' }))
    await waitFor(() => expect(errorMock).toHaveBeenCalledWith('Esta inscripción ya no está pendiente. Actualiza la página.'))
    expect(refreshMock).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('rejects only with an internal motivo; the optional mensaje goes to the person', async () => {
    rejectMock.mockResolvedValue({ ok: true })
    render(<EdicionCliente {...props({ itemInicial: 'i-1' })} />)
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
    await waitFor(() => expect(rejectMock).toHaveBeenCalledWith('i-1', 'No cumple el requisito', 'Te esperamos en la próxima edición.'))
    await waitFor(() =>
      expect(exitoMock).toHaveBeenCalledWith('Rechazaste la solicitud de Rosángela Escalona. Le llega el aviso con tu mensaje.'),
    )
  })

  it('«Volver» leaves the rejection without calling the action', async () => {
    render(<EdicionCliente {...props({ itemInicial: 'i-1' })} />)
    const panel = await screen.findByRole('dialog')
    fireEvent.click(within(panel).getByRole('button', { name: 'Rechazar…' }))
    fireEvent.click(within(panel).getByRole('button', { name: 'Volver' }))
    expect(within(panel).getByRole('button', { name: 'Aprobar' })).toBeInTheDocument()
    expect(rejectMock).not.toHaveBeenCalled()
  })

  it('warns about a por-verificar inscription; it is still approved one by one', async () => {
    render(<EdicionCliente {...props({ itemInicial: 'i-pv' })} />)
    const panel = await screen.findByRole('dialog')
    expect(panel).toHaveTextContent('No confirmó el código.')
    expect(within(panel).getByRole('button', { name: 'Aprobar' })).toBeEnabled()
  })

  it('changes the grupo of an aprobada through the route and takes it out with «Sin grupo todavía»', async () => {
    render(<EdicionCliente {...props({ itemInicial: 'i-ap' })} />)
    const panel = await screen.findByRole('dialog')
    const guardar = within(panel).getByRole('button', { name: 'Guardar grupo' })
    expect(guardar).toBeDisabled()
    fireEvent.change(within(panel).getByRole('combobox', { name: 'Grupo de Carolina Mendoza' }), { target: { value: 'sin-grupo' } })
    fireEvent.click(guardar)
    await waitFor(() => expect(llamadas).toEqual([{ url: '/api/talleres/inscripciones/asignar-grupo', cuerpo: { inscripcion_ids: ['i-ap'], grupo_id: null } }]))
    await waitFor(() => expect(exitoMock).toHaveBeenCalledWith('Quitaste a Carolina Mendoza de su grupo.'))
  })

  it('maps a route refusal to neutral text, never the route\'s own message', async () => {
    respuestaRuta = { status: 403, body: { error: 'FORBIDDEN', message: 'No tenés permiso para asignar inscripciones a este grupo.' } }
    render(<EdicionCliente {...props({ itemInicial: 'i-sg' })} />)
    const panel = await screen.findByRole('dialog')
    fireEvent.change(within(panel).getByRole('combobox', { name: 'Grupo de Yorbelis Mujica' }), { target: { value: 'g-2' } })
    fireEvent.click(within(panel).getByRole('button', { name: 'Guardar grupo' }))
    await waitFor(() => expect(errorMock).toHaveBeenCalledWith('No tienes permiso para asignar grupos en esta edición.'))
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('a viewer without permissions sees the data and no actions', async () => {
    render(<EdicionCliente {...props({ puedeAprobar: false, puedeAsignar: false, panelGrupos: null, itemInicial: 'i-1' })} />)
    const panel = await screen.findByRole('dialog')
    expect(panel).toHaveTextContent('Solo quien coordina este taller puede aprobarla o rechazarla.')
    expect(within(panel).queryByRole('button', { name: 'Aprobar' })).toBeNull()
    expect(within(panel).queryByRole('combobox')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Seleccionar' })).toBeNull()
    expect(screen.queryByRole('tab')).toBeNull()
  })
})

describe('selection mode', () => {
  it('narrows to «Por aprobar», toggles only inscriptions with confirmed identity and approves them one by one', async () => {
    approveMock.mockResolvedValue({ ok: true })
    render(<EdicionCliente {...props()} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Seleccionar' })[0])
    expect(screen.getAllByRole('button', { name: 'Listo' })[0]).toHaveAttribute('aria-pressed', 'true')
    expect(filas()).toEqual(['Seleccionar a Rosángela Escalona', 'Abrir Marbelis Colmenárez', 'Seleccionar a Deyanira Torrealba'])
    const barra = screen.getByRole('region', { name: 'Acciones en lote' })
    expect(barra).toHaveTextContent('1 por aprobar se revisa una por una: falta verificar su identidad.')

    fireEvent.click(screen.getByRole('button', { name: 'Seleccionar a Rosángela Escalona' }))
    fireEvent.click(screen.getByRole('button', { name: 'Seleccionar a Deyanira Torrealba' }))
    expect(barra).toHaveTextContent('2 seleccionadas')
    fireEvent.click(within(barra).getByRole('button', { name: 'Aprobar 2' }))
    await waitFor(() => expect(approveMock).toHaveBeenCalledTimes(2))
    expect(approveMock.mock.calls.map((c) => c[0])).toEqual(['i-1', 'i-2'])
    await waitFor(() =>
      expect(exitoMock).toHaveBeenCalledWith('Aprobaste 2 inscripciones. Cada persona recibe el aviso «Aprobada».'),
    )
    expect(llamadas).toEqual([])
    expect(refreshMock).toHaveBeenCalled()
  })

  it('a por-verificar row opens its drawer instead of joining the selection', async () => {
    render(<EdicionCliente {...props()} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Seleccionar' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Abrir Marbelis Colmenárez' }))
    expect(await screen.findByRole('dialog')).toHaveTextContent('No confirmó el código.')
  })

  it('places the approved ones in the grupo picked in the bar, and reports the ones that failed', async () => {
    approveMock.mockImplementation(async (id: string) => (id === 'i-2' ? { ok: false, error: 'FORBIDDEN' } : { ok: true }))
    render(<EdicionCliente {...props()} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Seleccionar' })[0])
    const barra = screen.getByRole('region', { name: 'Acciones en lote' })
    fireEvent.click(within(barra).getByRole('button', { name: 'Seleccionar las 2' }))
    fireEvent.change(within(barra).getByRole('combobox', { name: 'Grupo para las seleccionadas' }), { target: { value: 'g-2' } })
    fireEvent.click(within(barra).getByRole('button', { name: 'Aprobar 2' }))
    await waitFor(() => expect(llamadas).toEqual([{ url: '/api/talleres/inscripciones/asignar-grupo', cuerpo: { inscripcion_ids: ['i-1'], grupo_id: 'g-2' } }]))
    await waitFor(() =>
      expect(exitoMock).toHaveBeenCalledWith('Aprobaste 1 inscripción y les asignaste grupo. Cada persona recibe el aviso «Aprobada».'),
    )
    expect(errorMock).toHaveBeenCalledWith('1 no se pudo aprobar. Ábrelas para revisarlas.')
  })

  it('«Cancelar» leaves selection mode without approving', () => {
    render(<EdicionCliente {...props()} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Seleccionar' })[0])
    fireEvent.click(within(screen.getByRole('region', { name: 'Acciones en lote' })).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('region', { name: 'Acciones en lote' })).toBeNull()
    expect(approveMock).not.toHaveBeenCalled()
  })
})

describe('Grupos tab', () => {
  it('shows the GruposSection panel and the «Sin grupo» card; «Asignar» opens that inscription', async () => {
    render(<EdicionCliente {...props({ vistaInicial: 'grupos' })} />)
    expect(screen.getByRole('tab', { name: /Grupos\s*2/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('grupos-section')).toBeInTheDocument()
    expect(ultimaUrl()).toBe('/talleres/mujer-de-hoy/ed-nov?vista=grupos')
    expect(screen.getByRole('heading', { name: /Sin grupo\s*\(1\)/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Asignar grupo a Yorbelis Mujica' }))
    const panel = await screen.findByRole('dialog')
    expect(panel).toHaveTextContent('Yorbelis Mujica')
    expect(within(panel).getByRole('combobox', { name: 'Grupo de Yorbelis Mujica' })).toBeInTheDocument()
  })
})
