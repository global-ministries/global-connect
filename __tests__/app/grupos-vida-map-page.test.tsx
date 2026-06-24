import React from 'react'
import { render, screen, within } from '@testing-library/react'

const createSupabaseServerClient = jest.fn()
const obtenerDatosMapaGruposHostHomes = jest.fn()
const obtenerMapaMiembros = jest.fn()
const redirect = jest.fn((path: string) => {
  throw new Error(`redirect:${path}`)
})

jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => createSupabaseServerClient() }))
jest.mock('@/lib/actions/casas-anfitrionas.actions', () => ({
  obtenerDatosMapaGruposHostHomes: (input: unknown) => obtenerDatosMapaGruposHostHomes(input),
  obtenerMapaMiembros: (input: unknown) => obtenerMapaMiembros(input),
}))
jest.mock('next/navigation', () => ({ redirect: (path: string) => redirect(path) }))
jest.mock('@/components/layout/dashboard-layout', () => ({ DashboardLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }))
jest.mock('@/components/ui/sistema-diseno', () => ({
  BadgeSistema: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  ContenedorDashboard: ({ children, titulo }: { children: React.ReactNode; titulo: string }) => <section><h1>{titulo}</h1>{children}</section>,
  TarjetaSistema: ({ children, className, role }: { children: React.ReactNode; className?: string; role?: string }) => <section className={className} role={role}>{children}</section>,
  TextoSistema: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}))
jest.mock('@/components/grupos-vida/mapa-grupos-vida', () => ({
  MapaGruposVida: ({ grupos, miembros = [] }: {
    grupos: Array<{ nombre: string; casa_nombre?: string; barrio: string | null }>
    miembros?: Array<{ nombre: string; grupo_nombre: string }>
  }) => (
    <div>
      <div data-testid="map-probe">
        {grupos.map((grupo) => `${grupo.nombre}:${grupo.barrio ?? 'ubicación reservada'}:${'casa_nombre' in grupo ? grupo.casa_nombre : 'sin-nombre-privado'}`).join('|')}
      </div>
      {miembros.length > 0 && (
        <div data-testid="member-layer-probe">
          {miembros.map((miembro) => `${miembro.nombre}:${miembro.grupo_nombre}`).join('|')}
        </div>
      )}
    </div>
  ),
}))

