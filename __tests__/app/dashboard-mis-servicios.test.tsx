/**
 * «Mis servicios» on the dashboard (odd/tasks/dps-asistencia-pco.md, T15c,
 * S13.5; artboards design/dps-avisos/04 and 07): the card sits in its reserved slot of
 * the new home (home-por-rol S2) only when dps_mis_servicios returns services or unseen
 * notices; empty, failed or slow answers leave the panel as it was.
 */
import React from 'react'
import { render, screen } from '@testing-library/react'

import * as acciones from '@/lib/actions/dps-avisos.actions'
import { leerMisServicios } from '@/lib/platform/dps/avisos'

jest.mock('@/lib/actions/dps-avisos.actions', () => ({
  cargarMisServiciosDps: jest.fn(),
  responderServicioDps: jest.fn(),
  marcarAvisoVistoDps: jest.fn(),
}))
// The new home (odd/tasks/home-por-rol.md T3): a person with nothing else, so «Explorar» is the rest of the panel.
jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'auth-1' } } }) } }),
}))
jest.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { nombre: 'Valentina' }, error: null }) }) }) }),
  }),
}))
jest.mock('@/lib/inicio/cargar-hechos', () => ({
  cargarHechosInicio: async () => ({ ...jest.requireActual('@/lib/inicio/hechos').HECHOS_VACIOS, usuarioId: 'u-1', perfilCompleto: true, hizoProximoPaso: true }),
}))
jest.mock('@/app/(auth)/dashboard/mis-hijos-dashboard', () => ({ cargarMisHijosDashboard: async () => null }))
jest.mock('next/navigation', () => ({ redirect: jest.fn(), useRouter: () => ({ refresh: jest.fn() }) }))
jest.mock('@/components/ui/sistema-diseno', () => ({
  ...jest.requireActual('@/components/ui/sistema-diseno'),
  PaginaSistema: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}))
jest.mock('@/hooks/use-notificaciones', () => ({ useNotificaciones: () => ({ success: jest.fn(), error: jest.fn(), info: jest.fn() }) }))

const cargar = acciones.cargarMisServiciosDps as jest.MockedFunction<typeof acciones.cargarMisServiciosDps>

const PLAN = '77777777-7777-4777-8777-777777777715'
const SERVICIO = {
  plan_id: PLAN,
  fecha: '2026-11-15',
  tipo: 'domingo',
  titulo: null,
  semana: null,
  serie: null,
  roles: [{ origen: 'columna', puesto_id: null, columna: 'host', nombre: 'Host', equipo: 'Producción Creativa', direccion: 'Producción Creativa', automatico: false }],
  horarios: ['09:00', '11:30'],
  llegada: '07:30',
  estado: 'pendiente',
  motivo: null,
  respondido_at: null,
  cambio: false,
  quitado: false,
  visto_at: null,
  antes: null,
  enviado_at: '2026-11-09T14:00:00+00:00',
  enviado_por: 'Andrés Valero',
}

const flagOriginal = process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED

beforeEach(() => {
  jest.clearAllMocks()
  process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED = 'on'
})

afterEach(() => {
  jest.useRealTimers()
  if (flagOriginal === undefined) delete process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED
  else process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED = flagOriginal
})

async function renderPanel() {
  const { default: PaginaTablero } = await import('@/app/(auth)/dashboard/page')
  render(await PaginaTablero())
}

describe('dashboard «Mis servicios»', () => {
  it('shows the card at the top when the person has a service', async () => {
    cargar.mockResolvedValue({ ok: true, data: leerMisServicios({ servicios: [SERVICIO], avisos: [], por_responder: 1, fechas_bloqueadas: 0 }) })
    await renderPanel()

    const titulo = screen.getByRole('heading', { name: 'Mis servicios' })
    expect(titulo.compareDocumentPosition(screen.getByRole('heading', { name: 'Explorar' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeInTheDocument()
  })

  it('shows the card with only an unseen notice', async () => {
    cargar.mockResolvedValue({ ok: true, data: leerMisServicios({ servicios: [], avisos: [{ ...SERVICIO, quitado: true }], por_responder: 0, fechas_bloqueadas: 0 }) })
    await renderPanel()
    expect(screen.getByRole('heading', { name: 'Mis servicios' })).toBeInTheDocument()
  })

  it('renders nothing without services nor notices', async () => {
    cargar.mockResolvedValue({ ok: true, data: leerMisServicios({ servicios: [], avisos: [], por_responder: 0, fechas_bloqueadas: 3 }) })
    await renderPanel()
    expect(screen.queryByRole('heading', { name: 'Mis servicios' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Explorar' })).toBeInTheDocument()
  })

  it('keeps the panel when the action fails or throws', async () => {
    const consola = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    cargar.mockResolvedValueOnce({ ok: false, message: 'Tu sesión terminó. Vuelve a iniciar sesión.', codigo: null })
    await renderPanel()
    expect(screen.queryByRole('heading', { name: 'Mis servicios' })).not.toBeInTheDocument()

    cargar.mockRejectedValueOnce(new Error('rpc caída'))
    await renderPanel()
    expect(screen.queryByRole('heading', { name: 'Mis servicios' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('heading', { name: 'Explorar' }).length).toBeGreaterThan(0)
    consola.mockRestore()
  })

  it('does not wait for a slow answer', async () => {
    jest.useFakeTimers()
    const aviso = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    cargar.mockReturnValue(new Promise(() => undefined))
    const { default: PaginaTablero } = await import('@/app/(auth)/dashboard/page')
    const { MIS_SERVICIOS_TIMEOUT_MS } = await import('@/components/mis-servicios/cargar-mis-servicios')

    const pagina = PaginaTablero()
    await jest.advanceTimersByTimeAsync(MIS_SERVICIOS_TIMEOUT_MS)
    render(await pagina)

    expect(screen.queryByRole('heading', { name: 'Mis servicios' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Explorar' })).toBeInTheDocument()
    aviso.mockRestore()
  })

  it('does not ask when Dream Team is off', async () => {
    delete process.env.NEXT_PUBLIC_DREAM_TEAM_ENABLED
    await renderPanel()
    expect(cargar).not.toHaveBeenCalled()
    expect(screen.queryByRole('heading', { name: 'Mis servicios' })).not.toBeInTheDocument()
  })
})
