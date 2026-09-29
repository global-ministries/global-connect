/**
 * /grupos-vida/directores (RSC): who gets in, the tab read from the URL, the
 * read-only mode for a director general, and the contract that only
 * serializable data crosses into the client island. Also the old
 * /configuracion/directores-generales route, which now redirects here.
 */
import React from 'react'

import type { PlatformSession } from '@/lib/platform/session/types'
import { construirVistaDirectores, type VistaDirectores } from '@/lib/platform/grupos-vida/directores-vista'

const redirect = jest.fn((to: string) => {
  throw new Error(`NEXT_REDIRECT:${to}`)
})
jest.mock('next/navigation', () => ({ redirect: (to: string) => redirect(to) }))

const createSupabaseServerClient = jest.fn()
const getUserWithRoles = jest.fn()
jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => createSupabaseServerClient() }))
jest.mock('@/lib/getUserWithRoles', () => ({ getUserWithRoles: (client: unknown) => getUserWithRoles(client) }))

const cargarVistaDirectores = jest.fn()
jest.mock('@/lib/platform/grupos-vida/directores-datos', () => ({
  cargarVistaDirectores: (params: unknown) => cargarVistaDirectores(params),
}))

// The island (and the server actions it imports) is not under test here.
jest.mock('@/components/grupos-vida/directores/directores-client', () => ({ DirectoresClient: () => null }))
// ContenedorDashboard lazy-loads its header behind Suspense — synchronous test double.
jest.mock('@/components/ui/sistema-diseno', () => ({
  ...jest.requireActual('@/components/ui/sistema-diseno'),
  ContenedorDashboard: ({ children, titulo }: { children: React.ReactNode; titulo?: string }) => (
    <section>
      <h1>{titulo}</h1>
      {children}
    </section>
  ),
}))

import { render, screen } from '@testing-library/react'
import DirectoresPage from '@/app/(auth)/grupos-vida/directores/page'
import LoadingDirectores from '@/app/(auth)/grupos-vida/directores/loading'
import DirectoresGeneralesLegacyPage from '@/app/(auth)/configuracion/directores-generales/page'
import { DirectoresClient, type DirectoresClientProps } from '@/components/grupos-vida/directores/directores-client'

// A populated view built by the real view model, so its shape is the real one:
// one general director holding one segment with one marked director, one stage
// director, one segment and one "Por ordenar" item.
const VISTA: VistaDirectores = construirVistaDirectores({
  segmentos: [{ id: 'seg-1', nombre: 'Matrimonios' }],
  grupos: [
    { id: 'g1', segmentoId: 'seg-1', activo: true, eliminado: false, estadoAprobacion: 'aprobado' },
    { id: 'g2', segmentoId: 'seg-1', activo: true, eliminado: false, estadoAprobacion: 'aprobado' },
  ],
  directoresEtapa: [{ id: 'de-1', usuarioId: 'u-ana', segmentoId: 'seg-1', nombre: 'Ana Álvarez', ciudad: 'Cabudare', tieneCuenta: true }],
  enlaces: [{ directorId: 'de-1', grupoId: 'g1' }],
  generales: [{ usuarioId: 'u-maria', nombre: 'María Pacheco', roles: ['director-general'] }],
  alcances: [{ usuarioId: 'u-maria', segmentoId: 'seg-1', alcance: 'directores' }],
  marcas: [{ usuarioId: 'u-maria', directorId: 'de-1' }],
  personasConRolDirectorEtapa: [],
  usuariosConSegmentoLider: ['u-ana'],
  soloLectura: false,
})

const originalEnabled = process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_ENABLED
const originalKillSwitch = process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_KILL_SWITCH

function conSesion(roles: string[], platformSession: PlatformSession | null = null) {
  getUserWithRoles.mockResolvedValue({ user: { id: 'auth-1' }, roles, platformSession })
}

async function renderizar(searchParams: Readonly<Record<string, string | readonly string[] | undefined>> = {}): Promise<DirectoresClientProps> {
  const element = (await DirectoresPage({ searchParams: Promise.resolve(searchParams) })) as React.ReactElement<DirectoresClientProps>
  expect(element.type).toBe(DirectoresClient)
  return element.props
}

beforeEach(() => {
  jest.clearAllMocks()
  createSupabaseServerClient.mockResolvedValue({})
  cargarVistaDirectores.mockResolvedValue(VISTA)
  delete process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_ENABLED
  delete process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_KILL_SWITCH
})

