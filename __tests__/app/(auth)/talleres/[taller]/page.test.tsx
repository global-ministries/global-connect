/**
 * @jest-environment node
 *
 * T3 (odd/tasks/talleres-consolidar-pantallas.md) — /talleres/[taller], the
 * new taller detail page.
 *
 * Mirrors the gate pattern of __tests__/app/(auth)/talleres/page.test.tsx
 * (flag -> user -> session, each an informational card, inspected
 * structurally via extractText/findByType rather than full rendering —
 * OpenEdicionForm/AssignServicioForm are real client components with their
 * own hooks, so this RSC-only test mocks them to marker components and
 * inspects the unexecuted element tree's props, exactly like the catalog
 * page test does for <CatalogoTalleresClient>).
 *
 * Beyond the shared gate, this page adds one more early-exit: slug
 * resolution. `talleres` is world-readable (talleres_select_all, USING
 * true) so notFound() only fires for a slug with genuinely no row — never
 * as a stand-in for "you can't see this taller" (confirmed against
 * staging: an authenticated viewer with zero talleres capability grants
 * still sees the taller row; only its borrador/cerrado/cancelado ediciones
 * are hidden by taller_ediciones_select — abierto/en_curso stay visible to
 * any authenticated user).
 *
 * The core of this test: every control's visibility is wired straight to
 * cargarPermisos()'s booleans, never a flat capability array.
 */

import TallerDetallePage from '@/app/(auth)/talleres/[taller]/page'
import { OpenEdicionForm } from '@/components/talleres/open-edicion-form'
import { AssignServicioForm } from '@/components/talleres/assign-servicio-form'
import { ContenedorDashboard } from '@/components/ui/sistema-diseno'
import { PERMISOS_TALLER_ALL_FALSE, type PermisosTaller } from '@/lib/platform/talleres/permisos'
import type { TallerDetalle } from '@/lib/platform/talleres/catalogo'
import { rutaCatalogo, rutaEdicion } from '@/lib/platform/talleres/rutas'
import Link from 'next/link'

jest.mock('@/lib/platform/talleres/flags', () => ({
  isTalleresEnabled: jest.fn(),
}))

jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: jest.fn(),
}))

jest.mock('@/lib/auth/platformSessionReadOnly', () => ({
  findPlatformSessionPersonaByAuthId: jest.fn(),
  resolveReadOnlyPlatformSession: jest.fn(),
}))

jest.mock('@/lib/platform/talleres/catalogo', () => ({
  loadTallerDetalle: jest.fn(),
}))

jest.mock('@/lib/platform/talleres/permisos', () => {
  const actual = jest.requireActual('@/lib/platform/talleres/permisos')
  return { ...actual, cargarPermisos: jest.fn() }
})

jest.mock('@/lib/platform/talleres/equipo-organigrama', () => ({
  fetchRutaEquipo: jest.fn(),
  fetchCoordinadorRoles: jest.fn(),
}))

jest.mock('@/lib/platform/talleres/temporadas', () => ({
  loadTemporadasAbiertas: jest.fn(),
}))

jest.mock('@/components/talleres/open-edicion-form', () => ({
  OpenEdicionForm: () => null,
}))

jest.mock('@/components/talleres/assign-servicio-form', () => ({
  AssignServicioForm: () => null,
}))

const flagsMock = jest.requireMock('@/lib/platform/talleres/flags').isTalleresEnabled as jest.Mock
const createSupabaseServerClientMock = jest.requireMock('@/lib/supabase/server')
  .createSupabaseServerClient as jest.Mock
const resolveSessionMock = jest.requireMock('@/lib/auth/platformSessionReadOnly')
  .resolveReadOnlyPlatformSession as jest.Mock
const loadTallerDetalleMock = jest.requireMock('@/lib/platform/talleres/catalogo')
  .loadTallerDetalle as jest.Mock
const cargarPermisosMock = jest.requireMock('@/lib/platform/talleres/permisos')
  .cargarPermisos as jest.Mock
const fetchRutaEquipoMock = jest.requireMock('@/lib/platform/talleres/equipo-organigrama')
  .fetchRutaEquipo as jest.Mock
