/**
 * @jest-environment node
 *
 * R3b (odd/tasks/talleres-rediseno.md, S5) — /talleres/temporadas on the v2
 * list anatomy. The server page keeps its gate (flag -> user -> session, each
 * an informational card) and its permission checks, and hands the client
 * island (TemporadasClient) the temporadas, the write check, the direcciones
 * where the viewer may create (with their talleres) and the URL state.
 */

import TemporadasPage from '@/app/(auth)/talleres/temporadas/page'
import { TemporadasClient } from '@/components/talleres/temporadas/temporadas-client'
import { PaginaSistema } from '@/components/ui/sistema-diseno'
import type { DireccionConTalleres, TemporadaPanel } from '@/lib/platform/talleres/temporadas'

jest.mock('@/lib/platform/talleres/flags', () => ({ isTalleresEnabled: jest.fn() }))
jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: jest.fn() }))
jest.mock('@/lib/auth/platformSessionReadOnly', () => ({
  findPlatformSessionPersonaByAuthId: jest.fn(),
  resolveReadOnlyPlatformSession: jest.fn(),
}))
jest.mock('@/lib/platform/talleres/refrescar-estados', () => ({ refrescarEstadosEdiciones: jest.fn() }))
jest.mock('@/lib/platform/talleres/temporadas', () => ({
  loadPanelTemporadas: jest.fn(),
  loadDireccionesConTalleres: jest.fn(),
  loadTalleresDeDireccion: jest.fn(),
}))
jest.mock('@/components/talleres/temporadas/temporadas-client', () => ({ TemporadasClient: () => null }))

const flagsMock = jest.requireMock('@/lib/platform/talleres/flags').isTalleresEnabled as jest.Mock
const crearClienteMock = jest.requireMock('@/lib/supabase/server').createSupabaseServerClient as jest.Mock
const sesionMock = jest.requireMock('@/lib/auth/platformSessionReadOnly').resolveReadOnlyPlatformSession as jest.Mock
const refrescarMock = jest.requireMock('@/lib/platform/talleres/refrescar-estados').refrescarEstadosEdiciones as jest.Mock
const loaders = jest.requireMock('@/lib/platform/talleres/temporadas') as Record<string, jest.Mock>

const TEMPORADA: TemporadaPanel = {
  id: 'temp-1',
  nombre: 'Temporada 2027-I',
  estado: 'abierto',
  fecha_apertura: '2027-01-11',
  fecha_cierre: '2027-03-27',
  dream_team_equipo_id: 'root-con',
  direccionLabel: 'Dirección de Conexión',
  ediciones: [],
  talleresDisponibles: [],
}

interface Setup {
  readonly enabled?: boolean
  readonly user?: { id: string } | null
  readonly session?: boolean
  readonly caps?: readonly string[]
  readonly direcciones?: readonly DireccionConTalleres[]
}

function setup(opts: Setup = {}): void {
  flagsMock.mockReset().mockReturnValue(opts.enabled ?? true)
  crearClienteMock.mockReset().mockResolvedValue({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: opts.user === undefined ? { id: 'auth-1' } : opts.user } }) },
  })
  sesionMock.mockReset().mockResolvedValue(
    opts.session === false ? null : { personaId: 'p-1', capabilities: (opts.caps ?? []).map((key) => ({ key })) },
  )
  refrescarMock.mockReset().mockResolvedValue(undefined)
  loaders.loadPanelTemporadas!.mockReset().mockResolvedValue([TEMPORADA])
  loaders.loadDireccionesConTalleres!.mockReset().mockResolvedValue(
    opts.direcciones ?? [{ id: 'root-con', label: 'Dirección de Conexión', puedeEditar: false }],
  )
  loaders.loadTalleresDeDireccion!.mockReset().mockResolvedValue([
    { id: 't-1', nombre: 'Parejas', nodoLabel: 'GCP', regimen: 'temporada' },
  ])
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- element props
async function renderizar(searchParams: Record<string, string> = {}): Promise<any> {
  return TemporadasPage({ searchParams: Promise.resolve(searchParams) })
}