afterEach(() => {
  if (originalEnabled === undefined) delete process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_ENABLED
  else process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_ENABLED = originalEnabled
  if (originalKillSwitch === undefined) delete process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_KILL_SWITCH
  else process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_KILL_SWITCH = originalKillSwitch
})

describe('/grupos-vida/directores — access', () => {
  it('sends a visitor without a session to /login and loads nothing', async () => {
    getUserWithRoles.mockResolvedValue(null)
    await expect(renderizar()).rejects.toThrow('NEXT_REDIRECT:/login')
    expect(cargarVistaDirectores).not.toHaveBeenCalled()
  })

  it.each([[['lider']], [['director-etapa']], [['miembro']], [[]]])('sends the roles %j to /dashboard and loads nothing', async (roles) => {
    conSesion(roles)
    await expect(renderizar()).rejects.toThrow('NEXT_REDIRECT:/dashboard')
    expect(cargarVistaDirectores).not.toHaveBeenCalled()
  })

  it.each([[['admin']], [['pastor']], [['director-general']]])('lets the roles %j in and hands the loader the auth id and roles', async (roles) => {
    conSesion(roles)
    const props = await renderizar()
    expect(props.vista).toBe(VISTA)
    expect(cargarVistaDirectores).toHaveBeenCalledWith({ authId: 'auth-1', roles })
  })

  it('sends the visitor to /dashboard when the loader gives no data', async () => {
    conSesion(['admin'])
    cargarVistaDirectores.mockResolvedValue(null)
    await expect(renderizar()).rejects.toThrow('NEXT_REDIRECT:/dashboard')
  })

  // The role is the only gate, as in every other Grupos de Vida page: nobody
  // but one admin holds a platform grant for this screen, so a capability
  // check would lock out the pastors and the general directors.
  it.each([
    ['the platform flag is on and the person has no grant', { enabled: 'true' }, ['pastor']],
    ['the platform flag is on and the kill switch is active', { enabled: 'true', killSwitch: 'true' }, ['director-general']],
    ['the platform flag is off', {}, ['admin']],
  ] as const)('lets the role in when %s', async (_label, env, roles) => {
    if ('enabled' in env) process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_ENABLED = env.enabled
    if ('killSwitch' in env) process.env.NEXT_PUBLIC_PLATFORM_NAVIGATION_KILL_SWITCH = env.killSwitch
    conSesion([...roles], null)
    expect((await renderizar()).vista).toBe(VISTA)
  })
})

describe('/grupos-vida/directores — tab and read-only mode', () => {
  beforeEach(() => conSesion(['admin']))

  it('opens the general directors by default', async () => {
    expect((await renderizar()).tabInicial).toBe('generales')
  })

  it.each([
    [{ tab: 'etapa' }, 'etapa'],
    [{ tab: 'generales' }, 'generales'],
    [{ tab: 'otra-cosa' }, 'generales'],
    [{ tab: ['etapa', 'generales'] }, 'etapa'],
    [{}, 'generales'],
  ] as const)('reads the tab from %j', async (params, esperado) => {
    expect((await renderizar(params)).tabInicial).toBe(esperado)
  })

  it('hands the island the read-only view the loader built for a director general', async () => {
    conSesion(['director-general'])
    cargarVistaDirectores.mockResolvedValue({ ...VISTA, soloLectura: true })
    expect((await renderizar()).vista.soloLectura).toBe(true)
  })

  it('passes only serializable data to the island', async () => {
    // the fixture must exercise every collection, or the round trip proves nothing
    expect(VISTA.generales[0].segmentos).toHaveLength(1)
    expect(VISTA.etapa).toHaveLength(1)
    expect(VISTA.segmentos).toHaveLength(1)
    expect(VISTA.porOrdenar.length).toBeGreaterThan(0)
    const props = await renderizar({ tab: 'etapa' })
    expect(JSON.parse(JSON.stringify(props))).toEqual(props)
  })
})

describe('/configuracion/directores-generales — legacy route', () => {
  it.each([[['admin']], [['director-general']], [['lider']]])('redirects the roles %j to /grupos-vida/directores', async (roles) => {
    conSesion(roles)
    expect(() => DirectoresGeneralesLegacyPage()).toThrow('NEXT_REDIRECT:/grupos-vida/directores')
    expect(redirect).toHaveBeenCalledWith('/grupos-vida/directores')
  })
})

describe('/grupos-vida/directores — loading', () => {
  it('renders the page skeleton under the page title', () => {
    render(<LoadingDirectores />)
    expect(screen.getByRole('heading', { level: 1, name: 'Directores' })).toBeInTheDocument()
  })
})
