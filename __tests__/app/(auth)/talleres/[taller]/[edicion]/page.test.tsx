/**
 * @jest-environment node
 *
 * T4 (odd/tasks/talleres-consolidar-pantallas.md) — /talleres/[taller]/[edicion],
 * the edición detail screen. Replaces app/(auth)/admin/talleres/edicion/[id]/
 * page.tsx and absorbs the per-edición half of
 * app/(auth)/admin/talleres/inscripciones/page.tsx and
 * app/(auth)/talleres/coordinacion/inscripciones/page.tsx.
 *
 * Mirrors the gate + structural-inspection pattern of
 * __tests__/app/(auth)/talleres/[taller]/page.test.tsx (flag -> user ->
 * session, each an informational card, inspected via extractText/findByType
 * rather than full rendering — OpenEdicionButton/CloseEdicionButton/
 * GruposSection are real client components with their own hooks, so they're
 * mocked to marker components; TablaInscripciones/EstadoVacio are plain
 * server components, left unmocked and inspected via their props).
 *
 * This page adds a SECOND resolution step beyond the taller-by-slug lookup:
 * the edición must both exist AND belong to the resolved taller — a
 * mismatched pair (a real edición id, but for a DIFFERENT taller's slug)
 * must 404 exactly like an unknown id, never silently render.
 *
 * The core of this test: every control's visibility is wired straight to
 * cargarPermisos()'s booleans, never a flat capability array.
 */

import EdicionDetallePage from '@/app/(auth)/talleres/[taller]/[edicion]/page'
import { OpenEdicionButton, CloseEdicionButton } from '@/components/talleres/open-edicion-button'
import { GruposSection } from '@/components/talleres/grupos-section'
import { TablaInscripciones } from '@/components/talleres/tabla-inscripciones'
import { EstadoVacio } from '@/components/dream-team/estado-vacio'
import { ContenedorDashboard } from '@/components/ui/sistema-diseno'
import { PERMISOS_TALLER_ALL_FALSE, type PermisosTaller } from '@/lib/platform/talleres/permisos'
import type { TallerDetalle } from '@/lib/platform/talleres/catalogo'
import type { EdicionLocalDetalle } from '@/lib/platform/talleres/operacional'
import type { AdminInscripcionesResult } from '@/lib/platform/talleres/admin-inscripciones'
import { rutaTaller } from '@/lib/platform/talleres/rutas'

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

jest.mock('@/lib/platform/talleres/operacional', () => ({
  loadEdicionLocalDetalle: jest.fn(),
}))

jest.mock('@/lib/platform/talleres/admin-inscripciones', () => ({
  loadAdminInscripciones: jest.fn(),
}))

jest.mock('@/lib/platform/talleres/inscripciones-actions', () => ({
  approveInscripcionAction: jest.fn(),
  rejectInscripcionAction: jest.fn(),
}))

jest.mock('@/lib/platform/talleres/permisos', () => {
  const actual = jest.requireActual('@/lib/platform/talleres/permisos')
  return { ...actual, cargarPermisos: jest.fn() }
})

jest.mock('@/components/talleres/open-edicion-button', () => ({
  OpenEdicionButton: () => null,
  CloseEdicionButton: () => null,
}))

jest.mock('@/components/talleres/grupos-section', () => ({
  GruposSection: () => null,
}))

const flagsMock = jest.requireMock('@/lib/platform/talleres/flags').isTalleresEnabled as jest.Mock
const createSupabaseServerClientMock = jest.requireMock('@/lib/supabase/server')
  .createSupabaseServerClient as jest.Mock
const resolveSessionMock = jest.requireMock('@/lib/auth/platformSessionReadOnly')
  .resolveReadOnlyPlatformSession as jest.Mock
const loadTallerDetalleMock = jest.requireMock('@/lib/platform/talleres/catalogo')
  .loadTallerDetalle as jest.Mock
const loadEdicionLocalDetalleMock = jest.requireMock('@/lib/platform/talleres/operacional')
  .loadEdicionLocalDetalle as jest.Mock
const loadAdminInscripcionesMock = jest.requireMock('@/lib/platform/talleres/admin-inscripciones')
  .loadAdminInscripciones as jest.Mock
const cargarPermisosMock = jest.requireMock('@/lib/platform/talleres/permisos')
  .cargarPermisos as jest.Mock

const TALLER: TallerDetalle = {
  id: 't-1',
  slug: 'matrimonio-sobre-la-roca',
  nombre: 'Matrimonio sobre la Roca',
  descripcion: 'Un taller de ejemplo.',
  modalidad_default: 'periodo_general',
  estado: 'active',
  dream_team_equipo_id: 'eq-1',
  ediciones: [],
}