describe('Life Group host-home map page', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    createSupabaseServerClient.mockResolvedValue(createAuthenticatedSupabase())
    obtenerDatosMapaGruposHostHomes.mockResolvedValue({ success: true, data: [createHostHomeRow()] })
    obtenerMapaMiembros.mockResolvedValue({ success: true, data: [] })
  })

  it('loads active host-home and authorized member map layers by default with privacy messaging', async () => {
    obtenerMapaMiembros.mockResolvedValue({ success: true, data: [createMemberMapRow()] })
    const { default: MapaGruposPage } = await import('@/app/(auth)/grupos-vida/mapa/page')

    render(await MapaGruposPage({ searchParams: Promise.resolve({}) }))

    expect(obtenerDatosMapaGruposHostHomes).toHaveBeenCalledWith({ scope: 'active' })
    expect(obtenerMapaMiembros).toHaveBeenCalledWith({ scope: 'active' })
    expect(screen.getByRole('heading', { name: 'Mapa de Grupos de Vida' })).toBeInTheDocument()
    expect(screen.getByText(/ubicaciones visibles provienen de Casas Anfitrionas aprobadas/i)).toBeInTheDocument()
    expect(screen.getByText(/La capa Miembros muestra ubicaciones exactas/i)).toBeInTheDocument()
    expect(screen.queryByText(/geocodificación masiva/i)).not.toBeInTheDocument()

    const filters = screen.getByRole('navigation', { name: 'Filtros del mapa de Grupos de Vida' })
    expect(within(filters).getByRole('link', { name: /Activos/i })).toHaveAttribute('href', '/grupos-vida/mapa')
    expect(within(filters).getByRole('link', { name: /Planificados/i })).toHaveAttribute('href', '/grupos-vida/mapa?scope=planned')
    expect(screen.getByTestId('map-probe')).toHaveTextContent('Grupo Centro:Centro:sin-nombre-privado')
    expect(screen.getByTestId('member-layer-probe')).toHaveTextContent('Juan Pérez:Grupo Norte')
    expect(screen.getByTestId('map-probe')).not.toHaveTextContent('Casa Robles')
  })

  it('uses the planned scope only when the planned filter is selected', async () => {
    obtenerDatosMapaGruposHostHomes.mockResolvedValue({ success: true, data: [createHostHomeRow({ estado_ciclo: 'proximo', grupo_nombre: 'Grupo Futuro', temporada: 'Temporada 2027' })] })
    const { default: MapaGruposPage } = await import('@/app/(auth)/grupos-vida/mapa/page')

    render(await MapaGruposPage({ searchParams: Promise.resolve({ scope: 'planned' }) }))

    expect(obtenerDatosMapaGruposHostHomes).toHaveBeenCalledWith({ scope: 'planned' })
    expect(obtenerMapaMiembros).toHaveBeenCalledWith({ scope: 'planned' })
    expect(screen.getByText('Mostrando grupos planificados')).toBeInTheDocument()
    expect(screen.getByTestId('map-probe')).toHaveTextContent('Grupo Futuro:Centro:sin-nombre-privado')
    expect(screen.getByTestId('map-probe')).not.toHaveTextContent('Casa Robles')
    expect(screen.queryByText(/históricos/i)).not.toBeInTheDocument()
  })

  it('shows degraded recovery guidance instead of empty-assignment guidance when the authorized map load fails', async () => {
    obtenerDatosMapaGruposHostHomes.mockResolvedValue({ success: false, error: 'RPC unavailable' })
    const { default: MapaGruposPage } = await import('@/app/(auth)/grupos-vida/mapa/page')

    render(await MapaGruposPage({ searchParams: Promise.resolve({}) }))

    expect(screen.getByRole('alert')).toHaveTextContent(/No pudimos cargar el mapa autorizado/i)
    expect(screen.getByText(/Revisa tu conexión o intenta actualizar la página/i)).toBeInTheDocument()
    expect(screen.queryByTestId('map-probe')).not.toBeInTheDocument()
    expect(screen.queryByText(/Asigna y aprueba una Casa Anfitriona/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/No hay grupos con Casa Anfitriona aprobada/i)).not.toBeInTheDocument()
  })

  it('keeps the group map visible and reports recovery guidance when the member layer fails', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    obtenerMapaMiembros.mockResolvedValue({ success: false, error: 'RPC unavailable' })
    const { default: MapaGruposPage } = await import('@/app/(auth)/grupos-vida/mapa/page')

    render(await MapaGruposPage({ searchParams: Promise.resolve({}) }))

    expect(screen.getByTestId('map-probe')).toHaveTextContent('Grupo Centro:Centro:sin-nombre-privado')
    expect(screen.queryByTestId('member-layer-probe')).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(/No pudimos cargar la capa de miembros/i)
    expect(screen.getByText(/actualiza la página y reporta la capa de miembros/i)).toBeInTheDocument()
    expect(screen.queryByText(/No hay grupos con Casa Anfitriona aprobada/i)).not.toBeInTheDocument()
    expect(warnSpy).toHaveBeenCalledWith('member-map-observability', {
      phase: 'member-layer',
      reason: 'failure',
      count: 0,
    })
    expect(JSON.stringify(warnSpy.mock.calls)).not.toContain('RPC unavailable')
    warnSpy.mockRestore()
  })

  it('keeps the group map visible and reports recovery guidance when the member layer never resolves', async () => {
    jest.useFakeTimers()
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    obtenerMapaMiembros.mockImplementation(() => new Promise(() => undefined))
    const { default: MapaGruposPage } = await import('@/app/(auth)/grupos-vida/mapa/page')

    const page = MapaGruposPage({ searchParams: Promise.resolve({}) })
    await jest.advanceTimersByTimeAsync(1500)
    render(await page)

    expect(screen.getByTestId('map-probe')).toHaveTextContent('Grupo Centro:Centro:sin-nombre-privado')
    expect(screen.queryByTestId('member-layer-probe')).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(/No pudimos cargar la capa de miembros/i)
    expect(screen.getByText(/actualiza la página y reporta la capa de miembros/i)).toBeInTheDocument()
    expect(warnSpy).toHaveBeenCalledWith('member-map-observability', {
      phase: 'member-layer',
      reason: 'timeout',
      count: 0,
    })
    expect(JSON.stringify(warnSpy.mock.calls)).not.toContain('Juan Pérez')

    warnSpy.mockRestore()
    jest.useRealTimers()
  })

  it('keeps the group map visible when the member layer action throws', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    obtenerMapaMiembros.mockRejectedValue(new Error('missing RPC'))
    const { default: MapaGruposPage } = await import('@/app/(auth)/grupos-vida/mapa/page')

    render(await MapaGruposPage({ searchParams: Promise.resolve({}) }))

    expect(screen.getByTestId('map-probe')).toHaveTextContent('Grupo Centro:Centro:sin-nombre-privado')
    expect(screen.getByRole('alert')).toHaveTextContent(/No pudimos cargar la capa de miembros/i)
    expect(warnSpy).toHaveBeenCalledWith('member-map-observability', {
      phase: 'member-layer',
      reason: 'failure',
      count: 0,
    })
    expect(JSON.stringify(warnSpy.mock.calls)).not.toContain('missing RPC')
    warnSpy.mockRestore()
  })

  it('skips invalid member coordinates and reports member-layer degradation', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    obtenerMapaMiembros.mockResolvedValue({ success: true, data: [createMemberMapRow(), createMemberMapRow({ nombre: 'Latitud rota', latitud: 91 })] })
    const { default: MapaGruposPage } = await import('@/app/(auth)/grupos-vida/mapa/page')

    render(await MapaGruposPage({ searchParams: Promise.resolve({}) }))

    expect(screen.getByTestId('member-layer-probe')).toHaveTextContent('Juan Pérez:Grupo Norte')
    expect(screen.getByTestId('member-layer-probe')).not.toHaveTextContent('Latitud rota')
    expect(screen.getByRole('alert')).toHaveTextContent(/1 ubicación de miembro no se pudo mostrar/i)
    expect(warnSpy).toHaveBeenCalledWith('member-map-observability', {
      phase: 'member-layer',
      reason: 'invalid-coordinates',
      count: 1,
    })
    expect(JSON.stringify(warnSpy.mock.calls)).not.toContain('Latitud rota')
    expect(JSON.stringify(warnSpy.mock.calls)).not.toContain('91')
    warnSpy.mockRestore()
  })

  it('does not suggest manual-address geocoding when no approved host-home locations are visible', async () => {
    obtenerDatosMapaGruposHostHomes.mockResolvedValue({ success: true, data: [] })
    const { default: MapaGruposPage } = await import('@/app/(auth)/grupos-vida/mapa/page')

    render(await MapaGruposPage({ searchParams: Promise.resolve({ scope: 'historical' }) }))

    expect(obtenerDatosMapaGruposHostHomes).toHaveBeenCalledWith({ scope: 'active' })
    expect(screen.getByText('No hay grupos con Casa Anfitriona aprobada para este filtro.')).toBeInTheDocument()
    expect(screen.getByText(/Asigna y aprueba una Casa Anfitriona/i)).toBeInTheDocument()
    expect(screen.queryByText(/geocodificación masiva/i)).not.toBeInTheDocument()
  })
})

