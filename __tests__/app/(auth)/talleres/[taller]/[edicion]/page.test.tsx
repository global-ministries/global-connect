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
import { CancelarEdicionButton, OpenEdicionButton } from '@/components/talleres/open-edicion-button'
import { ReprogramarEdicionDialog } from '@/components/talleres/reprogramar-edicion'
import { GruposSection } from '@/components/talleres/grupos-section'
import { TablaInscripciones } from '@/components/talleres/tabla-inscripciones'
import { InscribirPersonaForm } from '@/components/talleres/inscribir-persona-form'
import { EstadoVacio } from '@/components/dream-team/estado-vacio'
import { ContenedorDashboard, TituloSistema } from '@/components/ui/sistema-diseno'
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

jest.mock('@/components/talleres/reprogramar-edicion', () => ({
  ReprogramarEdicionDialog: () => null,
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

/** Finds EVERY element of the given type in the tree, WITHOUT executing it. */
function findAllByType(node: unknown, type: unknown, out: Array<{ props: Record<string, unknown> }> = []) {
  if (node === null || node === undefined || typeof node === 'boolean') return out
  if (Array.isArray(node)) {
    for (const child of node) findAllByType(child, type, out)
    return out
  }
  if (typeof node === 'object' && node !== null && 'type' in node) {
    const el = node as { type: unknown; props?: { children?: unknown } }
    if (el.type === type) out.push(el as { props: Record<string, unknown> })
    findAllByType(el.props?.children, type, out)
  }
  return out
}

describe('EdicionDetallePage — gate', () => {
  it('shows the disabled message and resolves nothing when the flag is off', async () => {
    setup({ isEnabled: false })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await EdicionDetallePage(params())) as any
    expect(extractText(element)).toMatch(/deshabilitado/i)
    expect(loadTallerDetalleMock).not.toHaveBeenCalled()
  })

  it('asks to log in (neutral Spanish, no voseo) and resolves nothing when there is no user', async () => {
    setup({ user: null })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await EdicionDetallePage(params())) as any
    expect(extractText(element)).toMatch(/necesitas iniciar sesión/i)
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

  // T4 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) —
  // CancelarEdicionButton replaces CloseEdicionButton: allowed from
  // borrador OR abierto (never en_curso/cerrado/cancelado, which are now
  // derived from the edición's own dates, not a manual transition).
  it('shows CancelarEdicionButton when editarEdicion is granted and estado is borrador (alongside OpenEdicionButton)', async () => {
    setup({ permisos: { editarEdicion: true }, edicionDetalle: { ...EDICION, estado: 'borrador' } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await EdicionDetallePage(params())) as any
    expect(findByType(element, CancelarEdicionButton)).not.toBeNull()
    expect(findByType(element, OpenEdicionButton)).not.toBeNull()
  })

  it('shows CancelarEdicionButton (not OpenEdicionButton) when editarEdicion is granted and estado is abierto', async () => {
    setup({ permisos: { editarEdicion: true }, edicionDetalle: { ...EDICION, estado: 'abierto' } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await EdicionDetallePage(params())) as any
    expect(findByType(element, CancelarEdicionButton)).not.toBeNull()
    expect(findByType(element, OpenEdicionButton)).toBeNull()
  })

  it('hides CancelarEdicionButton when editarEdicion is denied even if estado is abierto', async () => {
    setup({ permisos: { editarEdicion: false }, edicionDetalle: { ...EDICION, estado: 'abierto' } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await EdicionDetallePage(params())) as any
    expect(findByType(element, CancelarEdicionButton)).toBeNull()
  })

  it('hides CancelarEdicionButton for en_curso/cerrado/cancelado, even with editarEdicion', async () => {
    for (const estado of ['en_curso', 'cerrado', 'cancelado'] as const) {
      setup({ permisos: { editarEdicion: true }, edicionDetalle: { ...EDICION, estado } })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
      const element = (await EdicionDetallePage(params())) as any
      expect(findByType(element, CancelarEdicionButton)).toBeNull()
    }
  })

  it('passes taller.slug, edicion.id and inscripciones_count to CancelarEdicionButton', async () => {
    setup({ permisos: { editarEdicion: true }, edicionDetalle: { ...EDICION, estado: 'abierto', inscripciones_count: 5 } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await EdicionDetallePage(params())) as any
    const boton = findByType(element, CancelarEdicionButton)
    expect(boton?.props).toEqual({ tallerSlug: 'matrimonio-sobre-la-roca', edicionId: 'e-1', inscritos: 5 })
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

  // T4 (odd/tasks/talleres-configuracion-del-taller.md) — GruposSection's
  // own instanciados grupos + the shared bounded picker's servidores list.
  it('passes the loaded instanciados grupos, servidores and puedeEditar to GruposSection', async () => {
    const gruposInstanciados = [
      { id: 'g-1', nombre: 'Grupo Alfa', capacidad: 12, estado: 'activo', ocupacion: 0, facilitadores: [] },
    ]
    const servidores = [{ personaId: 'p-1', nombre: 'Ana', apellido: 'Gómez' }]
    setup({ permisos: { gestionarGrupos: true } })
    loadGruposInstanciadosMock.mockResolvedValue(gruposInstanciados)
    loadServidoresDelTallerMock.mockResolvedValue({ ok: true, servidores })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await EdicionDetallePage(params())) as any
    const grupos = findByType(element, GruposSection)
    expect(grupos?.props.grupos).toEqual(gruposInstanciados)
    expect(grupos?.props.servidores).toEqual(servidores)
    expect(grupos?.props.puedeEditar).toBe(true)
    expect(loadGruposInstanciadosMock).toHaveBeenCalledWith(expect.anything(), 'c-1')
    expect(loadServidoresDelTallerMock).toHaveBeenCalledWith(expect.anything(), 't-1')
  })

  it('does not load instanciados grupos or servidores when gestionarGrupos is denied', async () => {
    setup({ permisos: { gestionarGrupos: false } })
    await EdicionDetallePage(params())
    expect(loadGruposInstanciadosMock).not.toHaveBeenCalled()
    expect(loadServidoresDelTallerMock).not.toHaveBeenCalled()
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

  // T3 (odd/tasks/talleres-inscripcion-a-grupo.md) — the bulk-assign
  // seleccion prop is gated on gestionarGrupos, hide-not-disable.
  it('passes seleccion.grupos to TablaInscripciones when gestionarGrupos is granted', async () => {
    setup({ permisos: { gestionarGrupos: true } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await EdicionDetallePage(params())) as any
    const tabla = findByType(element, TablaInscripciones)
    expect(tabla?.props.seleccion).toEqual({ grupos: [{ id: 'g-1', nombre: 'Grupo Alfa' }] })
    expect(loadGruposDeCohorteMock).toHaveBeenCalledWith(expect.anything(), 'c-1')
  })

  it('does not pass seleccion to TablaInscripciones when gestionarGrupos is denied', async () => {
    setup({ permisos: { gestionarGrupos: false } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await EdicionDetallePage(params())) as any
    const tabla = findByType(element, TablaInscripciones)
    expect(tabla?.props.seleccion).toBeUndefined()
    expect(loadGruposDeCohorteMock).not.toHaveBeenCalled()
  })
})

// T11 (odd/tasks/talleres-configuracion-del-taller.md, flow audit) —
// "Abrir esta edición" becomes the clear next step: a one-line banner
// under the header explains the borrador state and what to do about it.
describe('EdicionDetallePage — T11: borrador banner', () => {
  it('shows the borrador banner when estado is borrador', async () => {
    setup({ edicionDetalle: { ...EDICION, estado: 'borrador' } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await EdicionDetallePage(params())) as any
    expect(extractText(element)).toMatch(
      /esta edición está en borrador\. revisa grupos y clases y luego ábrela para recibir inscripciones\./i,
    )
  })

  it('does not show the borrador banner when estado is abierto', async () => {
    setup({ edicionDetalle: { ...EDICION, estado: 'abierto' } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await EdicionDetallePage(params())) as any
    expect(extractText(element)).not.toMatch(/está en borrador/i)
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

  // T6 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) — the Cupo line.
  describe('Cupo (T6)', () => {
    it('shows "{ocupados} de {cupo} personas · {disponibles} disponibles" for an individual edición', async () => {
      setup({ cupo: { cupo: 2, ocupados: 2, disponibles: 0, sobreCupo: 0, unidad: 'personas' } })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
      const element = (await EdicionDetallePage(params())) as any
      expect(extractText(element)).toMatch(/2 de 2 personas · 0 disponibles/)
    })

    // T7 hardening (odd/tasks/talleres-temporadas-y-ediciones.md, item 7,
    // 20260928140000_talleres_paso6_hardening.sql) — a pareja edición says
    // "parejas", not a bare number/"plazas".
    it('shows "{ocupados} de {cupo} parejas · {disponibles} disponibles" for a pareja edición', async () => {
      setup({ cupo: { cupo: 12, ocupados: 8, disponibles: 4, sobreCupo: 0, unidad: 'parejas' } })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
      const element = (await EdicionDetallePage(params())) as any
      expect(extractText(element)).toMatch(/8 de 12 parejas · 4 disponibles/)
    })

    it('shows "Sin cupo definido" when cupo is 0', async () => {
      setup({ cupo: { cupo: 0, ocupados: 3, disponibles: 0, sobreCupo: 0, unidad: 'personas' } })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
      const element = (await EdicionDetallePage(params())) as any
      expect(extractText(element)).toMatch(/Sin cupo definido/)
    })

    it('shows a "{n} sobre el cupo" warning badge when sobreCupo > 0', async () => {
      setup({ cupo: { cupo: 2, ocupados: 3, disponibles: 0, sobreCupo: 1, unidad: 'personas' } })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
      const element = (await EdicionDetallePage(params())) as any
      expect(extractText(element)).toMatch(/1\s+sobre el cupo/)
    })

    it('never shows the "sobre el cupo" badge when sobreCupo is 0', async () => {
      setup({ cupo: { cupo: 2, ocupados: 2, disponibles: 0, sobreCupo: 0, unidad: 'personas' } })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
      const element = (await EdicionDetallePage(params())) as any
      expect(extractText(element)).not.toMatch(/sobre el cupo/)
    })

    it('shows nothing when loadCupoEdicion degrades to null', async () => {
      setup({ cupo: null })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
      const element = (await EdicionDetallePage(params())) as any
      expect(extractText(element)).not.toMatch(/personas|parejas/)
      expect(extractText(element)).not.toMatch(/Sin cupo definido/)
    })
  })

  // T6 — "Inscribir persona" (InscribirPersonaForm) gates the same way
  // TablaInscripciones's canWrite already does: aprobarInscripciones AND a
  // cohorte to insert against.
  describe('Inscribir persona (T6)', () => {
    it('renders when aprobarInscripciones is true and the edición has a cohorte', async () => {
      setup({ permisos: { aprobarInscripciones: true } })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
      const element = (await EdicionDetallePage(params())) as any
      expect(findByType(element, InscribirPersonaForm)).not.toBeNull()
    })

    it('does not render when aprobarInscripciones is false', async () => {
      setup({ permisos: { aprobarInscripciones: false } })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
      const element = (await EdicionDetallePage(params())) as any
      expect(findByType(element, InscribirPersonaForm)).toBeNull()
    })

    it('does not render when the edición has no cohorte', async () => {
      setup({ permisos: { aprobarInscripciones: true }, edicionDetalle: { ...EDICION, cohorte: null } })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
      const element = (await EdicionDetallePage(params())) as any
      expect(findByType(element, InscribirPersonaForm)).toBeNull()
    })
  })

  // T4 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) — "Ventana"
  // collapses to one sentence derived from the edición's OWN fecha_fin/
  // cierre_inscripcion (talleres_periodos_generales is gone); the detailed
  // fields move behind a <details> "Ver fechas", shown only to editarEdicion.
  describe('Ventana — one-sentence summary (T4)', () => {
    it('shows "Inscripciones abiertas hasta el {fecha}" for borrador/abierto (both already carry real dates)', async () => {
      setup({ edicionDetalle: { ...EDICION, estado: 'abierto' } })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
      const element = (await EdicionDetallePage(params())) as any
      const text = extractText(element)
      expect(text).toMatch(/Inscripciones abiertas hasta el/)
      expect(text).toMatch(/2026/)
    })

    it('shows "En curso hasta el {fecha}" for en_curso', async () => {
      setup({ edicionDetalle: { ...EDICION, estado: 'en_curso' } })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
      const element = (await EdicionDetallePage(params())) as any
      expect(extractText(element)).toMatch(/En curso hasta el/)
    })

    it('shows "Cerrada el {fecha}" for cerrado', async () => {
      setup({ edicionDetalle: { ...EDICION, estado: 'cerrado' } })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
      const element = (await EdicionDetallePage(params())) as any
      expect(extractText(element)).toMatch(/Cerrada el/)
    })

    it('shows a cancelled notice for cancelado', async () => {
      setup({ edicionDetalle: { ...EDICION, estado: 'cancelado' } })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
      const element = (await EdicionDetallePage(params())) as any
      expect(extractText(element)).toMatch(/cancelada/i)
    })

    it('never shows the detailed date fields (no <details>, no Ver fechas, no dl) for a viewer without editarEdicion', async () => {
      setup({ permisos: { editarEdicion: false } })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
      const element = (await EdicionDetallePage(params())) as any
      expect(findByType(element, 'details')).toBeNull()
      expect(findByType(element, 'dl')).toBeNull()
      expect(extractText(element)).not.toMatch(/Ver fechas/)
    })

    it('shows fecha_inicio, fecha_fin, cierre_inscripcion and the taller\'s cierre relativo inside <details> "Ver fechas" for a viewer with editarEdicion', async () => {
      setup({ permisos: { editarEdicion: true } })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
      const element = (await EdicionDetallePage(params())) as any
      const details = findByType(element, 'details')
      expect(details).not.toBeNull()
      const text = extractText(details)
      expect(text).toMatch(/Ver fechas/)
      expect(text).toMatch(/2026/)
      // TALLER.cierre_inscripcion_offset_dias is -3 — the relative sentence, never a raw number.
      expect(text).toMatch(/3 días antes de la primera clase/)
    })
  })

  // T7b (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) — the
  // "Reprogramar" dialog and the audit line, both inside "Ver fechas"
  // (editarEdicion-gated, same as every other detailed field there).
  describe('Reprogramar (T7b)', () => {
    it('shows ReprogramarEdicionDialog when editarEdicion is granted and estado is abierto', async () => {
      setup({ permisos: { editarEdicion: true }, edicionDetalle: { ...EDICION, estado: 'abierto' } })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
      const element = (await EdicionDetallePage(params())) as any
      expect(findByType(element, ReprogramarEdicionDialog)).not.toBeNull()
    })

    it('hides ReprogramarEdicionDialog when editarEdicion is denied', async () => {
      setup({ permisos: { editarEdicion: false }, edicionDetalle: { ...EDICION, estado: 'abierto' } })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
      const element = (await EdicionDetallePage(params())) as any
      expect(findByType(element, ReprogramarEdicionDialog)).toBeNull()
    })

    it('hides ReprogramarEdicionDialog for cerrado/cancelado, even with editarEdicion', async () => {
      for (const estado of ['cerrado', 'cancelado'] as const) {
        setup({ permisos: { editarEdicion: true }, edicionDetalle: { ...EDICION, estado } })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
        const element = (await EdicionDetallePage(params())) as any
        expect(findByType(element, ReprogramarEdicionDialog)).toBeNull()
      }
    })

    it('shows ReprogramarEdicionDialog for borrador/en_curso too, with editarEdicion', async () => {
      for (const estado of ['borrador', 'en_curso'] as const) {
        setup({ permisos: { editarEdicion: true }, edicionDetalle: { ...EDICION, estado } })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
        const element = (await EdicionDetallePage(params())) as any
        expect(findByType(element, ReprogramarEdicionDialog)).not.toBeNull()
      }
    })

    it('passes the edición dates and the preview counts to ReprogramarEdicionDialog', async () => {
      setup({
        permisos: { editarEdicion: true },
        edicionDetalle: { ...EDICION, estado: 'abierto' },
        reprogramarPreview: { clasesPendientes: 3, primeraClaseCerrada: true },
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
      const element = (await EdicionDetallePage(params())) as any
      const dialog = findByType(element, ReprogramarEdicionDialog)
      expect(dialog?.props).toEqual({
        tallerSlug: 'matrimonio-sobre-la-roca',
        edicionId: 'e-1',
        fechaInicio: '2026-09-01',
        fechaFin: '2026-10-27',
        cierreInscripcion: '2026-08-29',
        clasesPendientes: 3,
        primeraClaseCerrada: true,
      })
    })

    it('does not load the preview/audit when editarEdicion is denied', async () => {
      setup({ permisos: { editarEdicion: false } })
      await EdicionDetallePage(params())
      expect(loadReprogramarPreviewMock).not.toHaveBeenCalled()
      expect(loadReprogramacionAuditMock).not.toHaveBeenCalled()
    })

    it('shows the audit line "Reprogramada por {nombre} {apellido} el {fecha}: {motivo}" when present', async () => {
      setup({
        permisos: { editarEdicion: true },
        reprogramacionAudit: { nombre: 'Ana', apellido: 'Gómez', en: '2026-09-15T00:00:00Z', motivo: 'Ajuste de agenda' },
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
      const element = (await EdicionDetallePage(params())) as any
      const text = extractText(element)
      expect(text).toMatch(/Reprogramada por Ana Gómez el/)
      expect(text).toMatch(/Ajuste de agenda/)
    })

    it('omits the ": {motivo}" suffix when no motivo was given', async () => {
      setup({
        permisos: { editarEdicion: true },
        reprogramacionAudit: { nombre: 'Ana', apellido: 'Gómez', en: '2026-09-15T00:00:00Z', motivo: null },
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
      const element = (await EdicionDetallePage(params())) as any
      const text = extractText(element)
      expect(text).toMatch(/Reprogramada por Ana Gómez el/)
      expect(text).not.toMatch(/:\s*$/)
    })

    it('shows no audit line when the edición was never reprogramada', async () => {
      setup({ permisos: { editarEdicion: true }, reprogramacionAudit: null })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
      const element = (await EdicionDetallePage(params())) as any
      expect(extractText(element)).not.toMatch(/Reprogramada por/)
    })
  })

  it('shows a "sin fechas" message when the edición has no dates registered yet (legacy row)', async () => {
    setup({ edicionDetalle: { ...EDICION, fecha_inicio: null, fecha_fin: null, cierre_inscripcion: null } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await EdicionDetallePage(params())) as any
    expect(extractText(element)).toMatch(/no tiene fechas registradas/i)
  })

  // T10 (odd/tasks/talleres-configuracion-del-taller.md, design audit) —
  // "Inscritos" and "Ventana" used to be hand-rolled `<h2>`s; both are now
  // TituloSistema nivel={2}, and no raw h2 is left on the page.
  it('renders Inscritos and Ventana through TituloSistema nivel={2}, never a raw h2', async () => {
    setup({})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await EdicionDetallePage(params())) as any
    expect(findByType(element, 'h2')).toBeNull()
    const titulos = findAllByType(element, TituloSistema)
    expect(titulos.some((t) => t.props.nivel === 2 && extractText(t.props.children) === 'Inscritos')).toBe(true)
    expect(titulos.some((t) => t.props.nivel === 2 && extractText(t.props.children) === 'Ventana')).toBe(true)
  })
})