const EDICION: EdicionLocalDetalle = {
  id: 'e-1',
  taller_id: 't-1',
  taller_nombre: 'Matrimonio sobre la Roca',
  taller_slug: 'matrimonio-sobre-la-roca',
  nombre_snapshot: 'Septiembre 2026',
  tipo: 'pareja',
  link_type: 'matrimonio',
  modalidad_inscripcion: 'periodo_general',
  estado: 'borrador',
  sesiones_snapshot: 8,
  duracion_estimada_minutos_snapshot: 90,
  firmantes: [],
  cohorte: {
    id: 'c-1',
    dream_team_equipo_id: 'eq-1',
    edicion: 'Septiembre 2026',
    started_at: '2026-09-01T00:00:00Z',
    ended_at: null,
  },
  periodo_general: {
    id: 'pg-1',
    fecha_apertura_automatica: '2026-08-01T00:00:00Z',
    fecha_cierre_automatica: null,
    fecha_apertura_manual: null,
    fecha_cierre_manual: null,
    fecha_cierre_real: null,
    motivo_cierre: null,
  },
  inscripciones_count: 5,
  inscripciones_aprobadas_count: 3,
  certificados_count: 0,
}

const INSCRIPCION_ROW = {
  id: 'i-1',
  edicion_id: 'e-1',
  edicion_nombre: 'Septiembre 2026',
  edicion_estado: 'borrador',
  taller_id: 't-1',
  taller_nombre: 'Matrimonio sobre la Roca',
  taller_slug: 'matrimonio-sobre-la-roca',
  cohorte_id: null,
  cohorte_edicion: null,
  persona_principal_id: 'p-1',
  persona_principal_nombre: 'Juan Pérez',
  persona_principal_email: 'juan@example.com',
  companero_id: null,
  companero_nombre: null,
  link_type: null,
  estado: 'pendiente',
  created_at: '2026-09-10T00:00:00Z',
  updated_at: '2026-09-10T00:00:00Z',
} as AdminInscripcionesResult['rows'][number]

interface SetupOpts {
  isEnabled?: boolean
  user?: { id: string } | null
  hasSession?: boolean
  taller?: TallerDetalle | null
  edicionDetalle?: EdicionLocalDetalle | null
  permisos?: Partial<PermisosTaller>
  inscripciones?: AdminInscripcionesResult
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
  loadEdicionLocalDetalleMock
    .mockReset()
    .mockResolvedValue(opts.edicionDetalle === undefined ? EDICION : opts.edicionDetalle)
  cargarPermisosMock.mockReset().mockResolvedValue({ ...PERMISOS_TALLER_ALL_FALSE, ...opts.permisos })
  loadAdminInscripcionesMock
    .mockReset()
    .mockResolvedValue(opts.inscripciones ?? { rows: [INSCRIPCION_ROW], total: 1 })
}

function params(taller = 'matrimonio-sobre-la-roca', edicion = 'e-1') {
  return { params: Promise.resolve({ taller, edicion }) }
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

describe('EdicionDetallePage — gate', () => {
  it('shows the disabled message and resolves nothing when the flag is off', async () => {
    setup({ isEnabled: false })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await EdicionDetallePage(params())) as any
    expect(extractText(element)).toMatch(/deshabilitado/i)
    expect(loadTallerDetalleMock).not.toHaveBeenCalled()
  })

  it('asks to log in and resolves nothing when there is no user', async () => {
    setup({ user: null })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await EdicionDetallePage(params())) as any
    expect(extractText(element)).toMatch(/iniciar sesión/i)
    expect(loadTallerDetalleMock).not.toHaveBeenCalled()
  })

  it('shows a session-resolution message when the session cannot be resolved', async () => {
    setup({ hasSession: false })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await EdicionDetallePage(params())) as any
    expect(extractText(element)).toMatch(/no se pudo resolver tu sesión/i)
    expect(loadTallerDetalleMock).not.toHaveBeenCalled()
  })

  it('calls notFound() (404) when the taller slug does not resolve', async () => {
    setup({ taller: null })
    await expect(EdicionDetallePage(params('no-existe'))).rejects.toThrow(
      /NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/,
    )
  })

  it('calls notFound() (404) when the edición id does not resolve', async () => {
    setup({ edicionDetalle: null })
    await expect(EdicionDetallePage(params('matrimonio-sobre-la-roca', 'no-existe'))).rejects.toThrow(
      /NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/,
    )
    expect(loadAdminInscripcionesMock).not.toHaveBeenCalled()
  })

  it('calls notFound() (404) when the edición belongs to a DIFFERENT taller', async () => {
    // A real edición id, but for another taller's slug — the mismatched
    // pair must 404, never silently render the wrong taller's edición.
    setup({ edicionDetalle: { ...EDICION, taller_slug: 'otro-taller' } })
    await expect(EdicionDetallePage(params('matrimonio-sobre-la-roca', 'e-1'))).rejects.toThrow(
      /NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/,
    )
    expect(loadAdminInscripcionesMock).not.toHaveBeenCalled()
  })
})

