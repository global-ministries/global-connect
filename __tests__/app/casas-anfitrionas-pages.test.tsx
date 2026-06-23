import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { REVIEW_DECISION_NOTES_MAX_LENGTH } from '@/lib/casas-anfitrionas/review-constants'

const createSupabaseServerClient = jest.fn()
const createSupabaseAdminClient = jest.fn()
const mockAsignarCasaAnfitrionaAGrupo = jest.fn()
const mockListarCasasAnfitrionas = jest.fn()
const mockObtenerCasasRevisionPendiente = jest.fn()
const mockObtenerGruposSinCasaAnfitriona = jest.fn()
const mockProcesarAprobacionCasa = jest.fn()
const mockProcesarRevisionUbicacionCasa = jest.fn()
const mockRouterPush = jest.fn()
const mockRouterRefresh = jest.fn()
const mockToastError = jest.fn()
const mockToastSuccess = jest.fn()
const redirect = jest.fn((path: string) => {
  throw new Error(`redirect:${path}`)
})
const notFound = jest.fn(() => {
  throw new Error('notFound')
})

jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => createSupabaseServerClient() }))
jest.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: () => createSupabaseAdminClient() }))
jest.mock('next/navigation', () => ({
  notFound: () => notFound(),
  redirect: (path: string) => redirect(path),
  useRouter: () => ({ push: mockRouterPush, refresh: mockRouterRefresh }),
}))
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}))
jest.mock('@/components/layout/dashboard-layout', () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}))
jest.mock('@/components/ui/BotonFlotante', () => ({
  BotonFlotante: ({ href, label }: { href: string; label: string }) => <a href={href}>{label}</a>,
}))
jest.mock('@/components/ui/sistema-diseno', () => ({
  BadgeSistema: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  BotonSistema: ({ cargando, children, disabled, onClick, type = 'button' }: React.ButtonHTMLAttributes<HTMLButtonElement> & { cargando?: boolean }) => (
    <button disabled={disabled || cargando} onClick={onClick} type={type}>
      {cargando && <span aria-hidden="true">spinner</span>}
      {children}
    </button>
  ),
  ContenedorDashboard: ({ accionPrincipal, children, titulo }: { accionPrincipal?: React.ReactNode; children: React.ReactNode; titulo: string }) => (
    <section>
      <h1>{titulo}</h1>
      {accionPrincipal}
      {children}
    </section>
  ),
  InputSistema: ({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label?: string }) => <label>{label}<input {...props} /></label>,
  SelectSistema: ({ disabled, label, onValueChange, opciones, placeholder, value }: { disabled?: boolean; label: string; onValueChange?: (value: string) => void; opciones: Array<{ valor: string; etiqueta: string }>; placeholder?: string; value?: string }) => (
    <label>
      {label}
      <select disabled={disabled} value={value} onChange={(event) => onValueChange?.(event.target.value)}>
        {placeholder && <option value="">{placeholder}</option>}
        {opciones.map((option) => <option key={option.valor} value={option.valor}>{option.etiqueta}</option>)}
      </select>
    </label>
  ),
  SeparadorSistema: () => <hr />,
  TarjetaSistema: ({ children }: { children: React.ReactNode }) => <article>{children}</article>,
  TextareaSistema: ({ label, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) => <label>{label}<textarea {...props} /></label>,
  TextoSistema: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  TituloSistema: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}))
jest.mock('@/hooks/use-notificaciones', () => ({ useNotificaciones: () => ({ success: mockToastSuccess, error: mockToastError }) }))
jest.mock('@/lib/actions/casas-anfitrionas.actions', () => ({
  asignarCasaAnfitrionaAGrupo: (input: unknown) => mockAsignarCasaAnfitrionaAGrupo(input),
  listarCasasAnfitrionas: (input: unknown) => mockListarCasasAnfitrionas(input),
  obtenerCasasRevisionPendiente: () => mockObtenerCasasRevisionPendiente(),
  obtenerGruposSinCasaAnfitriona: (input: unknown) => mockObtenerGruposSinCasaAnfitriona(input),
  procesarAprobacionCasa: (...args: unknown[]) => mockProcesarAprobacionCasa(...args),
  procesarRevisionUbicacionCasa: (input: unknown) => mockProcesarRevisionUbicacionCasa(input),
}))
jest.mock('@/app/(auth)/grupos-vida/casas-anfitrionas/nueva/nueva-casa-client', () => ({
  NuevaCasaClient: ({ mostrarSelectorUsuario, usuarios }: { mostrarSelectorUsuario: boolean; usuarios: Array<{ label: string }> }) => (
    <section>
      <span data-testid="nueva-selector-visible">{String(mostrarSelectorUsuario)}</span>
      {usuarios.map((usuario) => <p key={usuario.label}>{usuario.label}</p>)}
    </section>
  ),
}))
jest.mock('@/app/(auth)/grupos-vida/casas-anfitrionas/[id]/editar/editar-casa-client', () => ({
  EditarCasaClient: ({ mostrarSelectorUsuario, usuarios }: { mostrarSelectorUsuario: boolean; usuarios: Array<{ label: string }> }) => (
    <section>
      <span data-testid="editar-selector-visible">{String(mostrarSelectorUsuario)}</span>
      {usuarios.map((usuario) => <p key={usuario.label}>{usuario.label}</p>)}
    </section>
  ),
}))

const authId = '11111111-1111-1111-1111-111111111111'
const casaId = '22222222-2222-2222-2222-222222222222'
const allowedUserId = '33333333-3333-3333-3333-333333333333'
const deniedUserId = '44444444-4444-4444-4444-444444444444'
const usedUserId = '55555555-5555-5555-5555-555555555555'
const groupId = '66666666-6666-6666-6666-666666666666'
const otherGroupId = '77777777-7777-7777-7777-777777777777'
const otherCasaId = '88888888-8888-8888-8888-888888888888'
const reviewId = '99999999-9999-9999-9999-999999999999'

describe('casas anfitrionas App Router permission wiring', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    createSupabaseServerClient.mockResolvedValue(createServerClient())
    createSupabaseAdminClient.mockReturnValue(createAdminClient())
    mockAsignarCasaAnfitrionaAGrupo.mockResolvedValue({ success: true, data: { ok: true, grupo_id: groupId, casa_id: casaId } })
    mockListarCasasAnfitrionas.mockResolvedValue({ success: true, data: [createCandidateCasa()] })
    mockObtenerCasasRevisionPendiente.mockResolvedValue({ success: true, data: [createPendingReview()] })
    mockObtenerGruposSinCasaAnfitriona.mockResolvedValue({ success: true, data: [createMissingGroup()] })
    mockProcesarRevisionUbicacionCasa.mockResolvedValue({ success: true, data: { ok: true, accion: 'aprobar', review_id: reviewId } })
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('shows list page primary action and FAB only when backend create flags allow them', async () => {
    createSupabaseServerClient.mockResolvedValue(createServerClient({ canCreateOwn: true }))
    const { default: CasasAnfitrionasPage } = await import('@/app/(auth)/grupos-vida/casas-anfitrionas/page')

    render(await CasasAnfitrionasPage())

    expect(screen.getByRole('link', { name: 'Registrar casa' })).toHaveAttribute('href', '/grupos-vida/casas-anfitrionas/nueva')
    expect(screen.getByRole('link', { name: 'Registrar casa anfitriona' })).toHaveAttribute('href', '/grupos-vida/casas-anfitrionas/nueva')
  })

  it('hides list page primary action and FAB when backend create flags deny them', async () => {
    createSupabaseServerClient.mockResolvedValue(createServerClient({ canCreateOwn: false, canCreateForOthers: false }))
    const { default: CasasAnfitrionasPage } = await import('@/app/(auth)/grupos-vida/casas-anfitrionas/page')

    render(await CasasAnfitrionasPage())

    expect(screen.queryByRole('link', { name: 'Registrar casa' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Registrar casa anfitriona' })).not.toBeInTheDocument()
  })

  it('queries enriched list rows only for backend-visible house ids', async () => {
    const visibleCasaIds = [casaId]
    const casasQuery = createCasasListQuery([])
    createSupabaseServerClient.mockResolvedValue(createServerClient({ visibleCasaIds }))
    createSupabaseAdminClient.mockReturnValue(createAdminClient({ casasListQuery: casasQuery }))
    const { default: CasasAnfitrionasPage } = await import('@/app/(auth)/grupos-vida/casas-anfitrionas/page')

    render(await CasasAnfitrionasPage())

    expect(casasQuery.in).toHaveBeenCalledWith('id', visibleCasaIds)
  })

  it('denies detail access before creating the admin client when visibility RPC rejects the house', async () => {
    createSupabaseServerClient.mockResolvedValue(createServerClient({ canViewDetail: false }))
    const { default: DetalleCasaAnfitrionaPage } = await import('@/app/(auth)/grupos-vida/casas-anfitrionas/[id]/page')

    await expect(DetalleCasaAnfitrionaPage({ params: Promise.resolve({ id: casaId }) })).rejects.toThrow('notFound')

    const serverClient = await createSupabaseServerClient.mock.results[0].value
    expect(serverClient.rpc).toHaveBeenCalledWith('puede_ver_casa_anfitriona', { p_auth_id: authId, p_casa_id: casaId })
    expect(createSupabaseAdminClient).not.toHaveBeenCalled()
  })

  it('renders detail edit and approval controls from backend permission booleans', async () => {
    createSupabaseServerClient.mockResolvedValue(createServerClient({ canApprove: true, canEdit: true }))
    const { default: DetalleCasaAnfitrionaPage } = await import('@/app/(auth)/grupos-vida/casas-anfitrionas/[id]/page')

    render(await DetalleCasaAnfitrionaPage({ params: Promise.resolve({ id: casaId }) }))

    expect(screen.getByRole('link', { name: 'Editar' })).toHaveAttribute('href', `/grupos-vida/casas-anfitrionas/${casaId}/editar`)
    expect(screen.getByRole('button', { name: 'Aprobar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Rechazar' })).toBeInTheDocument()
  })

  it('hides detail edit and approval controls when backend permission booleans deny them', async () => {
    createSupabaseServerClient.mockResolvedValue(createServerClient({ canApprove: false, canEdit: false }))
    const { default: DetalleCasaAnfitrionaPage } = await import('@/app/(auth)/grupos-vida/casas-anfitrionas/[id]/page')

    render(await DetalleCasaAnfitrionaPage({ params: Promise.resolve({ id: casaId }) }))

    expect(screen.queryByRole('link', { name: 'Editar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Aprobar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Rechazar' })).not.toBeInTheDocument()
  })

  it('lets the new page render from backend create permissions without preloading assignable users', async () => {
    createSupabaseServerClient.mockResolvedValue(createServerClient({
      assignableUserIds: [allowedUserId],
      canCreateForOthers: true,
      canCreateOwn: true,
    }))
    const { default: NuevaCasaAnfitrionaPage } = await import('@/app/(auth)/grupos-vida/casas-anfitrionas/nueva/page')

    render(await NuevaCasaAnfitrionaPage())

    const serverClient = await createSupabaseServerClient.mock.results[0].value
    expect(serverClient.rpc).toHaveBeenCalledWith('obtener_permisos_casa_anfitriona', { p_auth_id: authId })
    expect(serverClient.rpc).not.toHaveBeenCalledWith('puede_crear_casa_anfitriona_para', expect.anything())
    expect(createSupabaseAdminClient).not.toHaveBeenCalled()
    expect(screen.getByTestId('nueva-selector-visible')).toHaveTextContent('true')
  })

  it('denies edit access with the granular edit predicate before enriched admin reads', async () => {
    createSupabaseServerClient.mockResolvedValue(createServerClient({ canEdit: false }))
    const { default: EditarCasaAnfitrionaPage } = await import('@/app/(auth)/grupos-vida/casas-anfitrionas/[id]/editar/page')

    await expect(EditarCasaAnfitrionaPage({ params: Promise.resolve({ id: casaId }) })).rejects.toThrow(
      'redirect:/grupos-vida/casas-anfitrionas'
    )

    const serverClient = await createSupabaseServerClient.mock.results[0].value
    expect(serverClient.rpc).toHaveBeenCalledWith('puede_editar_casa_anfitriona', { p_auth_id: authId, p_casa_id: casaId })
    expect(createSupabaseAdminClient).not.toHaveBeenCalled()
  })

  it('renders edit owner selector with only the current owner preloaded', async () => {
    createSupabaseServerClient.mockResolvedValue(createServerClient({
      assignableUserIds: [allowedUserId],
      canCreateForOthers: true,
      canEdit: true,
    }))
    createSupabaseAdminClient.mockReturnValue(createAdminClient({
      existingCasas: [{ id: '66666666-6666-6666-6666-666666666666', usuario_id: usedUserId, co_anfitrion_id: null }],
      users: [
        { id: allowedUserId, nombre: 'Ana', apellido: 'Permitida' },
        { id: deniedUserId, nombre: 'Beto', apellido: 'Fuera de scope' },
        { id: usedUserId, nombre: 'Casa', apellido: 'Existente' },
      ],
    }))
    const { default: EditarCasaAnfitrionaPage } = await import('@/app/(auth)/grupos-vida/casas-anfitrionas/[id]/editar/page')

    render(await EditarCasaAnfitrionaPage({ params: Promise.resolve({ id: casaId }) }))

    const serverClient = await createSupabaseServerClient.mock.results[0].value
    expect(serverClient.rpc).toHaveBeenCalledWith('puede_editar_casa_anfitriona', { p_auth_id: authId, p_casa_id: casaId })
    expect(serverClient.rpc).toHaveBeenCalledWith('obtener_permisos_casa_anfitriona', { p_auth_id: authId, p_casa_id: casaId })
    expect(serverClient.rpc).not.toHaveBeenCalledWith('puede_crear_casa_anfitriona_para', expect.anything())
    expect(screen.getByTestId('editar-selector-visible')).toHaveTextContent('true')
    expect(screen.getByText('Ana Pérez')).toBeInTheDocument()
    expect(screen.queryByText('Ana Permitida')).not.toBeInTheDocument()
    expect(screen.queryByText('Beto Fuera de scope')).not.toBeInTheDocument()
    expect(screen.queryByText('Casa Existente')).not.toBeInTheDocument()
  })

  it('renders the assignment page from scoped missing groups and approved active Casas only', async () => {
    const { default: AsignarCasaAnfitrionaPage } = await import('@/app/(auth)/grupos-vida/casas-anfitrionas/asignar/page')

    render(await AsignarCasaAnfitrionaPage())

    expect(mockObtenerGruposSinCasaAnfitriona).toHaveBeenCalledWith({ scope: 'active' })
    expect(mockListarCasasAnfitrionas).toHaveBeenCalledWith({ soloActivas: true, soloAprobadas: true })
    expect(screen.getByRole('heading', { name: 'Asignar Casa Anfitriona' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Grupo Norte — Líderes: Luis Barreto, Blanca Rojas de Barreto · Jóvenes · 2026' })).toBeInTheDocument()
    expect(screen.getByText('Grupo Norte')).toBeInTheDocument()
    expect(screen.getByText('Líderes: Luis Barreto, Blanca Rojas de Barreto · Jóvenes · 2026')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Casa de Ana — Ana Pérez · Capacidad 12' })).toBeInTheDocument()
    expect(screen.getByText('Casa de Ana')).toBeInTheDocument()
    expect(screen.getByText('Ana Pérez · Capacidad 12')).toBeInTheDocument()
  })

  it('preselects the assignment group from a valid grupoId search param', async () => {
    const { default: AsignarCasaAnfitrionaPage } = await import('@/app/(auth)/grupos-vida/casas-anfitrionas/asignar/page')

    render(await AsignarCasaAnfitrionaPage({ searchParams: Promise.resolve({ grupoId: groupId }) }))

    expect(screen.getByLabelText('Grupo de Vida')).toHaveValue(groupId)
  })

  it('does not preselect a stale grupoId search param that is not in the assignment queue', async () => {
    const { default: AsignarCasaAnfitrionaPage } = await import('@/app/(auth)/grupos-vida/casas-anfitrionas/asignar/page')

    render(await AsignarCasaAnfitrionaPage({ searchParams: Promise.resolve({ grupoId: otherGroupId }) }))

    expect(screen.getByLabelText('Grupo de Vida')).toHaveValue('')
  })

  it('ignores repeated grupoId search params as ambiguous', async () => {
    const { default: AsignarCasaAnfitrionaPage } = await import('@/app/(auth)/grupos-vida/casas-anfitrionas/asignar/page')

    render(await AsignarCasaAnfitrionaPage({ searchParams: Promise.resolve({ grupoId: [groupId, otherGroupId] }) }))

    expect(screen.getByLabelText('Grupo de Vida')).toHaveValue('')
  })

  it('renders assignment empty states only when group and Casa loads succeed with empty arrays', async () => {
    mockObtenerGruposSinCasaAnfitriona.mockResolvedValue({ success: true, data: [] })
    mockListarCasasAnfitrionas.mockResolvedValue({ success: true, data: [] })
    const { default: AsignarCasaAnfitrionaPage } = await import('@/app/(auth)/grupos-vida/casas-anfitrionas/asignar/page')

    render(await AsignarCasaAnfitrionaPage())

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText('No hay grupos activos sin Casa Anfitriona.')).toBeInTheDocument()
    expect(screen.getByText('No hay Casas aprobadas y activas disponibles.')).toBeInTheDocument()
  })

  it('renders an actionable assignment load error instead of collapsing failures to empty states', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    mockObtenerGruposSinCasaAnfitriona.mockResolvedValue({ success: false, error: 'Usuario no encontrado' })
    mockListarCasasAnfitrionas.mockResolvedValue({ success: true, data: [] })
    const { default: AsignarCasaAnfitrionaPage } = await import('@/app/(auth)/grupos-vida/casas-anfitrionas/asignar/page')

    render(await AsignarCasaAnfitrionaPage())

    expect(consoleError).toHaveBeenCalledWith('[casas-anfitrionas.asignar] Assignment loader failed', expect.objectContaining({
      loader: 'groups',
      status: 'fulfilled',
      success: false,
      error: 'Usuario no encontrado',
    }))
    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cargar los grupos pendientes')
    expect(screen.getByRole('link', { name: 'Reintentar carga' })).toHaveAttribute('href', '/grupos-vida/casas-anfitrionas/asignar')
    expect(screen.getByRole('link', { name: 'Volver al dashboard' })).toHaveAttribute('href', '/dashboard')
    expect(screen.queryByText('No hay grupos activos sin Casa Anfitriona.')).not.toBeInTheDocument()
  })

  it('does not render raw backend/provider errors from assignment Casa loading', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    const rawProviderError = 'Supabase PostgREST error: relation "internal_private.casas" does not exist'
    mockObtenerGruposSinCasaAnfitriona.mockResolvedValue({ success: true, data: [] })
    mockListarCasasAnfitrionas.mockResolvedValue({ success: false, error: rawProviderError })
    const { default: AsignarCasaAnfitrionaPage } = await import('@/app/(auth)/grupos-vida/casas-anfitrionas/asignar/page')

    render(await AsignarCasaAnfitrionaPage())

    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cargar las Casas disponibles')
    expect(screen.queryByText(rawProviderError)).not.toBeInTheDocument()
    expect(consoleError).toHaveBeenCalledWith('[casas-anfitrionas.asignar] Assignment loader failed', expect.objectContaining({
      loader: 'casas',
      error: 'Assignment loader failure details redacted',
    }))
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain('internal_private.casas')
  })

  it('renders assignment load error when a loader rejects instead of crashing', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    mockObtenerGruposSinCasaAnfitriona.mockRejectedValue(new Error('network provider timeout: service key leaked'))
    mockListarCasasAnfitrionas.mockResolvedValue({ success: true, data: [] })
    const { default: AsignarCasaAnfitrionaPage } = await import('@/app/(auth)/grupos-vida/casas-anfitrionas/asignar/page')

    render(await AsignarCasaAnfitrionaPage())

    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cargar los grupos pendientes')
    expect(screen.queryByText(/service key leaked/i)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Reintentar carga' })).toHaveAttribute('href', '/grupos-vida/casas-anfitrionas/asignar')
    expect(consoleError).toHaveBeenCalledWith('[casas-anfitrionas.asignar] Assignment loader failed', expect.objectContaining({
      loader: 'groups',
      status: 'rejected',
      error: { name: 'Error', message: 'Assignment loader exception details redacted' },
    }))
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain('service key leaked')
  })

  it('redacts sensitive names from rejected non-Error assignment loaders', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    const sensitiveName = 'Supabase PostgREST service key leaked: internal_private.casas'
    mockObtenerGruposSinCasaAnfitriona.mockRejectedValue({ name: sensitiveName })
    mockListarCasasAnfitrionas.mockResolvedValue({ success: true, data: [] })
    const { default: AsignarCasaAnfitrionaPage } = await import('@/app/(auth)/grupos-vida/casas-anfitrionas/asignar/page')

    render(await AsignarCasaAnfitrionaPage())

    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cargar los grupos pendientes')
    expect(consoleError).toHaveBeenCalledWith('[casas-anfitrionas.asignar] Assignment loader failed', expect.objectContaining({
      loader: 'groups',
      status: 'rejected',
      error: { message: 'Assignment loader exception details redacted' },
    }))
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(sensitiveName)
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain('internal_private.casas')
  })

  it('renders the review page from the scoped pending-review queue', async () => {
    const { default: RevisionCasaAnfitrionaPage } = await import('@/app/(auth)/grupos-vida/casas-anfitrionas/revision/page')

    render(await RevisionCasaAnfitrionaPage())

    expect(mockObtenerCasasRevisionPendiente).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('heading', { name: 'Revisión de Casas Anfitrionas' })).toBeInTheDocument()
    expect(screen.getByText('Casa de Ana')).toBeInTheDocument()
    expect(screen.getByText('Cambio de ubicación')).toBeInTheDocument()
    expect(screen.getByText('Solicitado por Ana Pérez')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Aprobar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Rechazar' })).toBeInTheDocument()
  })

  it('renders revision empty state only when the pending-review load succeeds empty', async () => {
    mockObtenerCasasRevisionPendiente.mockResolvedValue({ success: true, data: [] })
    const { default: RevisionCasaAnfitrionaPage } = await import('@/app/(auth)/grupos-vida/casas-anfitrionas/revision/page')

    render(await RevisionCasaAnfitrionaPage())

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText('No hay Casas Anfitrionas pendientes de revisión.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Volver al dashboard' })).toHaveAttribute('href', '/dashboard')
  })

  it('renders sanitized revision load errors instead of raw backend failures', async () => {
    const rawProviderError = 'Supabase PostgREST error: internal_private.location_reviews leaked'
    mockObtenerCasasRevisionPendiente.mockResolvedValue({ success: false, error: rawProviderError })
    const { default: RevisionCasaAnfitrionaPage } = await import('@/app/(auth)/grupos-vida/casas-anfitrionas/revision/page')

    render(await RevisionCasaAnfitrionaPage())

    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cargar las Casas pendientes de revisión')
    expect(screen.queryByText(rawProviderError)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Reintentar carga' })).toHaveAttribute('href', '/grupos-vida/casas-anfitrionas/revision')
    expect(screen.queryByText('No hay Casas Anfitrionas pendientes de revisión.')).not.toBeInTheDocument()
  })

  it('approves a pending review with notes and records the audited decision', async () => {
    const user = userEvent.setup()
    const { RevisionCasaClient } = await import('@/app/(auth)/grupos-vida/casas-anfitrionas/revision/revision-casa-client')

    render(<RevisionCasaClient reviews={[createPendingReviewOption()]} />)

    await user.type(screen.getByLabelText('Notas de revisión para Casa de Ana'), 'Coordenadas verificadas')
    await user.click(screen.getByRole('button', { name: 'Aprobar' }))

    expect(mockProcesarRevisionUbicacionCasa).toHaveBeenCalledWith({ reviewId, accion: 'aprobar', notas: 'Coordenadas verificadas' })
    expect(mockToastSuccess).toHaveBeenCalledWith('Revisión aprobada correctamente')
    expect(mockRouterRefresh).toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent('La decisión quedó registrada en la auditoría.')
    expect(screen.queryByText('Casa de Ana')).not.toBeInTheDocument()
  })

  it('shows the notes limit and accepts notes at the valid boundary', async () => {
    const user = userEvent.setup()
    const boundaryNotes = 'x'.repeat(REVIEW_DECISION_NOTES_MAX_LENGTH)
    const { RevisionCasaClient } = await import('@/app/(auth)/grupos-vida/casas-anfitrionas/revision/revision-casa-client')

    render(<RevisionCasaClient reviews={[createPendingReviewOption()]} />)

    expect(screen.getByText(`Máximo ${REVIEW_DECISION_NOTES_MAX_LENGTH} caracteres.`)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Notas de revisión para Casa de Ana'), { target: { value: boundaryNotes } })
    await user.click(screen.getByRole('button', { name: 'Aprobar' }))

    expect(mockProcesarRevisionUbicacionCasa).toHaveBeenCalledWith({ reviewId, accion: 'aprobar', notas: boundaryNotes })
    expect(mockToastSuccess).toHaveBeenCalledWith('Revisión aprobada correctamente')
  })

  it('blocks over-limit review notes with clear shorten guidance before submitting', async () => {
    const user = userEvent.setup()
    const { RevisionCasaClient } = await import('@/app/(auth)/grupos-vida/casas-anfitrionas/revision/revision-casa-client')

    render(<RevisionCasaClient reviews={[createPendingReviewOption()]} />)

    fireEvent.change(screen.getByLabelText('Notas de revisión para Casa de Ana'), {
      target: { value: 'x'.repeat(REVIEW_DECISION_NOTES_MAX_LENGTH + 1) },
    })
    await user.click(screen.getByRole('button', { name: 'Aprobar' }))

    expect(screen.getByRole('alert')).toHaveTextContent(`Acorta las notas a ${REVIEW_DECISION_NOTES_MAX_LENGTH} caracteres o menos.`)
    expect(mockToastError).toHaveBeenCalledWith(`Acorta las notas a ${REVIEW_DECISION_NOTES_MAX_LENGTH} caracteres o menos.`)
    expect(mockProcesarRevisionUbicacionCasa).not.toHaveBeenCalled()
    expect(mockRouterRefresh).not.toHaveBeenCalled()
  })

  it('disables review controls and shows loading feedback while a decision is pending', async () => {
    const user = userEvent.setup()
    let resolveReview: (value: { success: true; data: { ok: true; accion: 'aprobar'; review_id: string } }) => void = () => undefined
    mockProcesarRevisionUbicacionCasa.mockReturnValue(new Promise((resolve) => { resolveReview = resolve }))
    const { RevisionCasaClient } = await import('@/app/(auth)/grupos-vida/casas-anfitrionas/revision/revision-casa-client')

    render(<RevisionCasaClient reviews={[createPendingReviewOption()]} />)

    await user.click(screen.getByRole('button', { name: 'Aprobar' }))

    expect(screen.getByRole('button', { name: 'Aprobar' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Rechazar' })).toBeDisabled()
    expect(screen.getByLabelText('Notas de revisión para Casa de Ana')).toBeDisabled()

    resolveReview({ success: true, data: { ok: true, accion: 'aprobar', review_id: reviewId } })
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('La decisión quedó registrada en la auditoría.'))
  })

  it('prevents rapid double-submit from calling the review action more than once', async () => {
    let resolveReview: (value: { success: true; data: { ok: true; accion: 'aprobar'; review_id: string } }) => void = () => undefined
    mockProcesarRevisionUbicacionCasa.mockReturnValue(new Promise((resolve) => { resolveReview = resolve }))
    const { RevisionCasaClient } = await import('@/app/(auth)/grupos-vida/casas-anfitrionas/revision/revision-casa-client')

    render(<RevisionCasaClient reviews={[createPendingReviewOption()]} />)

    const approve = screen.getByRole('button', { name: 'Aprobar' })
    fireEvent.click(approve)
    fireEvent.click(approve)

    expect(mockProcesarRevisionUbicacionCasa).toHaveBeenCalledTimes(1)
    resolveReview({ success: true, data: { ok: true, accion: 'aprobar', review_id: reviewId } })
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('La decisión quedó registrada en la auditoría.'))
  })

  it('records a successful reject decision and removes it from the queue', async () => {
    const user = userEvent.setup()
    mockProcesarRevisionUbicacionCasa.mockResolvedValue({ success: true, data: { ok: true, accion: 'rechazar', review_id: reviewId } })
    const { RevisionCasaClient } = await import('@/app/(auth)/grupos-vida/casas-anfitrionas/revision/revision-casa-client')

    render(<RevisionCasaClient reviews={[createPendingReviewOption()]} />)

    await user.click(screen.getByRole('button', { name: 'Rechazar' }))

    expect(mockProcesarRevisionUbicacionCasa).toHaveBeenCalledWith({ reviewId, accion: 'rechazar', notas: null })
    expect(mockToastSuccess).toHaveBeenCalledWith('Revisión rechazada correctamente')
    expect(mockRouterRefresh).toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent('La decisión quedó registrada en la auditoría.')
    expect(screen.queryByText('Casa de Ana')).not.toBeInTheDocument()
  })

  it('rejects a pending review without leaking raw mutation errors', async () => {
    const user = userEvent.setup()
    const rawProviderError = 'database leaked internal table name casa_anfitriona_audit_events'
    mockProcesarRevisionUbicacionCasa.mockResolvedValue({ success: false, error: rawProviderError })
    const { RevisionCasaClient } = await import('@/app/(auth)/grupos-vida/casas-anfitrionas/revision/revision-casa-client')

    render(<RevisionCasaClient reviews={[createPendingReviewOption()]} />)

    await user.click(screen.getByRole('button', { name: 'Rechazar' }))

    expect(mockProcesarRevisionUbicacionCasa).toHaveBeenCalledWith({ reviewId, accion: 'rechazar', notas: null })
    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos procesar la revisión. Actualiza la cola y vuelve a intentarlo.')
    expect(screen.queryByText(rawProviderError)).not.toBeInTheDocument()
    expect(mockToastError).toHaveBeenCalledWith('No pudimos procesar la revisión. Actualiza la cola y vuelve a intentarlo.')
    expect(mockRouterRefresh).not.toHaveBeenCalled()
  })

  it('uses distinguishing details in duplicate group and Casa select option labels', async () => {
    const { AsignarCasaAnfitrionaClient } = await import('@/app/(auth)/grupos-vida/casas-anfitrionas/asignar/asignar-casa-client')

    render(
      <AsignarCasaAnfitrionaClient
        casas={[
          createAssignmentCasaOption(),
          { id: otherCasaId, name: 'Casa de Ana', details: 'Luis Pérez · Capacidad 20' },
        ]}
        grupos={[
          createAssignmentGroupOption(),
          { id: otherGroupId, name: 'Grupo Norte', details: 'Adultos · 2026' },
        ]}
      />
    )

    expect(screen.getByRole('option', { name: 'Grupo Norte — Líderes: Luis Barreto, Blanca Rojas de Barreto · Jóvenes · 2026' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Grupo Norte — Adultos · 2026' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Casa de Ana — Ana Pérez · Capacidad 12' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Casa de Ana — Luis Pérez · Capacidad 20' })).toBeInTheDocument()
  })

  it('filters assignment groups by group, leader, segment, and season search text', async () => {
    const user = userEvent.setup()
    const { AsignarCasaAnfitrionaClient } = await import('@/app/(auth)/grupos-vida/casas-anfitrionas/asignar/asignar-casa-client')
    const grupos = [
      createAssignmentGroupOption(),
      { id: otherGroupId, name: 'Grupo Sur', details: 'Líderes: Marta Díaz · Matrimonios · 2026-I' },
    ]

    render(<AsignarCasaAnfitrionaClient casas={[createAssignmentCasaOption()]} grupos={grupos} />)

    const search = screen.getByLabelText('Buscar grupo')
    await user.type(search, 'Blanca')

    expect(screen.getByRole('option', { name: 'Grupo Norte — Líderes: Luis Barreto, Blanca Rojas de Barreto · Jóvenes · 2026' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Grupo Sur — Líderes: Marta Díaz · Matrimonios · 2026-I' })).not.toBeInTheDocument()
    expect(screen.getByText('Grupo Norte')).toBeInTheDocument()
    expect(screen.queryByText('Grupo Sur')).not.toBeInTheDocument()

    await user.clear(search)
    await user.type(search, '2026-I')

    expect(screen.queryByRole('option', { name: 'Grupo Norte — Líderes: Luis Barreto, Blanca Rojas de Barreto · Jóvenes · 2026' })).not.toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Grupo Sur — Líderes: Marta Díaz · Matrimonios · 2026-I' })).toBeInTheDocument()
    expect(screen.queryByText('Grupo Norte')).not.toBeInTheDocument()
    expect(screen.getByText('Grupo Sur')).toBeInTheDocument()

    await user.clear(search)
    await user.type(search, 'Matrimonios')

    expect(screen.getByRole('option', { name: 'Grupo Sur — Líderes: Marta Díaz · Matrimonios · 2026-I' })).toBeInTheDocument()
  })

  it('keeps the selected assignment group valid when search text would hide it', async () => {
    const user = userEvent.setup()
    const { AsignarCasaAnfitrionaClient } = await import('@/app/(auth)/grupos-vida/casas-anfitrionas/asignar/asignar-casa-client')
    const grupos = [
      createAssignmentGroupOption(),
      { id: otherGroupId, name: 'Grupo Sur', details: 'Líderes: Marta Díaz · Matrimonios · 2026-I' },
    ]

    render(<AsignarCasaAnfitrionaClient casas={[createAssignmentCasaOption()]} grupos={grupos} />)

    await user.selectOptions(screen.getByLabelText('Grupo de Vida'), groupId)
    await user.type(screen.getByLabelText('Buscar grupo'), 'Marta')

    expect(screen.getByLabelText('Grupo de Vida')).toHaveValue(groupId)
    expect(screen.getByRole('option', { name: 'Grupo Norte — Líderes: Luis Barreto, Blanca Rojas de Barreto · Jóvenes · 2026' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Grupo Sur — Líderes: Marta Díaz · Matrimonios · 2026-I' })).toBeInTheDocument()
  })

  it('shows clear empty copy when group search has no matches', async () => {
    const user = userEvent.setup()
    const { AsignarCasaAnfitrionaClient } = await import('@/app/(auth)/grupos-vida/casas-anfitrionas/asignar/asignar-casa-client')

    render(<AsignarCasaAnfitrionaClient casas={[createAssignmentCasaOption()]} grupos={[createAssignmentGroupOption()]} />)

    await user.type(screen.getByLabelText('Buscar grupo'), 'sin coincidencias')

    expect(screen.getByText('No hay grupos que coincidan con la búsqueda.')).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Grupo Norte — Líderes: Luis Barreto, Blanca Rojas de Barreto · Jóvenes · 2026' })).not.toBeInTheDocument()
  })

  it('submits the selected group and Casa through the assignment action', async () => {
    const user = userEvent.setup()
    const { AsignarCasaAnfitrionaClient } = await import('@/app/(auth)/grupos-vida/casas-anfitrionas/asignar/asignar-casa-client')

    render(
      <AsignarCasaAnfitrionaClient
        casas={[createAssignmentCasaOption()]}
        grupos={[createAssignmentGroupOption()]}
      />
    )

    await user.selectOptions(screen.getByLabelText('Grupo de Vida'), groupId)
    await user.selectOptions(screen.getByLabelText('Casa Anfitriona'), casaId)
    await user.click(screen.getByRole('button', { name: 'Asignar Casa Anfitriona' }))

    expect(mockAsignarCasaAnfitrionaAGrupo).toHaveBeenCalledWith({ groupId, casaId })
    expect(mockToastSuccess).toHaveBeenCalledWith('Casa Anfitriona asignada correctamente')
    expect(mockRouterRefresh).toHaveBeenCalled()
    expect(screen.getByText('Asignación guardada. El grupo salió de la cola de grupos sin Casa Anfitriona.')).toBeInTheDocument()
    expect(screen.getByLabelText('Grupo de Vida')).toHaveValue('')
    expect(screen.getByLabelText('Casa Anfitriona')).toHaveValue('')
  })

  it('initializes the selected group from a valid initialGroupId', async () => {
    const user = userEvent.setup()
    const { AsignarCasaAnfitrionaClient } = await import('@/app/(auth)/grupos-vida/casas-anfitrionas/asignar/asignar-casa-client')

    render(
      <AsignarCasaAnfitrionaClient
        casas={[createAssignmentCasaOption()]}
        grupos={[createAssignmentGroupOption()]}
        initialGroupId={groupId}
      />
    )

    expect(screen.getByLabelText('Grupo de Vida')).toHaveValue(groupId)

    await user.selectOptions(screen.getByLabelText('Casa Anfitriona'), casaId)
    await user.click(screen.getByRole('button', { name: 'Asignar Casa Anfitriona' }))

    expect(mockAsignarCasaAnfitrionaAGrupo).toHaveBeenCalledWith({ groupId, casaId })
  })

  it('updates the selected group when initialGroupId changes without clearing the selected Casa', async () => {
    const user = userEvent.setup()
    const { AsignarCasaAnfitrionaClient } = await import('@/app/(auth)/grupos-vida/casas-anfitrionas/asignar/asignar-casa-client')
    const grupos = [
      createAssignmentGroupOption(),
      { id: otherGroupId, name: 'Grupo Sur', details: 'Adultos · 2026' },
    ]

    const { rerender } = render(
      <AsignarCasaAnfitrionaClient
        casas={[createAssignmentCasaOption()]}
        grupos={grupos}
        initialGroupId={groupId}
      />
    )

    await user.selectOptions(screen.getByLabelText('Casa Anfitriona'), casaId)
    rerender(
      <AsignarCasaAnfitrionaClient
        casas={[createAssignmentCasaOption()]}
        grupos={grupos}
        initialGroupId={otherGroupId}
      />
    )

    await waitFor(() => expect(screen.getByLabelText('Grupo de Vida')).toHaveValue(otherGroupId))
    expect(screen.getByLabelText('Casa Anfitriona')).toHaveValue(casaId)

    await user.click(screen.getByRole('button', { name: 'Asignar Casa Anfitriona' }))

    expect(mockAsignarCasaAnfitrionaAGrupo).toHaveBeenCalledWith({ groupId: otherGroupId, casaId })
  })

  it('selects initialGroupId when it becomes valid after the assignment queue changes', async () => {
    const { AsignarCasaAnfitrionaClient } = await import('@/app/(auth)/grupos-vida/casas-anfitrionas/asignar/asignar-casa-client')

    const { rerender } = render(
      <AsignarCasaAnfitrionaClient
        casas={[createAssignmentCasaOption()]}
        grupos={[{ id: otherGroupId, name: 'Grupo Sur', details: 'Adultos · 2026' }]}
        initialGroupId={groupId}
      />
    )

    expect(screen.getByLabelText('Grupo de Vida')).toHaveValue('')

    rerender(
      <AsignarCasaAnfitrionaClient
        casas={[createAssignmentCasaOption()]}
        grupos={[createAssignmentGroupOption()]}
        initialGroupId={groupId}
      />
    )

    await waitFor(() => expect(screen.getByLabelText('Grupo de Vida')).toHaveValue(groupId))
  })

  it('keeps a manually selected group when the queue refreshes with the same initialGroupId', async () => {
    const user = userEvent.setup()
    const { AsignarCasaAnfitrionaClient } = await import('@/app/(auth)/grupos-vida/casas-anfitrionas/asignar/asignar-casa-client')
    const grupos = [
      createAssignmentGroupOption(),
      { id: otherGroupId, name: 'Grupo Sur', details: 'Adultos · 2026' },
    ]
    const refreshedGrupos = [
      createAssignmentGroupOption(),
      { id: otherGroupId, name: 'Grupo Sur', details: 'Adultos · 2026' },
    ]

    const { rerender } = render(
      <AsignarCasaAnfitrionaClient
        casas={[createAssignmentCasaOption()]}
        grupos={grupos}
        initialGroupId={groupId}
      />
    )

    expect(screen.getByLabelText('Grupo de Vida')).toHaveValue(groupId)

    await user.selectOptions(screen.getByLabelText('Grupo de Vida'), otherGroupId)
    expect(screen.getByLabelText('Grupo de Vida')).toHaveValue(otherGroupId)

    rerender(
      <AsignarCasaAnfitrionaClient
        casas={[createAssignmentCasaOption()]}
        grupos={refreshedGrupos}
        initialGroupId={groupId}
      />
    )

    await waitFor(() => expect(screen.getByLabelText('Grupo de Vida')).toHaveValue(otherGroupId))
  })

  it('surfaces assignment action failures with retry guidance without refreshing', async () => {
    const user = userEvent.setup()
    mockAsignarCasaAnfitrionaAGrupo.mockResolvedValue({ success: false, error: 'El grupo ya no está en la cola de asignación.' })
    const { AsignarCasaAnfitrionaClient } = await import('@/app/(auth)/grupos-vida/casas-anfitrionas/asignar/asignar-casa-client')

    render(<AsignarCasaAnfitrionaClient casas={[createAssignmentCasaOption()]} grupos={[createAssignmentGroupOption()]} />)

    await user.selectOptions(screen.getByLabelText('Grupo de Vida'), groupId)
    await user.selectOptions(screen.getByLabelText('Casa Anfitriona'), casaId)
    await user.click(screen.getByRole('button', { name: 'Asignar Casa Anfitriona' }))

    expect(screen.getByRole('alert')).toHaveTextContent('El grupo ya no está en la cola de asignación. Actualiza la cola y vuelve a intentarlo.')
    expect(mockToastError).toHaveBeenCalledWith('El grupo ya no está en la cola de asignación. Actualiza la cola y vuelve a intentarlo.')
    expect(mockRouterRefresh).not.toHaveBeenCalled()
  })

  it('surfaces rejected assignment actions with safe retry guidance', async () => {
    const user = userEvent.setup()
    mockAsignarCasaAnfitrionaAGrupo.mockRejectedValue(new Error('network down'))
    const { AsignarCasaAnfitrionaClient } = await import('@/app/(auth)/grupos-vida/casas-anfitrionas/asignar/asignar-casa-client')

    render(<AsignarCasaAnfitrionaClient casas={[createAssignmentCasaOption()]} grupos={[createAssignmentGroupOption()]} />)

    await user.selectOptions(screen.getByLabelText('Grupo de Vida'), groupId)
    await user.selectOptions(screen.getByLabelText('Casa Anfitriona'), casaId)
    await user.click(screen.getByRole('button', { name: 'Asignar Casa Anfitriona' }))

    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos asignar la Casa Anfitriona. Actualiza la cola y vuelve a intentarlo.')
    expect(mockToastError).toHaveBeenCalledWith('No pudimos asignar la Casa Anfitriona. Actualiza la cola y vuelve a intentarlo.')
    expect(mockRouterRefresh).not.toHaveBeenCalled()
  })

  it('disables controls and shows loading feedback while assignment is pending', async () => {
    const user = userEvent.setup()
    let resolveAssignment: (value: { success: true; data: { ok: true; grupo_id: string; casa_id: string } }) => void = () => undefined
    mockAsignarCasaAnfitrionaAGrupo.mockReturnValue(new Promise((resolve) => { resolveAssignment = resolve }))
    const { AsignarCasaAnfitrionaClient } = await import('@/app/(auth)/grupos-vida/casas-anfitrionas/asignar/asignar-casa-client')

    render(<AsignarCasaAnfitrionaClient casas={[createAssignmentCasaOption()]} grupos={[createAssignmentGroupOption()]} />)

    await user.selectOptions(screen.getByLabelText('Grupo de Vida'), groupId)
    await user.selectOptions(screen.getByLabelText('Casa Anfitriona'), casaId)
    await user.click(screen.getByRole('button', { name: 'Asignar Casa Anfitriona' }))

    expect(screen.getByRole('button', { name: 'Asignar Casa Anfitriona' })).toBeDisabled()
    expect(screen.getByLabelText('Grupo de Vida')).toBeDisabled()
    expect(screen.getByLabelText('Casa Anfitriona')).toBeDisabled()

    resolveAssignment({ success: true, data: { ok: true, grupo_id: groupId, casa_id: casaId } })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Asignar Casa Anfitriona' })).toBeDisabled())
  })

  it('prevents rapid double-submit from calling the assignment action more than once', async () => {
    let resolveAssignment: (value: { success: true; data: { ok: true; grupo_id: string; casa_id: string } }) => void = () => undefined
    mockAsignarCasaAnfitrionaAGrupo.mockReturnValue(new Promise((resolve) => { resolveAssignment = resolve }))
    const { AsignarCasaAnfitrionaClient } = await import('@/app/(auth)/grupos-vida/casas-anfitrionas/asignar/asignar-casa-client')

    render(<AsignarCasaAnfitrionaClient casas={[createAssignmentCasaOption()]} grupos={[createAssignmentGroupOption()]} />)

    fireEvent.change(screen.getByLabelText('Grupo de Vida'), { target: { value: groupId } })
    fireEvent.change(screen.getByLabelText('Casa Anfitriona'), { target: { value: casaId } })
    const submit = screen.getByRole('button', { name: 'Asignar Casa Anfitriona' })
    fireEvent.click(submit)
    fireEvent.click(submit)

    expect(mockAsignarCasaAnfitrionaAGrupo).toHaveBeenCalledTimes(1)
    resolveAssignment({ success: true, data: { ok: true, grupo_id: groupId, casa_id: casaId } })
    await waitFor(() => expect(screen.getByText('Asignación guardada. El grupo salió de la cola de grupos sin Casa Anfitriona.')).toBeInTheDocument())
  })

  it('rejects stale selections that are no longer present in the current options before submitting', async () => {
    const user = userEvent.setup()
    const { AsignarCasaAnfitrionaClient } = await import('@/app/(auth)/grupos-vida/casas-anfitrionas/asignar/asignar-casa-client')

    const { rerender } = render(<AsignarCasaAnfitrionaClient casas={[createAssignmentCasaOption()]} grupos={[createAssignmentGroupOption()]} />)
    await user.selectOptions(screen.getByLabelText('Grupo de Vida'), groupId)
    await user.selectOptions(screen.getByLabelText('Casa Anfitriona'), casaId)

    rerender(<AsignarCasaAnfitrionaClient casas={[]} grupos={[]} />)
    await user.click(screen.getByRole('button', { name: 'Asignar Casa Anfitriona' }))

    expect(screen.getByRole('alert')).toHaveTextContent('La selección ya no está disponible. Actualiza la cola y vuelve a intentarlo.')
    expect(mockAsignarCasaAnfitrionaAGrupo).not.toHaveBeenCalled()
  })

})

function createMissingGroup() {
  return {
    grupo_id: groupId,
    grupo_nombre: 'Grupo Norte',
    estado_ciclo: 'activo',
    segmento: 'Jóvenes',
    temporada: '2026',
    lideres: ['Luis Barreto', 'Blanca Rojas de Barreto'],
  }
}

function createCandidateCasa() {
  return {
    id: casaId,
    nombre_lugar: 'Casa de Ana',
    capacidad_maxima: 12,
    activa: true,
    aprobada: true,
    usuarios: { id: allowedUserId, nombre: 'Ana', apellido: 'Pérez', foto_perfil_url: null },
  }
}

function createAssignmentGroupOption() {
  return { id: groupId, name: 'Grupo Norte', details: 'Líderes: Luis Barreto, Blanca Rojas de Barreto · Jóvenes · 2026' }
}

function createAssignmentCasaOption() {
  return { id: casaId, name: 'Casa de Ana', details: 'Ana Pérez · Capacidad 12' }
}

function createPendingReview() {
  return {
    review_id: reviewId,
    casa_id: casaId,
    casa_nombre: 'Casa de Ana',
    review_type: 'location_change' as const,
    created_at: '2026-06-21T12:00:00.000Z',
    requested_by: 'Ana Pérez',
  }
}

function createPendingReviewOption() {
  return {
    id: reviewId,
    casaId,
    name: 'Casa de Ana',
    type: 'location_change' as const,
    createdAt: '2026-06-21T12:00:00.000Z',
    requestedBy: 'Ana Pérez',
  }
}

function createServerClient(overrides: {
  assignableUserIds?: string[]
  canApprove?: boolean
  canCreateForOthers?: boolean
  canCreateOwn?: boolean
  canEdit?: boolean
  canViewDetail?: boolean
  visibleCasaIds?: string[]
} = {}) {
  return {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: authId } }, error: null }) },
    from: jest.fn((table: string) => createServerTableQuery(table)),
    rpc: jest.fn((name: string, args: Record<string, unknown>) => {
      if (name === 'obtener_casas_visibles_ids') return Promise.resolve({ data: overrides.visibleCasaIds ?? [], error: null })
      if (name === 'puede_crear_casa_anfitriona_para') {
        return Promise.resolve({ data: overrides.assignableUserIds?.includes(String(args.p_usuario_id)) ?? false, error: null })
      }
      if (name === 'puede_editar_casa_anfitriona') return Promise.resolve({ data: overrides.canEdit ?? true, error: null })
      if (name === 'puede_ver_casa_anfitriona') return Promise.resolve({ data: overrides.canViewDetail ?? true, error: null })
      if (name === 'obtener_permisos_casa_anfitriona') {
        return Promise.resolve({
          data: {
            puede_ver: true,
            puede_crear_propia: overrides.canCreateOwn ?? false,
            puede_crear_para_otros: overrides.canCreateForOthers ?? false,
            puede_aprobar: overrides.canApprove ?? false,
            puede_editar: overrides.canEdit ?? false,
            puede_cambiar_estado: false,
          },
          error: null,
        })
      }
      throw new Error(`Unexpected RPC ${name} with ${JSON.stringify(args)}`)
    }),
  }
}

function createAdminClient(overrides: {
  casasListQuery?: ReturnType<typeof createCasasListQuery>
  existingCasas?: Array<{ id?: string | null; usuario_id: string | null; co_anfitrion_id: string | null }>
  users?: Array<{ id: string; nombre: string; apellido: string }>
} = {}) {
  let casasAnfitrionasCalls = 0

  return {
    from: jest.fn((table: string) => {
      if (table === 'casas_anfitrionas') {
        casasAnfitrionasCalls += 1
        if (overrides.existingCasas && casasAnfitrionasCalls > 1) return createExistingCasasQuery(overrides.existingCasas)
        return overrides.casasListQuery ?? createCasasDetailQuery()
      }
      if (table === 'grupos') return createGruposQuery()
      if (table === 'relaciones_usuarios') return createRelacionesQuery()
      if (table === 'usuarios') return createUsuariosQuery(overrides.users)
      throw new Error(`Unexpected admin table ${table}`)
    }),
  }
}

function createServerTableQuery(table: string) {
  const locationRows: Record<string, unknown[]> = {
    estados: [],
    municipios: [],
    parroquias: [],
  }

  if (table in locationRows) return createSelectOrderQuery(locationRows[table])
  throw new Error(`Unexpected server table ${table}`)
}

function createCasasListQuery(rows: unknown[]) {
  return {
    in: jest.fn().mockReturnThis(),
    order: jest.fn().mockResolvedValue({ data: rows, error: null }),
    select: jest.fn().mockReturnThis(),
  }
}

function createCasasDetailQuery() {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({
      data: {
        id: casaId,
        activa: true,
        aprobada: false,
        capacidad_maxima: 10,
        creado_en: '2026-06-17T00:00:00.000Z',
        descripcion: null,
        direcciones: null,
        disponibilidad: [],
        nombre_lugar: 'Casa de Ana',
        notas_publicas: null,
        usuarios: { id: authId, nombre: 'Ana', apellido: 'Pérez', email: null, telefono: null, foto_perfil_url: null },
        co_anfitrion: null,
      },
      error: null,
    }),
  }
}

function createExistingCasasQuery(rows: Array<{ id?: string | null; usuario_id: string | null; co_anfitrion_id: string | null }> = []) {
  return {
    select: jest.fn().mockReturnThis(),
    then: (resolve: (value: { data: typeof rows; error: null }) => void) => resolve({ data: rows, error: null }),
  }
}

function createSelectOrderQuery(rows: unknown[]) {
  return {
    order: jest.fn().mockResolvedValue({ data: rows, error: null }),
    select: jest.fn().mockReturnThis(),
  }
}

function createGruposQuery() {
  return {
    select: jest.fn().mockReturnThis(),
    not: jest.fn().mockResolvedValue({ data: [], error: null }),
    eq: jest.fn().mockReturnThis(),
  }
}

function createRelacionesQuery() {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    or: jest.fn().mockResolvedValue({ data: null, error: null }),
  }
}

function createUsuariosQuery(rows: Array<{ id: string; nombre: string; apellido: string }> = []) {
  return {
    order: jest.fn().mockResolvedValue({ data: rows, error: null }),
    select: jest.fn().mockReturnThis(),
    in: jest.fn().mockResolvedValue({ data: null, error: null }),
  }
}
