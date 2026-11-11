/**
 * @jest-environment node
 *
 * R3k (odd/tasks/talleres-rediseno.md, S1, S4, L10) — /talleres/[taller]/
 * configuracion: the taller's configuration as its own view (artboard
 * design/talleres-reserva/14), out of the taller page. Same gate as the
 * taller page (flag -> user -> session -> slug), back to the taller, and the
 * same ConfiguracionTaller props the page used to hand it; edit controls with
 * cargarPermisos(...).editarTaller for THIS taller's node, read-only otherwise
 * (anyone who can see the taller could read it on the page before).
 *
 * Inspected structurally (the RSC element tree, ConfiguracionTaller mocked),
 * like ../page.test.tsx.
 */

import ConfiguracionTallerPage from '@/app/(auth)/talleres/[taller]/configuracion/page'
import { ConfiguracionTaller } from '@/components/talleres/configuracion-taller'
import { PaginaSistema } from '@/components/ui/sistema-diseno'
import { BotonAtrasMovil, TituloGrande } from '@/components/ui/barra-navegacion-movil'
import { PERMISOS_TALLER_ALL_FALSE, type PermisosTaller } from '@/lib/platform/talleres/permisos'
import type { TallerDetalle } from '@/lib/platform/talleres/catalogo'

jest.mock('@/lib/platform/talleres/flags', () => ({ isTalleresEnabled: jest.fn() }))
jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: jest.fn() }))
jest.mock('@/lib/auth/platformSessionReadOnly', () => ({
  findPlatformSessionPersonaByAuthId: jest.fn(),
  resolveReadOnlyPlatformSession: jest.fn(),
}))
jest.mock('@/lib/platform/talleres/catalogo', () => ({ loadTallerDetalle: jest.fn() }))
jest.mock('@/lib/platform/talleres/permisos', () => {
  const actual = jest.requireActual('@/lib/platform/talleres/permisos')
  return { ...actual, cargarPermisos: jest.fn() }
})
jest.mock('@/components/talleres/configuracion-taller', () => ({ ConfiguracionTaller: () => null }))

const flagsMock = jest.requireMock('@/lib/platform/talleres/flags').isTalleresEnabled as jest.Mock
const createClientMock = jest.requireMock('@/lib/supabase/server').createSupabaseServerClient as jest.Mock
const resolveSessionMock = jest.requireMock('@/lib/auth/platformSessionReadOnly').resolveReadOnlyPlatformSession as jest.Mock
const loadTallerDetalleMock = jest.requireMock('@/lib/platform/talleres/catalogo').loadTallerDetalle as jest.Mock
const cargarPermisosMock = jest.requireMock('@/lib/platform/talleres/permisos').cargarPermisos as jest.Mock

const TALLER: TallerDetalle = {
  id: 't-1',
  slug: 'matrimonio-sobre-la-roca',
  nombre: 'Matrimonio sobre la Roca',
  descripcion: null,
  modalidad_default: 'periodo_general',
  estado: 'active',
  dream_team_equipo_id: 'eq-1',
  cadencia_dias: 14,
  duracion_minutos: 75,
  tipo: 'pareja',
  vinculo: 'novios',
  regimen: 'cadencia',
  cierre_inscripcion_offset_dias: -3,
  intervalo_ediciones_dias: 28,
  clases_minimas_para_completar: 6,
  minimo_inscritos: 12,
  permite_recuperar_clases: false,
  ediciones: [],
}

interface Opts {
  isEnabled?: boolean
  user?: { id: string } | null
  hasSession?: boolean
  taller?: TallerDetalle | null
  permisos?: Partial<PermisosTaller>
}

function setup(opts: Opts = {}): void {
  flagsMock.mockReset().mockReturnValue(opts.isEnabled ?? true)
  createClientMock.mockReset().mockResolvedValue({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: opts.user === undefined ? { id: 'auth-1' } : opts.user },
        error: null,
      }),
    },
  })
  resolveSessionMock
    .mockReset()
    .mockResolvedValue(
      (opts.hasSession ?? true)
        ? { personaId: 'p-1', subjectAuthId: 'auth-1', globalRoles: [], contexts: [], capabilities: [] }
        : null,
    )
  loadTallerDetalleMock.mockReset().mockResolvedValue(opts.taller === undefined ? TALLER : opts.taller)
  cargarPermisosMock.mockReset().mockResolvedValue({ ...PERMISOS_TALLER_ALL_FALSE, ...opts.permisos })
}

function params(taller = 'matrimonio-sobre-la-roca') {
  return { params: Promise.resolve({ taller }) }
}

function extractText(node: unknown): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(extractText).join(' ')
  if (typeof node === 'object' && 'props' in node) {
    return extractText((node as { props?: { children?: unknown } }).props?.children)
  }
  return ''
}