function createAuthenticatedSupabase() {
  return {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'auth-1' } }, error: null }) },
  }
}

type HostHomeMapRow = {
  grupo_id: string
  grupo_nombre: string
  dia_reunion: string | null
  hora_reunion: string | null
  capacidad_maxima: number | null
  estado_ciclo: string | null
  segmento: string | null
  temporada: string | null
  casa_id: string
  casa_nombre: string
  latitud: number
  longitud: number
  barrio: string | null
  notas_publicas: string | null
  total_miembros: number
}

function createHostHomeRow(overrides: Partial<HostHomeMapRow> = {}): HostHomeMapRow {
  return {
    grupo_id: '11111111-1111-1111-1111-111111111111',
    grupo_nombre: 'Grupo Centro',
    dia_reunion: 'Viernes',
    hora_reunion: '19:00',
    capacidad_maxima: 12,
    estado_ciclo: 'activo',
    segmento: 'Adultos',
    temporada: 'Temporada 2026',
    casa_id: '22222222-2222-2222-2222-222222222222',
    casa_nombre: 'Casa Robles',
    latitud: 10.1,
    longitud: -69.2,
    barrio: 'Centro',
    notas_publicas: 'Entrada por el portón principal.',
    total_miembros: 8,
    ...overrides,
  }
}

type MemberMapRow = {
  usuario_id: string
  nombre: string
  grupo_id: string
  grupo_nombre: string
  latitud: number
  longitud: number
}

function createMemberMapRow(overrides: Partial<MemberMapRow> = {}): MemberMapRow {
  return {
    usuario_id: '33333333-3333-4333-8333-333333333333',
    nombre: 'Juan Pérez',
    grupo_id: '11111111-1111-1111-1111-111111111111',
    grupo_nombre: 'Grupo Norte',
    latitud: 10.2,
    longitud: -69.25,
    ...overrides,
  }
}