const fetchCoordinadorRolesMock = jest.requireMock('@/lib/platform/talleres/equipo-organigrama')
  .fetchCoordinadorRoles as jest.Mock
const loadTemporadasAbiertasMock = jest.requireMock('@/lib/platform/talleres/temporadas')
  .loadTemporadasAbiertas as jest.Mock

const TALLER: TallerDetalle = {
  id: 't-1',
  slug: 'matrimonio-sobre-la-roca',
  nombre: 'Matrimonio sobre la Roca',
  descripcion: 'Un taller de ejemplo.',
  modalidad_default: 'periodo_general',
  estado: 'active',
  dream_team_equipo_id: 'eq-1',
  ediciones: [
    { id: 'e-1', nombre_snapshot: 'Septiembre 2026', tipo: 'pareja', estado: 'abierto', total_inscripciones: 3 },
  ],
}

interface SetupOpts {
  isEnabled?: boolean
  user?: { id: string } | null
  hasSession?: boolean
  taller?: TallerDetalle | null
  permisos?: Partial<PermisosTaller>
}

function setup(opts: SetupOpts): void {
  flagsMock.mockReset().mockReturnValue(opts.isEnabled ?? true)

  createSupabaseServerClientMock.mockReset().mockResolvedValue({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: opts.user === undefined ? { id: 'auth-1' } : opts.user },
        error: null,
      }),
    },
  })

  const hasSession = opts.hasSession ?? true
  resolveSessionMock.mockReset().mockResolvedValue(
    hasSession
      ? {
          personaId: 'p-1',
          subjectAuthId: 'auth-1',
          globalRoles: [],
          contexts: [],
          capabilities: [],
        }
      : null,
  )

  loadTallerDetalleMock.mockReset().mockResolvedValue(opts.taller === undefined ? TALLER : opts.taller)
  cargarPermisosMock.mockReset().mockResolvedValue({ ...PERMISOS_TALLER_ALL_FALSE, ...opts.permisos })
  fetchRutaEquipoMock.mockReset().mockResolvedValue(null)
  fetchCoordinadorRolesMock.mockReset().mockResolvedValue([])
  loadTemporadasAbiertasMock.mockReset().mockResolvedValue([])
}

function params(taller = 'matrimonio-sobre-la-roca') {
  return { params: Promise.resolve({ taller }) }
}

/** Walks a React element tree's `.props.children` without rendering it. */
function extractText(node: unknown): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(extractText).join(' ')
  if (typeof node === 'object' && node !== null && 'props' in node) {
    const props = (node as { props?: { children?: unknown } }).props
    return extractText(props?.children)
  }
  return ''
}

/** Finds the first element of the given type in the tree, WITHOUT executing it. */
function findByType(node: unknown, type: unknown): { props: Record<string, unknown> } | null {
  if (node === null || node === undefined || typeof node === 'boolean') return null
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findByType(child, type)
      if (found) return found
    }
    return null
  }
  if (typeof node === 'object' && node !== null && 'type' in node) {
    const el = node as { type: unknown; props?: { children?: unknown } }
    if (el.type === type) return el as { props: Record<string, unknown> }
    return findByType(el.props?.children, type)
  }
  return null
}

describe('TallerDetallePage — gate', () => {
  it('shows the disabled message and resolves nothing when the flag is off', async () => {
    setup({ isEnabled: false })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TallerDetallePage(params())) as any
    expect(extractText(element)).toMatch(/deshabilitado/i)
    expect(loadTallerDetalleMock).not.toHaveBeenCalled()
  })

  it('asks to log in and resolves nothing when there is no user', async () => {
    setup({ user: null })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TallerDetallePage(params())) as any
    expect(extractText(element)).toMatch(/iniciar sesión/i)
    expect(loadTallerDetalleMock).not.toHaveBeenCalled()
  })

  it('shows a session-resolution message when the session cannot be resolved', async () => {
    setup({ hasSession: false })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TallerDetallePage(params())) as any
    expect(extractText(element)).toMatch(/no se pudo resolver tu sesión/i)
    expect(loadTallerDetalleMock).not.toHaveBeenCalled()
  })

  it('calls notFound() (404) when the slug does not resolve to any taller', async () => {
    setup({ taller: null })
    await expect(TallerDetallePage(params('no-existe'))).rejects.toThrow(
      /NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/,
    )
  })
})

