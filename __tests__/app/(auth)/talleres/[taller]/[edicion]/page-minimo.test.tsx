/**
 * @jest-environment node
 *
 * T8a (odd/tasks/talleres-reserva-publica.md, S9 S15 S16) — the edición
 * page's minimum blocks. Fixtures and helpers copied from page.test.tsx;
 * the original header follows.
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
import { CancelarEdicionButton } from '@/components/talleres/open-edicion-button'
import { PERMISOS_TALLER_ALL_FALSE, type PermisosTaller } from '@/lib/platform/talleres/permisos'
import type { TallerDetalle } from '@/lib/platform/talleres/catalogo'
import type { EdicionLocalDetalle } from '@/lib/platform/talleres/operacional'
import type { AdminInscripcionesResult } from '@/lib/platform/talleres/admin-inscripciones'
import { AvisoMinimo } from '@/components/talleres/minimo/aviso-minimo'
import { EstadoSuspension } from '@/components/talleres/minimo/estado-suspension'
import { parsePanelMinimo } from '@/lib/platform/talleres/minimo-suspension'

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
  loadCupoEdicion: jest.fn(),
  loadReprogramarPreview: jest.fn(),
  loadReprogramacionAudit: jest.fn(),
}))

jest.mock('@/lib/platform/talleres/admin-inscripciones', () => ({
  loadAdminInscripciones: jest.fn(),
}))

jest.mock('@/lib/platform/talleres/grupo-detalle', () => ({
  loadGruposDeCohorte: jest.fn(),
  loadGruposInstanciados: jest.fn(),
}))

jest.mock('@/lib/platform/talleres/servidores-del-taller', () => ({
  loadServidoresDelTaller: jest.fn(),
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
  CancelarEdicionButton: () => null,
}))

jest.mock('@/components/talleres/cerrar-edicion-dialog', () => ({
  CerrarEdicionButton: () => null,
}))

jest.mock('@/components/talleres/reprogramar-edicion', () => ({
  ReprogramarEdicionDialog: () => null,
}))

jest.mock('@/components/talleres/grupos-section', () => ({
  GruposSection: () => null,
}))

jest.mock('@/components/talleres/minimo/aviso-minimo', () => ({ AvisoMinimo: () => null }))
jest.mock('@/components/talleres/minimo/estado-suspension', () => ({ EstadoSuspension: () => null }))
jest.mock('@/lib/platform/talleres/minimo-suspension', () => {
  const actual = jest.requireActual('@/lib/platform/talleres/minimo-suspension')
  return { ...actual, loadPanelMinimo: jest.fn() }
})

const flagsMock = jest.requireMock('@/lib/platform/talleres/flags').isTalleresEnabled as jest.Mock
const createSupabaseServerClientMock = jest.requireMock('@/lib/supabase/server')
  .createSupabaseServerClient as jest.Mock
const resolveSessionMock = jest.requireMock('@/lib/auth/platformSessionReadOnly')
  .resolveReadOnlyPlatformSession as jest.Mock
const loadTallerDetalleMock = jest.requireMock('@/lib/platform/talleres/catalogo')
  .loadTallerDetalle as jest.Mock
const loadEdicionLocalDetalleMock = jest.requireMock('@/lib/platform/talleres/operacional')
  .loadEdicionLocalDetalle as jest.Mock
const loadCupoEdicionMock = jest.requireMock('@/lib/platform/talleres/operacional')
  .loadCupoEdicion as jest.Mock
const loadReprogramarPreviewMock = jest.requireMock('@/lib/platform/talleres/operacional')
  .loadReprogramarPreview as jest.Mock
const loadReprogramacionAuditMock = jest.requireMock('@/lib/platform/talleres/operacional')
  .loadReprogramacionAudit as jest.Mock
const loadAdminInscripcionesMock = jest.requireMock('@/lib/platform/talleres/admin-inscripciones')
  .loadAdminInscripciones as jest.Mock
const loadGruposDeCohorteMock = jest.requireMock('@/lib/platform/talleres/grupo-detalle')
  .loadGruposDeCohorte as jest.Mock
const loadGruposInstanciadosMock = jest.requireMock('@/lib/platform/talleres/grupo-detalle')
  .loadGruposInstanciados as jest.Mock
const loadServidoresDelTallerMock = jest.requireMock('@/lib/platform/talleres/servidores-del-taller')
  .loadServidoresDelTaller as jest.Mock
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
  cadencia_dias: 7,
  duracion_minutos: null,
  tipo: 'pareja',
  vinculo: 'matrimonio',
  regimen: 'temporada',
  cierre_inscripcion_offset_dias: -3,
  intervalo_ediciones_dias: null,
  clases_minimas_para_completar: null,
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
  fecha_inicio: '2026-09-01',
  fecha_fin: '2026-10-27',
  cierre_inscripcion: '2026-08-29',
  inscripciones_count: 5,
  inscripciones_aprobadas_count: 3,
  certificados_count: 0,
  cerrada_en: null,
  lugar: null,
  indicaciones: null,
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
  cupo?: { cupo: number; ocupados: number; disponibles: number; sobreCupo: number; unidad: 'personas' | 'parejas' } | null
  reprogramarPreview?: { clasesPendientes: number; primeraClaseCerrada: boolean }
  reprogramacionAudit?: { nombre: string; apellido: string; en: string; motivo: string | null } | null
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
  loadGruposDeCohorteMock
    .mockReset()
    .mockResolvedValue([{ id: 'g-1', nombre: 'Grupo Alfa' }])
  loadGruposInstanciadosMock.mockReset().mockResolvedValue([])
  loadServidoresDelTallerMock.mockReset().mockResolvedValue({ ok: true, servidores: [] })
  loadCupoEdicionMock.mockReset().mockResolvedValue(opts.cupo === undefined ? null : opts.cupo)
  loadReprogramarPreviewMock
    .mockReset()
    .mockResolvedValue(opts.reprogramarPreview ?? { clasesPendientes: 0, primeraClaseCerrada: false })
  loadReprogramacionAuditMock
    .mockReset()
    .mockResolvedValue(opts.reprogramacionAudit === undefined ? null : opts.reprogramacionAudit)
}

function params(taller = 'matrimonio-sobre-la-roca', edicion = 'e-1') {
  return { params: Promise.resolve({ taller, edicion }) }
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



const loadPanelMinimoMock = jest.requireMock('@/lib/platform/talleres/minimo-suspension').loadPanelMinimo as jest.Mock

function panelBase(over: Record<string, unknown> = {}) {
  return parsePanelMinimo({
    minimo: 15,
    bajo_minimo: true,
    fecha_inicio: '2099-01-15',
    cierre_inscripcion: '2099-01-11',
    conteo: { aprobados: 12, pendientes: 2, sin_responder: 0 },
    suspension: null,
    puede_suspender: true,
    puede_abrir_igual: true,
    puede_confirmar: true,
    ...over,
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
async function renderPage(): Promise<any> {
  return EdicionDetallePage(params())
}

describe('EdicionDetallePage — mínimo de inscritos (T8a)', () => {
  beforeEach(() => loadPanelMinimoMock.mockReset())

  it('loads the panel for this edición and shows nothing when it cannot be read', async () => {
    setup({ permisos: { editarEdicion: true } })
    loadPanelMinimoMock.mockResolvedValue(null)
    const element = await renderPage()
    expect(loadPanelMinimoMock).toHaveBeenCalledWith(expect.anything(), 'e-1')
    expect(findByType(element, AvisoMinimo)).toBeNull()
    expect(findByType(element, EstadoSuspension)).toBeNull()
  })

  it('below the minimum: the banner with the panel and the existing cancel control for editarEdicion', async () => {
    setup({ permisos: { editarEdicion: true } })
    const panel = panelBase()
    loadPanelMinimoMock.mockResolvedValue(panel)
    const element = await renderPage()
    const aviso = findByType(element, AvisoMinimo)
    expect(aviso?.props).toMatchObject({ tallerSlug: TALLER.slug, tallerNombre: TALLER.nombre, edicionId: 'e-1', panel })
    const cancelar = aviso?.props.cancelar as { type: unknown; props: Record<string, unknown> }
    expect(cancelar.type).toBe(CancelarEdicionButton)
    expect(cancelar.props).toMatchObject({ edicionId: 'e-1', inscritos: EDICION.inscripciones_count })
    expect(findByType(element, EstadoSuspension)).toBeNull()
  })

  it('a coordinator gets the banner without the cancel control', async () => {
    setup({ permisos: { aprobarInscripciones: true } })
    loadPanelMinimoMock.mockResolvedValue(panelBase({ puede_suspender: false }))
    const element = await renderPage()
    expect(findByType(element, AvisoMinimo)?.props.cancelar).toBeUndefined()
  })

  it('after a suspension: the answers block instead of the banner', async () => {
    setup({ permisos: { aprobarInscripciones: true } })
    const panel = panelBase({
      bajo_minimo: false,
      conteo: { aprobados: 12, sin_responder: 3, limite: '2099-01-11' },
      suspension: { en: '2098-12-01T00:00:00Z', motivo: 'Mínimo', por: 'Dora' },
    })
    loadPanelMinimoMock.mockResolvedValue(panel)
    const element = await renderPage()
    expect(findByType(element, AvisoMinimo)).toBeNull()
    expect(findByType(element, EstadoSuspension)?.props).toMatchObject({ edicionId: 'e-1', panel })
  })

  it('an edición that reached the minimum shows neither block', async () => {
    setup({})
    loadPanelMinimoMock.mockResolvedValue(panelBase({ bajo_minimo: false }))
    const element = await renderPage()
    expect(findByType(element, AvisoMinimo)).toBeNull()
    expect(findByType(element, EstadoSuspension)).toBeNull()
  })
})