describe('EdicionDetallePage — permission wiring', () => {
  it('shows OpenEdicionButton when editarEdicion is granted and estado is borrador', async () => {
    setup({ permisos: { editarEdicion: true } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await EdicionDetallePage(params())) as any
    expect(findByType(element, OpenEdicionButton)).not.toBeNull()
  })

  it('hides OpenEdicionButton when editarEdicion is denied', async () => {
    setup({ permisos: { editarEdicion: false } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await EdicionDetallePage(params())) as any
    expect(findByType(element, OpenEdicionButton)).toBeNull()
  })

  it('shows CloseEdicionButton when editarEdicion is granted and estado is abierto', async () => {
    setup({ permisos: { editarEdicion: true }, edicionDetalle: { ...EDICION, estado: 'abierto' } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await EdicionDetallePage(params())) as any
    expect(findByType(element, CloseEdicionButton)).not.toBeNull()
    expect(findByType(element, OpenEdicionButton)).toBeNull()
  })

  it('hides CloseEdicionButton when editarEdicion is denied even if estado is abierto', async () => {
    setup({ permisos: { editarEdicion: false }, edicionDetalle: { ...EDICION, estado: 'abierto' } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await EdicionDetallePage(params())) as any
    expect(findByType(element, CloseEdicionButton)).toBeNull()
  })

  it('grants TablaInscripciones canWrite when aprobarInscripciones is granted', async () => {
    setup({ permisos: { aprobarInscripciones: true } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await EdicionDetallePage(params())) as any
    const tabla = findByType(element, TablaInscripciones)
    expect(tabla).not.toBeNull()
    expect(tabla?.props.canWrite).toBe(true)
  })

  it('denies TablaInscripciones canWrite when aprobarInscripciones is denied (badge fallback is TablaInscripciones\' own job)', async () => {
    setup({ permisos: { aprobarInscripciones: false } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await EdicionDetallePage(params())) as any
    const tabla = findByType(element, TablaInscripciones)
    expect(tabla).not.toBeNull()
    expect(tabla?.props.canWrite).toBe(false)
  })

  it('shows an empty state instead of TablaInscripciones when there are no inscripciones', async () => {
    setup({ inscripciones: { rows: [], total: 0 } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await EdicionDetallePage(params())) as any
    expect(findByType(element, TablaInscripciones)).toBeNull()
    const vacio = findByType(element, EstadoVacio)
    expect(vacio).not.toBeNull()
    expect(vacio?.props.titulo).toMatch(/no hay inscritos todavía/i)
  })

  it('shows GruposSection when gestionarGrupos is granted and the edición has a cohorte', async () => {
    setup({ permisos: { gestionarGrupos: true } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await EdicionDetallePage(params())) as any
    const grupos = findByType(element, GruposSection)
    expect(grupos).not.toBeNull()
    expect(grupos?.props.cohorteId).toBe('c-1')
    expect(grupos?.props.tallerSlug).toBe('matrimonio-sobre-la-roca')
    expect(grupos?.props.edicionId).toBe('e-1')
  })

  it('hides GruposSection when gestionarGrupos is denied', async () => {
    setup({ permisos: { gestionarGrupos: false } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await EdicionDetallePage(params())) as any
    expect(findByType(element, GruposSection)).toBeNull()
  })

  it('hides GruposSection when gestionarGrupos is granted but the edición has no cohorte yet', async () => {
    setup({ permisos: { gestionarGrupos: true }, edicionDetalle: { ...EDICION, cohorte: null } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await EdicionDetallePage(params())) as any
    expect(findByType(element, GruposSection)).toBeNull()
  })

  it('passes taller.dream_team_equipo_id to cargarPermisos', async () => {
    setup({})
    await EdicionDetallePage(params())
    expect(cargarPermisosMock).toHaveBeenCalledWith(expect.anything(), 'eq-1')
  })

  it('scopes loadAdminInscripciones to this edición', async () => {
    setup({})
    await EdicionDetallePage(params())
    expect(loadAdminInscripcionesMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ edicion_id: 'e-1' }),
    )
  })
})

describe('EdicionDetallePage — content', () => {
  it('titles the page with the edición name and links back to the taller', async () => {
    setup({})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await EdicionDetallePage(params())) as any
    const dashboard = findByType(element, ContenedorDashboard)
    expect(dashboard?.props.titulo).toBe('Septiembre 2026')
    expect(dashboard?.props.botonRegreso).toEqual({
      href: rutaTaller('matrimonio-sobre-la-roca'),
      texto: 'Matrimonio sobre la Roca',
    })
  })

  it('shows the estado badge label', async () => {
    setup({})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await EdicionDetallePage(params())) as any
    expect(extractText(element)).toMatch(/Borrador/)
  })

  it('shows the ventana dates and an em-dash for a null date', async () => {
    setup({})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await EdicionDetallePage(params())) as any
    const text = extractText(element)
    // fecha_apertura_automatica is set — a real formatted date shows up.
    expect(text).toMatch(/2026/)
    // fecha_cierre_automatica is null — must show an em-dash, never blank.
    expect(text).toMatch(/—/)
  })

  it('shows a "no periodo" message when periodo_general is null', async () => {
    setup({ edicionDetalle: { ...EDICION, periodo_general: null } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await EdicionDetallePage(params())) as any
    expect(extractText(element)).toMatch(/no hay per[ií]odo general asociado/i)
  })
})
