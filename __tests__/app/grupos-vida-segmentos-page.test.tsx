/**
 * /grupos-vida/segmentos (RSC): who gets in, who sees "Crear segmento", the
 * empty states, and the contract that only serializable data crosses into the
 * client island. The counts and the visibility live in the loader and the view
 * model, which have their own suites.
 */
import React from 'react'
import { render, screen } from '@testing-library/react'

import type { DatosSegmentos } from '@/lib/platform/grupos-vida/segmentos-datos'

const redirect = jest.fn((to: string) => {
  throw new Error(`NEXT_REDIRECT:${to}`)
})
jest.mock('next/navigation', () => ({ redirect: (to: string) => redirect(to) }))

const createSupabaseServerClient = jest.fn()
const getUserWithRoles = jest.fn()
jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => createSupabaseServerClient() }))
jest.mock('@/lib/getUserWithRoles', () => ({ getUserWithRoles: (client: unknown) => getUserWithRoles(client) }))

const cargarVistaSegmentos = jest.fn()
jest.mock('@/lib/platform/grupos-vida/segmentos-datos', () => ({
  cargarVistaSegmentos: (params: unknown) => cargarVistaSegmentos(params),
}))

// The islands (and the server actions they import) are not under test here.
const propsIsla = jest.fn()
jest.mock('@/components/grupos-vida/segmentos/segmentos-client', () => ({
  SegmentosClient: (props: unknown) => {
    propsIsla(props)
    return <div data-testid="isla" />
  },
}))
jest.mock('@/components/grupos/FormularioSegmento.client', () => ({
  __esModule: true,
  default: ({ trigger }: { trigger: string }) => <div data-testid={`crear-${trigger}`} />,
}))
// ContenedorDashboard lazy-loads its header behind Suspense — synchronous test double.
jest.mock('@/components/ui/sistema-diseno', () => ({
  ...jest.requireActual('@/components/ui/sistema-diseno'),
  ContenedorDashboard: ({
    children,
    titulo,
    accionPrincipal,
  }: {
    children: React.ReactNode
    titulo?: string
    accionPrincipal?: React.ReactNode
  }) => (
    <section>
      <h1>{titulo}</h1>
      {accionPrincipal}
      {children}
    </section>
  ),
}))

import SegmentosPage from '@/app/(auth)/grupos-vida/segmentos/page'

const FILA = {
  id: 's1',
  nombre: 'Matrimonios',
  directores: 1,
  gruposActivos: 2,
  gruposPendientes: 0,
  sinDirector: 0,
  textoDirectores: '1 director',
  textoGrupos: '2 grupos activos',
  textoPendientes: '0 pendientes',
  textoSinDirector: null,
  bloqueo: 'No se puede eliminar Matrimonios: tiene 2 grupos activos.',
}

const datos = (extra: Partial<DatosSegmentos> = {}): DatosSegmentos => ({
  vista: { filas: [FILA], pie: '1 segmento · 1 director de etapa · 2 grupos activos' },
  puedeGestionar: true,
  esGeneralSinSegmentos: false,
  ...extra,
})

function conSesion(roles: string[]) {
  getUserWithRoles.mockResolvedValue({ user: { id: 'auth-1' }, roles })
}

beforeEach(() => {
  jest.clearAllMocks()
  createSupabaseServerClient.mockResolvedValue({})
  cargarVistaSegmentos.mockResolvedValue(datos())
})

describe('/grupos-vida/segmentos — access', () => {
  it('sends a visitor without a session to /login and loads nothing', async () => {
    getUserWithRoles.mockResolvedValue(null)
    await expect(SegmentosPage()).rejects.toThrow('NEXT_REDIRECT:/login')
    expect(cargarVistaSegmentos).not.toHaveBeenCalled()
  })

  it.each([[['lider']], [['miembro']], [[]]])('sends the roles %j to /grupos-vida and loads nothing', async (roles) => {
    conSesion(roles)
    await expect(SegmentosPage()).rejects.toThrow('NEXT_REDIRECT:/grupos-vida')
    expect(cargarVistaSegmentos).not.toHaveBeenCalled()
  })

  it('sends the caller to /grupos-vida when the loader refuses', async () => {
    conSesion(['admin'])
    cargarVistaSegmentos.mockResolvedValue(null)
    await expect(SegmentosPage()).rejects.toThrow('NEXT_REDIRECT:/grupos-vida')
  })

  it('hands the loader the session id and the roles', async () => {
    conSesion(['director-general'])
    await SegmentosPage()
    expect(cargarVistaSegmentos).toHaveBeenCalledWith({ authId: 'auth-1', roles: ['director-general'] })
  })
})

describe('/grupos-vida/segmentos — page', () => {
  it('gives an admin the create button, the phone button and the list', async () => {
    conSesion(['admin'])
    render(await SegmentosPage())
    expect(screen.getByRole('heading', { name: 'Segmentos' })).toBeInTheDocument()
    expect(screen.getByTestId('crear-boton')).toBeInTheDocument()
    expect(screen.getByTestId('crear-fab')).toBeInTheDocument()
    expect(screen.getByTestId('isla')).toBeInTheDocument()
    expect(propsIsla).toHaveBeenCalledWith({ vista: datos().vista, puedeGestionar: true })
  })

  it('gives everyone else the list without the create buttons', async () => {
    conSesion(['pastor'])
    cargarVistaSegmentos.mockResolvedValue(datos({ puedeGestionar: false }))
    render(await SegmentosPage())
    expect(screen.queryByTestId('crear-boton')).not.toBeInTheDocument()
    expect(screen.queryByTestId('crear-fab')).not.toBeInTheDocument()
    expect(propsIsla).toHaveBeenCalledWith(expect.objectContaining({ puedeGestionar: false }))
  })

  it('passes only serializable data to the island', async () => {
    conSesion(['admin'])
    await SegmentosPage()
    // Rendering the page is what hands the props over; a JSON round trip must lose nothing.
    render(await SegmentosPage())
    const props = propsIsla.mock.calls[0][0]
    expect(JSON.parse(JSON.stringify(props))).toEqual(props)
  })

  it('tells a director general without segments to ask the administrator', async () => {
    conSesion(['director-general'])
    cargarVistaSegmentos.mockResolvedValue(
      datos({ vista: { filas: [], pie: '0 segmentos · 0 directores de etapa · 0 grupos activos' }, puedeGestionar: false, esGeneralSinSegmentos: true }),
    )
    render(await SegmentosPage())
    expect(screen.getByText('No tienes segmentos asignados')).toBeInTheDocument()
    expect(screen.getByText('Contacta al administrador para que te asigne segmentos.')).toBeInTheDocument()
    expect(screen.queryByTestId('isla')).not.toBeInTheDocument()
  })

  it('says there are no segments when the list is empty', async () => {
    conSesion(['admin'])
    cargarVistaSegmentos.mockResolvedValue(datos({ vista: { filas: [], pie: '' } }))
    render(await SegmentosPage())
    expect(screen.getByText('No hay segmentos registrados.')).toBeInTheDocument()
    expect(screen.queryByTestId('isla')).not.toBeInTheDocument()
  })
})