describe('TallerDetallePage — permission wiring', () => {
  it('shows OpenEdicionForm when cargarPermisos grants abrirEdicion', async () => {
    setup({ permisos: { abrirEdicion: true } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TallerDetallePage(params())) as any
    expect(findByType(element, OpenEdicionForm)).not.toBeNull()
    expect(loadTemporadasAbiertasMock).toHaveBeenCalledTimes(1)
  })

  it('hides OpenEdicionForm when cargarPermisos denies abrirEdicion', async () => {
    setup({ permisos: { abrirEdicion: false } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TallerDetallePage(params())) as any
    expect(findByType(element, OpenEdicionForm)).toBeNull()
    expect(loadTemporadasAbiertasMock).not.toHaveBeenCalled()
  })

  it('shows AssignServicioForm when cargarPermisos grants asignarEquipo', async () => {
    setup({ permisos: { asignarEquipo: true } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TallerDetallePage(params())) as any
    expect(findByType(element, AssignServicioForm)).not.toBeNull()
    expect(fetchCoordinadorRolesMock).toHaveBeenCalledTimes(1)
  })

  it('hides AssignServicioForm when cargarPermisos denies asignarEquipo', async () => {
    setup({ permisos: { asignarEquipo: false } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TallerDetallePage(params())) as any
    expect(findByType(element, AssignServicioForm)).toBeNull()
    expect(fetchCoordinadorRolesMock).not.toHaveBeenCalled()
  })

  it('passes taller.dream_team_equipo_id to cargarPermisos', async () => {
    setup({})
    await TallerDetallePage(params())
    expect(cargarPermisosMock).toHaveBeenCalledWith(expect.anything(), 'eq-1')
  })

  it('never fetches coordinador roles when the taller has no equipo, even with asignarEquipo granted', async () => {
    setup({ taller: { ...TALLER, dream_team_equipo_id: null }, permisos: { asignarEquipo: true } })
    await TallerDetallePage(params())
    expect(fetchCoordinadorRolesMock).not.toHaveBeenCalled()
  })
})

describe('TallerDetallePage — content', () => {
  it('titles the page with the taller name and links back to /talleres', async () => {
    setup({})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TallerDetallePage(params())) as any
    const dashboard = findByType(element, ContenedorDashboard)
    expect(dashboard?.props.titulo).toBe('Matrimonio sobre la Roca')
    expect(dashboard?.props.botonRegreso).toEqual({ href: rutaCatalogo(), texto: 'Talleres' })
  })

  it('shows its ediciones with their estado label', async () => {
    setup({})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TallerDetallePage(params())) as any
    const text = extractText(element)
    expect(text).toMatch(/Septiembre 2026/)
    expect(text).toMatch(/Abierta/)
  })

  it('shows the org-chart path line only when fetchRutaEquipo resolves one', async () => {
    setup({})
    fetchRutaEquipoMock.mockResolvedValue('Dirección de Conexión › Grupos de Corto Plazo')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TallerDetallePage(params())) as any
    expect(extractText(element)).toMatch(/Dirección de Conexión › Grupos de Corto Plazo/)
    expect(fetchRutaEquipoMock).toHaveBeenCalledWith(expect.anything(), 'eq-1')
  })

  it('never calls fetchRutaEquipo when the taller has no equipo yet', async () => {
    setup({ taller: { ...TALLER, dream_team_equipo_id: null } })
    await TallerDetallePage(params())
    expect(fetchRutaEquipoMock).not.toHaveBeenCalled()
  })

  // T4 (odd/tasks/talleres-consolidar-pantallas.md) — /talleres/[taller]/
  // [edicion] now exists, so the ediciones rows T3 left non-interactive
  // (the `// T4` comment) link there.
  it('links each edición row to /talleres/[taller]/[edicion]', async () => {
    setup({})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TallerDetallePage(params())) as any
    const link = findByType(element, Link)
    expect(link).not.toBeNull()
    expect(link?.props.href).toBe(rutaEdicion('matrimonio-sobre-la-roca', 'e-1'))
  })
})