function findByType(node: unknown, type: unknown): { props: Record<string, unknown> } | null {
  if (node === null || node === undefined || typeof node === 'boolean') return null
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findByType(child, type)
      if (found) return found
    }
    return null
  }
  if (typeof node === 'object' && 'type' in node) {
    const el = node as { type: unknown; props?: { children?: unknown } }
    if (el.type === type) return el as { props: Record<string, unknown> }
    return findByType(el.props?.children, type)
  }
  return null
}

describe('ConfiguracionTallerPage — gate', () => {
  it('shows the disabled message when the flag is off', async () => {
    setup({ isEnabled: false })
    const element = await ConfiguracionTallerPage(params())
    expect(extractText(element)).toMatch(/deshabilitado/i)
    expect(loadTallerDetalleMock).not.toHaveBeenCalled()
  })

  it('asks to log in without a user', async () => {
    setup({ user: null })
    const element = await ConfiguracionTallerPage(params())
    expect(extractText(element)).toMatch(/necesitas iniciar sesión/i)
    expect(loadTallerDetalleMock).not.toHaveBeenCalled()
  })

  it('says the session could not be resolved', async () => {
    setup({ hasSession: false })
    const element = await ConfiguracionTallerPage(params())
    expect(extractText(element)).toMatch(/no se pudo resolver tu sesión/i)
    expect(loadTallerDetalleMock).not.toHaveBeenCalled()
  })

  it('404s for an unknown slug', async () => {
    setup({ taller: null })
    await expect(ConfiguracionTallerPage(params('no-existe'))).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/)
  })
})

describe('ConfiguracionTallerPage — vista', () => {
  it('titles the view after the taller and goes back to it (desktop header and phone)', async () => {
    setup({ permisos: { editarTaller: true } })
    const element = await ConfiguracionTallerPage(params())
    const pagina = findByType(element, PaginaSistema)
    expect(pagina?.props.titulo).toBe('Configuración de Matrimonio sobre la Roca')
    expect(pagina?.props.regreso).toEqual({ href: '/talleres/matrimonio-sobre-la-roca', texto: 'Matrimonio sobre la Roca' })
    expect(findByType(element, BotonAtrasMovil)?.props.atras).toEqual({
      etiqueta: 'Matrimonio sobre la Roca',
      href: '/talleres/matrimonio-sobre-la-roca',
    })
    expect(findByType(element, TituloGrande)?.props.titulo).toBe('Configuración')
  })

  it('passes every configuration field verbatim, editable with editarTaller', async () => {
    setup({ permisos: { editarTaller: true } })
    const element = await ConfiguracionTallerPage(params())
    expect(cargarPermisosMock).toHaveBeenCalledWith(expect.anything(), 'eq-1')
    expect(findByType(element, ConfiguracionTaller)?.props).toEqual({
      tallerId: 't-1',
      tallerSlug: 'matrimonio-sobre-la-roca',
      tipo: 'pareja',
      vinculo: 'novios',
      regimen: 'cadencia',
      cierreInscripcionOffsetDias: -3,
      intervaloEdicionesDias: 28,
      anclaEdiciones: null,
      clasesMinimasParaCompletar: 6,
      minimoInscritos: 12,
      permiteRecuperarClases: false,
      cadenciaDias: 14,
      duracionMinutos: 75,
      puedeEditar: true,
    })
  })

  it('passes ancla_ediciones, inscripcion_automatica and momento_envio_acceso from the row', async () => {
    setup({
      permisos: { editarTaller: true },
      taller: {
        ...TALLER,
        ancla_ediciones: 'primer_domingo_mes',
        inscripcion_automatica: true,
        momento_envio_acceso: 'al_inscribirse',
      },
    })
    const props = findByType(await ConfiguracionTallerPage(params()), ConfiguracionTaller)?.props
    expect(props?.anclaEdiciones).toBe('primer_domingo_mes')
    expect(props?.inscripcionAutomatica).toBe(true)
    expect(props?.momentoEnvioAcceso).toBe('al_inscribirse')
  })

  it('a row without mínimo nor recuperar reads «sin mínimo» and «sí»', async () => {
    const { minimo_inscritos: _m, permite_recuperar_clases: _r, ...sinCampos } = TALLER
    setup({ taller: sinCampos as TallerDetalle })
    const props = findByType(await ConfiguracionTallerPage(params()), ConfiguracionTaller)?.props
    expect(props?.minimoInscritos).toBeNull()
    expect(props?.permiteRecuperarClases).toBe(true)
  })

  it('is read-only without editarTaller', async () => {
    setup({ permisos: { editarTaller: false, abrirEdicion: true } })
    const props = findByType(await ConfiguracionTallerPage(params()), ConfiguracionTaller)?.props
    expect(props?.puedeEditar).toBe(false)
  })
})
