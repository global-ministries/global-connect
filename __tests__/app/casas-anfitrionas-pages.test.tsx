import React from 'react'
import { render, screen } from '@testing-library/react'

const createSupabaseServerClient = jest.fn()
const createSupabaseAdminClient = jest.fn()
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
  useRouter: () => ({ refresh: jest.fn() }),
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
  BotonSistema: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
  ContenedorDashboard: ({ accionPrincipal, children, titulo }: { accionPrincipal?: React.ReactNode; children: React.ReactNode; titulo: string }) => (
    <section>
      <h1>{titulo}</h1>
      {accionPrincipal}
      {children}
    </section>
  ),
  SeparadorSistema: () => <hr />,
  TarjetaSistema: ({ children }: { children: React.ReactNode }) => <article>{children}</article>,
  TextareaSistema: ({ label }: { label: string }) => <label>{label}<textarea /></label>,
  TextoSistema: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  TituloSistema: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}))
jest.mock('@/hooks/use-notificaciones', () => ({ useNotificaciones: () => ({ success: jest.fn(), error: jest.fn() }) }))
jest.mock('@/lib/actions/casas-anfitrionas.actions', () => ({ procesarAprobacionCasa: jest.fn() }))

const authId = '11111111-1111-1111-1111-111111111111'
const casaId = '22222222-2222-2222-2222-222222222222'

describe('casas anfitrionas App Router permission wiring', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    createSupabaseServerClient.mockResolvedValue(createServerClient())
    createSupabaseAdminClient.mockReturnValue(createAdminClient())
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
})

function createServerClient(overrides: {
  canApprove?: boolean
  canCreateForOthers?: boolean
  canCreateOwn?: boolean
  canEdit?: boolean
  canViewDetail?: boolean
  visibleCasaIds?: string[]
} = {}) {
  return {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: authId } }, error: null }) },
    rpc: jest.fn((name: string, args: Record<string, unknown>) => {
      if (name === 'obtener_casas_visibles_ids') return Promise.resolve({ data: overrides.visibleCasaIds ?? [], error: null })
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

function createAdminClient(overrides: { casasListQuery?: ReturnType<typeof createCasasListQuery> } = {}) {
  return {
    from: jest.fn((table: string) => {
      if (table === 'casas_anfitrionas') return overrides.casasListQuery ?? createCasasDetailQuery()
      if (table === 'grupos') return createGruposQuery()
      if (table === 'relaciones_usuarios') return createRelacionesQuery()
      if (table === 'usuarios') return createUsuariosQuery()
      throw new Error(`Unexpected admin table ${table}`)
    }),
  }
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

function createUsuariosQuery() {
  return {
    select: jest.fn().mockReturnThis(),
    in: jest.fn().mockResolvedValue({ data: null, error: null }),
  }
}