function textoDe(nodo: unknown): string {
  if (nodo === null || nodo === undefined || typeof nodo === 'boolean') return ''
  if (typeof nodo === 'string' || typeof nodo === 'number') return String(nodo)
  if (Array.isArray(nodo)) return nodo.map(textoDe).join(' ')
  if (typeof nodo === 'object' && 'props' in nodo) return textoDe((nodo as { props: { children?: unknown } }).props.children)
  return ''
}

describe('/talleres/temporadas — gate', () => {
  it('shows the disabled card when the module is off', async () => {
    setup({ enabled: false })
    const el = await renderizar()
    expect(el.props.titulo).toBe('Temporadas')
    expect(textoDe(el)).toContain('El módulo de talleres está deshabilitado.')
    expect(loaders.loadPanelTemporadas).not.toHaveBeenCalled()
  })

  it('asks to sign in without a user', async () => {
    setup({ user: null })
    expect(textoDe(await renderizar())).toContain('Necesitas iniciar sesión.')
  })

  it('says the session could not be resolved', async () => {
    setup({ session: false })
    const el = await renderizar()
    expect(el.type).toBe(PaginaSistema)
    expect(textoDe(el)).toContain('No se pudo resolver tu sesión.')
  })
})

describe('/talleres/temporadas — data and permissions', () => {
  it('refreshes edición states before reading and passes the temporadas to the client', async () => {
    setup()
    const el = await renderizar()
    expect(el.type).toBe(TemporadasClient)
    expect(refrescarMock).toHaveBeenCalledTimes(1)
    expect(refrescarMock.mock.invocationCallOrder[0]).toBeLessThan(loaders.loadPanelTemporadas!.mock.invocationCallOrder[0]!)
    expect(el.props.temporadas).toEqual([TEMPORADA])
  })

  it('without director.write or admin.manage the drawer is read-only', async () => {
    setup({ caps: ['talleres_crecimiento.director.read'] })
    expect((await renderizar()).props.puedeEditar).toBe(false)
  })

  it.each(['talleres_crecimiento.director.write', 'talleres_crecimiento.admin.manage'])('%s may act in the drawer', async (cap) => {
    setup({ caps: [cap] })
    expect((await renderizar()).props.puedeEditar).toBe(true)
  })

  it('offers «Crear temporada» only in direcciones with puedeEditar, with their talleres', async () => {
    setup({
      direcciones: [
        { id: 'root-con', label: 'Dirección de Conexión', puedeEditar: true },
        { id: 'root-dps', label: 'DPS', puedeEditar: false },
      ],
    })
    const el = await renderizar()
    expect(el.props.direccionesCrear).toEqual([
      { id: 'root-con', label: 'Dirección de Conexión', talleres: [{ id: 't-1', nombre: 'Parejas', nodoLabel: 'GCP', regimen: 'temporada' }] },
    ])
    expect(loaders.loadTalleresDeDireccion).toHaveBeenCalledTimes(1)
  })

  it('hides «Crear temporada» when no dirección allows it', async () => {
    setup()
    expect((await renderizar()).props.direccionesCrear).toEqual([])
    expect(loaders.loadTalleresDeDireccion).not.toHaveBeenCalled()
  })

  it('reads the URL state: filters, the open temporada and the create form', async () => {
    setup()
    const el = await renderizar({ vista: 'historial', atencion: 'minimo', direccion: 'root-con', q: 'parejas', temporada: 'temp-1', crear: '1' })
    expect(el.props.filtrosIniciales).toEqual({ vista: 'historial', atencion: 'minimo', direccion: 'root-con', q: 'parejas' })
    expect(el.props.temporadaInicial).toBe('temp-1')
    expect(el.props.crearInicial).toBe(true)
  })

  it('defaults to Vigentes with nothing open', async () => {
    setup()
    const el = await renderizar()
    expect(el.props.filtrosIniciales).toEqual({ vista: 'vigentes', atencion: null, direccion: null, q: '' })
    expect(el.props.temporadaInicial).toBeNull()
    expect(el.props.crearInicial).toBe(false)
  })
})
