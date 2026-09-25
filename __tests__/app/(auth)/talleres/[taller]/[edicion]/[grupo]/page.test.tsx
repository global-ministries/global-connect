/**
 * @jest-environment node
 *
 * T5 (odd/tasks/talleres-consolidar-pantallas.md) —
 * /talleres/[taller]/[edicion]/[grupo], the grupo detail screen. Replaces
 * app/(auth)/talleres/equipo/mis-grupos/[id]/asistencia/page.tsx and
 * .../reporte/page.tsx.
 *
 * Mirrors the gate + structural-inspection pattern of
 * __tests__/app/(auth)/talleres/[taller]/[edicion]/page.test.tsx (flag ->
 * user -> session, each an informational card, inspected via
 * extractText/findByType rather than full rendering).
 *
 * This page adds a THIRD resolution step beyond T4's taller+edición pair:
 * the grupo must resolve AND belong to the edición in the URL, which must
 * itself belong to the taller in the URL — "test all three mismatches"
 * (odd/tasks/talleres-consolidar-pantallas.md, T5): unknown grupo, grupo
 * of another edición, edición of another taller.
 *
 * A real líder can hold ZERO talleres capability today (verified against
 * staging in supabase/tests/talleres-t5-lider-lectura.test.sql) — RLS then
 * hides taller_grupos from them even though they lead it. The page must
 * tell that apart from "genuinely not found" via loadMiAsignacionGrupo +
 * resolveEquipoDeGrupo (both readable/callable regardless of capability),
 * and degrade to an honest limited state instead of a hard 404.
 */

import GrupoDetallePage from '@/app/(auth)/talleres/[taller]/[edicion]/[grupo]/page'
import { ContenedorDashboard } from '@/components/ui/sistema-diseno'
import { LecturaAsistenciaClase } from '@/components/talleres/lectura-asistencia-clase.client'
import { RegistroAsistenciaClase } from '@/components/talleres/registro-asistencia-clase.client'
import { CerrarClase } from '@/components/talleres/cerrar-clase.client'
import { EnviarReporte } from '@/components/talleres/enviar-reporte.client'
import { EstadoVacio } from '@/components/dream-team/estado-vacio'
import { PERMISOS_TALLER_ALL_FALSE, type PermisosTaller } from '@/lib/platform/talleres/permisos'
import type { TallerDetalle } from '@/lib/platform/talleres/catalogo'
import type { EdicionLocalDetalle } from '@/lib/platform/talleres/operacional'
import type {
  GrupoDetalle,
  MiAsignacionGrupo,
  GrupoAsignacionPersona,
  GrupoSesion,
  AsistenciaPersonaRow,
  GrupoReporte,
  GrupoInscripciones,
} from '@/lib/platform/talleres/grupo-detalle'
import { rutaEdicion } from '@/lib/platform/talleres/rutas'

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

jest.mock('@/lib/platform/talleres/grupo-detalle', () => ({
  loadGrupoDetalle: jest.fn(),
  loadMiAsignacionGrupo: jest.fn(),
  resolveEquipoDeGrupo: jest.fn(),
  loadGrupoAsignaciones: jest.fn(),
  loadGrupoSesiones: jest.fn(),
  loadAsistenciaPorClase: jest.fn(),
  loadGrupoReporte: jest.fn(),
  loadGrupoInscripciones: jest.fn(),
  loadEsMiembroDelGrupo: jest.fn(),
  loadRolEnGrupo: jest.fn(),
}))

jest.mock('@/lib/platform/talleres/permisos', () => {
  const actual = jest.requireActual('@/lib/platform/talleres/permisos')
  return { ...actual, cargarPermisos: jest.fn() }
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
const grupoDetalleModule = jest.requireMock('@/lib/platform/talleres/grupo-detalle') as {
  loadGrupoDetalle: jest.Mock
  loadMiAsignacionGrupo: jest.Mock
  resolveEquipoDeGrupo: jest.Mock
  loadGrupoAsignaciones: jest.Mock
  loadGrupoSesiones: jest.Mock
  loadAsistenciaPorClase: jest.Mock
  loadGrupoReporte: jest.Mock
  loadGrupoInscripciones: jest.Mock
  loadEsMiembroDelGrupo: jest.Mock
  loadRolEnGrupo: jest.Mock
}
const cargarPermisosMock = jest.requireMock('@/lib/platform/talleres/permisos')
  .cargarPermisos as jest.Mock

const TALLER: TallerDetalle = {
  id: 't-1',
  slug: 'proximo-paso',
  nombre: 'Próximo Paso',
  descripcion: null,
  modalidad_default: 'periodo_general',
  estado: 'active',
  dream_team_equipo_id: 'eq-1',
  ediciones: [],
}

const EDICION: EdicionLocalDetalle = {
  id: 'e-1',
  taller_id: 't-1',
  taller_nombre: 'Próximo Paso',
  taller_slug: 'proximo-paso',
  nombre_snapshot: 'Octubre 2026',
  tipo: 'individual',
  link_type: null,
  modalidad_inscripcion: 'permanente_custom',
  estado: 'en_curso',
  sesiones_snapshot: 4,
  duracion_estimada_minutos_snapshot: 90,
  firmantes: [],
  cohorte: { id: 'c-1', dream_team_equipo_id: 'eq-1', edicion: 'Octubre 2026', started_at: null, ended_at: null },
  periodo_general: null,
  inscripciones_count: 0,
  inscripciones_aprobadas_count: 0,
  certificados_count: 0,
}

const GRUPO: GrupoDetalle = {
  id: 'g-1',
  nombre: 'Martes 7pm',
  capacidad: 12,
  estado: 'activo',
  cohorteId: 'c-1',
  edicionId: 'e-1',
}

const ASIGNACIONES: readonly GrupoAsignacionPersona[] = [
  { id: 'a-1', personaId: 'p-lider', rol: 'lider', nombre: 'Juan Pérez' },
  { id: 'a-2', personaId: 'p-vol', rol: 'voluntario', nombre: 'María Gómez' },
]

const SESIONES: readonly GrupoSesion[] = [
  { id: 's-1', numero: 1, fechaProgramada: '2026-10-06', fechaRealizada: null, estado: 'programada', tema: 'Introducción' },
  { id: 's-2', numero: 2, fechaProgramada: '2026-10-13', fechaRealizada: null, estado: 'programada', tema: null },
]

const ASISTENCIA: readonly AsistenciaPersonaRow[] = [
  { id: 'as-1', inscripcionId: 'i-1', personaId: 'p-part', nombre: 'Ana López', estado: 'presente', motivo: null },
  { id: 'as-2', inscripcionId: 'i-2', personaId: 'p-part2', nombre: 'Luis Ruiz', estado: 'ausente', motivo: 'Viaje de trabajo' },
]

const GENTE: GrupoInscripciones = {
  aprobadas: [
    { id: 'i-1', personaId: 'p-part', nombre: 'Ana López' },
    { id: 'i-2', personaId: 'p-part2', nombre: 'Luis Ruiz' },
  ],
  retiradas: [],
}

const REPORTE: GrupoReporte = {
  id: 'r-1',
  estado: 'borrador',
  observacionesGenerales: 'Buen avance.',
  firmaLiderFecha: null,
  reabiertoMotivo: null,
}

interface SetupOpts {
  isEnabled?: boolean
  user?: { id: string } | null
  hasSession?: boolean
  taller?: TallerDetalle | null
  grupo?: GrupoDetalle | null
  edicionDetalle?: EdicionLocalDetalle | null
  miAsignacion?: MiAsignacionGrupo | null
  equipoDeGrupo?: string | null
  permisos?: Partial<PermisosTaller>
  asignaciones?: readonly GrupoAsignacionPersona[]
  sesiones?: readonly GrupoSesion[]
  asistencia?: readonly AsistenciaPersonaRow[]
  reporte?: GrupoReporte | null
  inscripcionesGrupo?: GrupoInscripciones
  esMiembro?: boolean
  /** talleres_rol_en_grupo for the caller: 'lider' | 'voluntario' | null. */
  miRol?: 'lider' | 'voluntario' | null
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
      ? { personaId: 'p-lider', subjectAuthId: 'auth-1', globalRoles: [], contexts: [], capabilities: [] }
      : null,
  )

  loadTallerDetalleMock.mockReset().mockResolvedValue(opts.taller === undefined ? TALLER : opts.taller)
  loadEdicionLocalDetalleMock
    .mockReset()
    .mockResolvedValue(opts.edicionDetalle === undefined ? EDICION : opts.edicionDetalle)

  grupoDetalleModule.loadGrupoDetalle.mockReset().mockResolvedValue(opts.grupo === undefined ? GRUPO : opts.grupo)
  grupoDetalleModule.loadMiAsignacionGrupo.mockReset().mockResolvedValue(opts.miAsignacion ?? null)
  grupoDetalleModule.resolveEquipoDeGrupo.mockReset().mockResolvedValue(
    opts.equipoDeGrupo === undefined ? 'eq-1' : opts.equipoDeGrupo,
  )
  grupoDetalleModule.loadGrupoAsignaciones.mockReset().mockResolvedValue(opts.asignaciones ?? ASIGNACIONES)
  grupoDetalleModule.loadGrupoSesiones.mockReset().mockResolvedValue(opts.sesiones ?? SESIONES)
  grupoDetalleModule.loadAsistenciaPorClase.mockReset().mockResolvedValue(opts.asistencia ?? ASISTENCIA)
  grupoDetalleModule.loadGrupoReporte.mockReset().mockResolvedValue(opts.reporte === undefined ? REPORTE : opts.reporte)
  grupoDetalleModule.loadGrupoInscripciones
    .mockReset()
    .mockResolvedValue(opts.inscripcionesGrupo ?? { aprobadas: [], retiradas: [] })
  grupoDetalleModule.loadEsMiembroDelGrupo.mockReset().mockResolvedValue(opts.esMiembro ?? false)
  grupoDetalleModule.loadRolEnGrupo.mockReset().mockResolvedValue(opts.miRol ?? null)

  cargarPermisosMock.mockReset().mockResolvedValue({ ...PERMISOS_TALLER_ALL_FALSE, ...opts.permisos })
}

function params(taller = 'proximo-paso', edicion = 'e-1', grupo = 'g-1', clase?: string) {
  return {
    params: Promise.resolve({ taller, edicion, grupo }),
    searchParams: Promise.resolve(clase ? { clase } : {}),
  }
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

/**
 * Every element of the given type, WITHOUT executing it. The page renders
 * several EstadoVacio (participantes AND asistencia), so "the first one"
 * is not necessarily the section under test.
 */
function findAllByType(node: unknown, type: unknown): Array<{ props: Record<string, unknown> }> {
  if (node === null || node === undefined || typeof node === 'boolean') return []
  if (Array.isArray(node)) {
    const found: Array<{ props: Record<string, unknown> }> = []
    for (const child of node) found.push(...findAllByType(child, type))
    return found
  }
  if (typeof node === 'object' && node !== null && 'type' in node) {
    const el = node as { type: unknown; props?: { children?: unknown } }
    const found: Array<{ props: Record<string, unknown> }> = []
    if (el.type === type) found.push(el as { props: Record<string, unknown> })
    found.push(...findAllByType(el.props?.children, type))
    return found
  }
  return []
}

describe('GrupoDetallePage — gate', () => {
  it('shows the disabled message and resolves nothing when the flag is off', async () => {
    setup({ isEnabled: false })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await GrupoDetallePage(params())) as any
    expect(extractText(element)).toMatch(/deshabilitado/i)
    expect(loadTallerDetalleMock).not.toHaveBeenCalled()
  })

  it('asks to log in and resolves nothing when there is no user', async () => {
    setup({ user: null })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await GrupoDetallePage(params())) as any
    expect(extractText(element)).toMatch(/iniciar sesión/i)
    expect(loadTallerDetalleMock).not.toHaveBeenCalled()
  })

  it('shows a session-resolution message when the session cannot be resolved', async () => {
    setup({ hasSession: false })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await GrupoDetallePage(params())) as any
    expect(extractText(element)).toMatch(/no se pudo resolver tu sesión/i)
    expect(loadTallerDetalleMock).not.toHaveBeenCalled()
  })

  it('calls notFound() (404) when the taller slug does not resolve', async () => {
    setup({ taller: null })
    await expect(GrupoDetallePage(params('no-existe'))).rejects.toThrow(
      /NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/,
    )
  })

  it('calls notFound() (404) for a completely unknown grupo id (no grupo, no own asignación)', async () => {
    setup({ grupo: null, miAsignacion: null })
    await expect(GrupoDetallePage(params())).rejects.toThrow(
      /NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/,
    )
  })

  it('calls notFound() (404) when the grupo belongs to a DIFFERENT edición', async () => {
    // loadGrupoDetalle resolves, but its own edicionId does not match the
    // URL's — loadEdicionLocalDetalle(grupo.edicionId) would then return an
    // edición whose id also does not match the URL's edicionId param.
    setup({ grupo: { ...GRUPO, edicionId: 'e-OTHER' }, edicionDetalle: { ...EDICION, id: 'e-OTHER' } })
    await expect(GrupoDetallePage(params('proximo-paso', 'e-1', 'g-1'))).rejects.toThrow(
      /NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/,
    )
    expect(grupoDetalleModule.loadGrupoAsignaciones).not.toHaveBeenCalled()
  })

  it('calls notFound() (404) when the edición belongs to a DIFFERENT taller', async () => {
    setup({ edicionDetalle: { ...EDICION, taller_slug: 'otro-taller' } })
    await expect(GrupoDetallePage(params('proximo-paso', 'e-1', 'g-1'))).rejects.toThrow(
      /NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/,
    )
    expect(grupoDetalleModule.loadGrupoAsignaciones).not.toHaveBeenCalled()
  })

  it('calls notFound() (404) in the degraded path when the grupo belongs to a DIFFERENT taller entirely', async () => {
    setup({ grupo: null, miAsignacion: { id: 'a-own', rol: 'lider', activo: true }, equipoDeGrupo: 'eq-OTHER' })
    await expect(GrupoDetallePage(params())).rejects.toThrow(
      /NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/,
    )
  })
})

describe('GrupoDetallePage — full access', () => {
  it('shows the equipo (líder/voluntario roster) with names and rol badges', async () => {
    setup({})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await GrupoDetallePage(params())) as any
    const text = extractText(element)
    expect(text).toMatch(/Juan Pérez/)
    expect(text).toMatch(/María Gómez/)
  })

  it('shows the clases list ordered by número', async () => {
    setup({})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await GrupoDetallePage(params())) as any
    const text = extractText(element)
    expect(text).toMatch(/Clase\s*1/)
    expect(text).toMatch(/Clase\s*2/)
  })

  it('names each clase with its tema in the list, falling back when tema is NULL', async () => {
    // Decisiones (Interfaz): "Clase {numero} · {tema}". Deferred from T2 with
    // an explicit "decidir si entra en T3" — it does: same section, one line,
    // and never invents a name for the clase without tema.
    setup({})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await GrupoDetallePage(params())) as any
    const text = extractText(element)
    expect(text).toMatch(/Clase\s*1.*Introducción/)
    expect(text).toMatch(/Clase\s*2/)
    expect(text).not.toMatch(/Clase\s*2.*·/)
  })

  it('shows asistencia for the default (first) clase by person name', async () => {
    setup({})
    await GrupoDetallePage(params())
    expect(grupoDetalleModule.loadAsistenciaPorClase).toHaveBeenCalledWith(expect.anything(), 's-1')
  })

  it('shows asistencia for the clase selected via ?clase=', async () => {
    setup({})
    await GrupoDetallePage(params('proximo-paso', 'e-1', 'g-1', 's-2'))
    expect(grupoDetalleModule.loadAsistenciaPorClase).toHaveBeenCalledWith(expect.anything(), 's-2')
  })

  it('shows the reporte fields when a reporte exists', async () => {
    setup({})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await GrupoDetallePage(params())) as any
    expect(extractText(element)).toMatch(/Buen avance\./)
  })

  it('shows an empty state when there is no reporte yet and permisos.verReportes is granted', async () => {
    setup({ reporte: null, permisos: { verReportes: true }, inscripcionesGrupo: { aprobadas: [{ id: 'i-1', personaId: 'p-1', nombre: 'Carla Ruiz' }], retiradas: [] } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await GrupoDetallePage(params())) as any
    const vacio = findByType(element, EstadoVacio)
    expect(vacio?.props.titulo).toMatch(/aún no hay reporte/i)
  })

  it('shows a permission-denied empty state for the reporte when verReportes is false', async () => {
    setup({ reporte: null, permisos: { verReportes: false }, inscripcionesGrupo: { aprobadas: [{ id: 'i-1', personaId: 'p-1', nombre: 'Carla Ruiz' }], retiradas: [] } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await GrupoDetallePage(params())) as any
    const vacio = findByType(element, EstadoVacio)
    expect(vacio?.props.titulo).toMatch(/no tenés permiso/i)
  })

  it('passes taller.dream_team_equipo_id to cargarPermisos', async () => {
    setup({})
    await GrupoDetallePage(params())
    expect(cargarPermisosMock).toHaveBeenCalledWith(expect.anything(), 'eq-1')
  })

  it('titles the page with the grupo name and links back to the edición', async () => {
    setup({})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await GrupoDetallePage(params())) as any
    const dashboard = findByType(element, ContenedorDashboard)
    expect(dashboard?.props.titulo).toBe('Martes 7pm')
    expect(dashboard?.props.botonRegreso).toEqual({
      href: rutaEdicion('proximo-paso', 'e-1'),
      texto: 'Octubre 2026',
    })
  })
})

// T4 (odd/tasks/talleres-inscripcion-a-grupo.md) — "su gente" real: the
// inscripciones actually placed in this grupo (taller_inscripciones.
// grupo_id), aprobadas as the main list, retiradas apart and not counted.
describe('GrupoDetallePage — su gente (T4, participantes reales)', () => {
  it('lists aprobadas as the main roster', async () => {
    setup({
      inscripcionesGrupo: {
        aprobadas: [{ id: 'i-1', personaId: 'p-1', nombre: 'Carla Ruiz' }],
        retiradas: [],
      },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await GrupoDetallePage(params())) as any
    expect(extractText(element)).toMatch(/Carla Ruiz/)
  })

  it('lists retiradas in a separate, muted list', async () => {
    setup({
      inscripcionesGrupo: {
        aprobadas: [{ id: 'i-1', personaId: 'p-1', nombre: 'Carla Ruiz' }],
        retiradas: [{ id: 'i-2', personaId: 'p-2', nombre: 'Pedro Soto' }],
      },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await GrupoDetallePage(params())) as any
    const text = extractText(element)
    expect(text).toMatch(/Carla Ruiz/)
    expect(text).toMatch(/Pedro Soto/)
    expect(text).toMatch(/Retirad/)
  })

  it('shows EstadoVacio when there are no participantes at all', async () => {
    setup({ inscripcionesGrupo: { aprobadas: [], retiradas: [] } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await GrupoDetallePage(params())) as any
    // Equipo's own roster (ASIGNACIONES) is non-empty and reporte is set
    // (REPORTE, not null) by default, so the only EstadoVacio in the tree
    // here is su gente's.
    const vacio = findByType(element, EstadoVacio)
    expect(vacio?.props.titulo).toMatch(/no hay participantes/i)
  })

  it('calls loadGrupoInscripciones with the grupo id', async () => {
    setup({})
    await GrupoDetallePage(params())
    expect(grupoDetalleModule.loadGrupoInscripciones).toHaveBeenCalledWith(expect.anything(), 'g-1')
  })
})

// T2 (odd/tasks/talleres-lider-identidad.md) — the líder gets identity in
// the app: membership (talleres_es_miembro_del_grupo) renders the full
// read view instead of the degraded state, and drives honest copy in
// sections that would otherwise say "no tenés permiso" to someone who
// genuinely can read by relation, just holds zero capabilities.
describe('GrupoDetallePage — miembro sin capacidades (T2)', () => {
  it('renders the full read view (no modoLimitado banner) for a member without any capability', async () => {
    setup({ grupo: GRUPO, esMiembro: true, permisos: {} })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await GrupoDetallePage(params())) as any
    const text = extractText(element)
    expect(text).not.toMatch(/todavía no tenés el permiso/i)
    expect(text).toMatch(/Juan Pérez/)
    expect(text).toMatch(/Clase\s*1/)
  })

  it('shows the honest "aún no hay" copy for asistencia when a member has no capabilities', async () => {
    setup({
      grupo: GRUPO,
      esMiembro: true,
      permisos: {},
      asistencia: [],
      inscripcionesGrupo: { aprobadas: [{ id: 'i-1', personaId: 'p-1', nombre: 'Carla Ruiz' }], retiradas: [] },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await GrupoDetallePage(params())) as any
    const vacio = findByType(element, EstadoVacio)
    expect(vacio?.props.titulo).toMatch(/aún no hay asistencia/i)
  })

  it('shows the honest "aún no hay reporte" copy for a member with no capabilities', async () => {
    setup({
      grupo: GRUPO,
      esMiembro: true,
      permisos: {},
      reporte: null,
      inscripcionesGrupo: { aprobadas: [{ id: 'i-1', personaId: 'p-1', nombre: 'Carla Ruiz' }], retiradas: [] },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await GrupoDetallePage(params())) as any
    const vacio = findByType(element, EstadoVacio)
    expect(vacio?.props.titulo).toMatch(/aún no hay reporte/i)
  })

  it('still shows the permission-denied copy for a non-member without capabilities', async () => {
    setup({
      grupo: GRUPO,
      esMiembro: false,
      permisos: {},
      reporte: null,
      inscripcionesGrupo: { aprobadas: [{ id: 'i-1', personaId: 'p-1', nombre: 'Carla Ruiz' }], retiradas: [] },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await GrupoDetallePage(params())) as any
    const vacio = findByType(element, EstadoVacio)
    expect(vacio?.props.titulo).toMatch(/no tenés permiso/i)
  })

  it('does not crash and keeps the degraded state when talleres_es_miembro_del_grupo is missing (fails soft to false)', async () => {
    setup({
      grupo: null,
      miAsignacion: { id: 'a-own', rol: 'lider', activo: true },
      esMiembro: false,
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await GrupoDetallePage(params())) as any
    expect(extractText(element)).toMatch(/todavía no.*ver|no.*permiso/i)
  })
})

describe('GrupoDetallePage — degraded/limited access (real líder, zero capability)', () => {
  it('renders an honest limited state instead of 404 when the caller owns the grupo but RLS hides the full record', async () => {
    setup({ grupo: null, miAsignacion: { id: 'a-own', rol: 'lider', activo: true } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await GrupoDetallePage(params())) as any
    expect(extractText(element)).toMatch(/todavía no.*ver|no.*permiso/i)
  })

  it('still shows the taller name (public) in the limited state', async () => {
    setup({ grupo: null, miAsignacion: { id: 'a-own', rol: 'lider', activo: true } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await GrupoDetallePage(params())) as any
    expect(extractText(element)).toMatch(/Próximo Paso/)
  })

  it('does not crash when asignaciones/sesiones/reporte all resolve empty in the limited state', async () => {
    setup({
      grupo: null,
      miAsignacion: { id: 'a-own', rol: 'lider', activo: true },
      asignaciones: [],
      sesiones: [],
      asistencia: [],
      reporte: null,
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await GrupoDetallePage(params())) as any
    expect(extractText(element).length).toBeGreaterThan(0)
  })
})

// T2 (odd/tasks/talleres-asistencia-lider.md) — read view of ONE marked
// clase, the AttendanceList pattern re-implemented under talleres' own
// components. The page composes it with two plain props (numero, tema) and
// the rows themselves — every value crossing into the 'use client' island
// is JSON-serializable (lección del paso 5: Jest no cruza la frontera
// RSC), asserted below by round-tripping the props through JSON.
describe('GrupoDetallePage — lectura de una clase marcada (T2)', () => {
  it('renders the read view for the selected clase with its número, tema and rows', async () => {
    setup({})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await GrupoDetallePage(params())) as any
    const vista = findByType(element, LecturaAsistenciaClase)
    expect(vista).not.toBeNull()
    expect(vista?.props.numero).toBe(1)
    expect(vista?.props.tema).toBe('Introducción')
    expect(vista?.props.filas).toEqual(ASISTENCIA)
  })

  it('passes serializable props across the RSC boundary (nothing survives JSON that should)', async () => {
    setup({})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await GrupoDetallePage(params())) as any
    const vista = findByType(element, LecturaAsistenciaClase)
    const { numero, tema, filas } = vista?.props as {
      numero: number
      tema: string | null
      filas: readonly AsistenciaPersonaRow[]
    }
    expect(JSON.parse(JSON.stringify({ numero, tema, filas }))).toEqual({ numero, tema, filas })
  })

  it('passes tema through as NULL for the clase without one (read view falls back to "Clase {numero}")', async () => {
    setup({})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await GrupoDetallePage(params('proximo-paso', 'e-1', 'g-1', 's-2'))) as any
    const vista = findByType(element, LecturaAsistenciaClase)
    expect(vista?.props.numero).toBe(2)
    expect(vista?.props.tema).toBeNull()
  })

  it('does not render the read view while the clase has no asistencia yet', async () => {
    // `ver` granted (like the reporte empty-state tests) so the empty copy
    // is the "nothing yet" branch, not the capability-denied one.
    setup({ asistencia: [], permisos: { ver: true } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await GrupoDetallePage(params())) as any
    expect(findByType(element, LecturaAsistenciaClase)).toBeNull()
    // Several EstadoVacio exist on this page (participantes section first);
    // assert the one the asistencia section actually renders.
    const vacios = findAllByType(element, EstadoVacio)
    expect(vacios.some((e) => /aún no hay asistencia/i.test(String(e.props.titulo)))).toBe(true)
  })

  it('does not load asistencia for a ?clase= that does not belong to this grupo', async () => {
    setup({})
    await GrupoDetallePage(params('proximo-paso', 'e-1', 'g-1', 's-de-otro-grupo'))
    expect(grupoDetalleModule.loadAsistenciaPorClase).not.toHaveBeenCalled()
  })
})

// T3 (odd/tasks/talleres-asistencia-lider.md) — the WRITE side of the same
// screen. Who may pass list is a relationship question answered by
// talleres_rol_en_grupo (or, for a coordinator/director with scope, by
// permisos.gestionarGrupos — criterio 8), and a `cerrada` clase freezes the
// attendance: the control is HIDDEN, never disabled (Decisiones, Interfaz).
describe('GrupoDetallePage — pasar lista / cerrar clase (T3)', () => {
  it('shows the "Pasar lista" entry for the assigned líder', async () => {
    setup({ miRol: 'lider', inscripcionesGrupo: GENTE })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await GrupoDetallePage(params())) as any
    expect(extractText(element)).toMatch(/Pasar lista/)
  })

  it('shows the "Pasar lista" entry for an assigned voluntario too', async () => {
    setup({ miRol: 'voluntario', inscripcionesGrupo: GENTE })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await GrupoDetallePage(params())) as any
    expect(extractText(element)).toMatch(/Pasar lista/)
  })

  it('hides the "Pasar lista" entry from someone with no relationship and no capability', async () => {
    setup({ miRol: null, permisos: {}, inscripcionesGrupo: GENTE })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await GrupoDetallePage(params())) as any
    expect(extractText(element)).not.toMatch(/Pasar lista/)
    expect(findByType(element, CerrarClase)).toBeNull()
    expect(findByType(element, RegistroAsistenciaClase)).toBeNull()
    // The read view still renders — hiding the control never hides the data.
    expect(findByType(element, LecturaAsistenciaClase)).not.toBeNull()
  })

  it('shows it for a capability holder with no assignment (coordinador con alcance)', async () => {
    setup({ miRol: null, permisos: { gestionarGrupos: true }, inscripcionesGrupo: GENTE })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await GrupoDetallePage(params())) as any
    expect(extractText(element)).toMatch(/Pasar lista/)
    expect(findByType(element, CerrarClase)).not.toBeNull()
  })

  it('shows "Cerrar clase" only to the líder, never to a voluntario', async () => {
    setup({ miRol: 'voluntario', inscripcionesGrupo: GENTE })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const voluntario = (await GrupoDetallePage(params())) as any
    expect(findByType(voluntario, CerrarClase)).toBeNull()

    setup({ miRol: 'lider', inscripcionesGrupo: GENTE })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const lider = (await GrupoDetallePage(params())) as any
    expect(findByType(lider, CerrarClase)).not.toBeNull()
  })

  it('hides "Pasar lista" and the register form when the clase is cerrada', async () => {
    setup({
      miRol: 'lider',
      sesiones: SESIONES.map((s) => ({ ...s, estado: 'cerrada' })),
      inscripcionesGrupo: GENTE,
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await GrupoDetallePage(params())) as any
    expect(extractText(element)).not.toMatch(/Pasar lista/)
    expect(findByType(element, CerrarClase)).toBeNull()
    expect(findByType(element, RegistroAsistenciaClase)).toBeNull()
    // Criterion 6: after closing, the READ view is what remains.
    expect(findByType(element, LecturaAsistenciaClase)).not.toBeNull()
  })

  it('renders the register form for the líder with plain-JSON props (frontera RSC)', async () => {
    setup({ miRol: 'lider', inscripcionesGrupo: GENTE })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await GrupoDetallePage(params())) as any
    const registro = findByType(element, RegistroAsistenciaClase)
    expect(registro).not.toBeNull()
    expect(registro?.props.sesionId).toBe('s-1')
    expect(registro?.props.numero).toBe(1)
    expect(registro?.props.tema).toBe('Introducción')
    expect(registro?.props.filas).toEqual([
      { id: 'i-1', nombre: 'Ana López' },
      { id: 'i-2', nombre: 'Luis Ruiz' },
    ])
    expect(registro?.props.marcasPrevias).toEqual([
      { inscripcionId: 'i-1', estado: 'presente', motivo: null },
      { inscripcionId: 'i-2', estado: 'ausente', motivo: 'Viaje de trabajo' },
    ])
    const { sesionId, numero, tema, filas, marcasPrevias } = registro?.props as Record<string, unknown>
    expect(JSON.parse(JSON.stringify({ sesionId, numero, tema, filas, marcasPrevias }))).toEqual({
      sesionId,
      numero,
      tema,
      filas,
      marcasPrevias,
    })
    // The form replaces the read view while the clase is editable.
    expect(findByType(element, LecturaAsistenciaClase)).toBeNull()
  })
})

// T4 (odd/tasks/talleres-asistencia-lider.md) — the líder closes the taller
// by sending the reporte from this same screen. Two rules, both from
// Decisiones/Criterio 7: the control is HIDDEN (never disabled) while any
// clase of the grupo is still open, with honest copy counting what is
// missing — never a vague "no disponible"; and it is offered ONLY to
// someone who can actually send (talleres_rol_en_grupo = 'lider', or the
// scoped capability of criterio 8).
describe('GrupoDetallePage — enviar reporte (T4)', () => {
  const SESIONES_CERRADAS: readonly GrupoSesion[] = [
    { ...SESIONES[0], estado: 'cerrada' },
    { ...SESIONES[1], estado: 'cancelada' },
  ]

  it('hides the button while clases are open and says HOW MANY are missing', async () => {
    // Both SESIONES are `programada` → 2 open. Criterio 7 + Decisiones:
    // hidden, never disabled, and the copy is honest about the count.
    setup({ miRol: 'lider', reporte: REPORTE })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await GrupoDetallePage(params())) as any
    expect(findByType(element, EnviarReporte)).toBeNull()
    const text = extractText(element)
    expect(text).toMatch(/Faltan 2 clases por cerrar antes de poder enviar el reporte/)
    expect(text).not.toMatch(/Enviar reporte/)
  })

  it('counts singular when exactly one clase is still open', async () => {
    setup({
      miRol: 'lider',
      reporte: REPORTE,
      sesiones: [{ ...SESIONES[0], estado: 'cerrada' }, SESIONES[1]],
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await GrupoDetallePage(params())) as any
    expect(findByType(element, EnviarReporte)).toBeNull()
    expect(extractText(element)).toMatch(/Falta 1 clase por cerrar antes de poder enviar el reporte/)
  })

  it('shows the button when every clase is cerrada or cancelada', async () => {
    setup({ miRol: 'lider', reporte: REPORTE, sesiones: SESIONES_CERRADAS })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await GrupoDetallePage(params())) as any
    expect(findByType(element, EnviarReporte)).not.toBeNull()
    expect(extractText(element)).not.toMatch(/Faltan? \d+ clase/)
  })

  it('hides the button AND the copy from someone with no relationship and no capability', async () => {
    setup({ miRol: null, permisos: {}, reporte: REPORTE, sesiones: SESIONES_CERRADAS })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await GrupoDetallePage(params())) as any
    expect(findByType(element, EnviarReporte)).toBeNull()
    // The honest count is for whoever could act — an outsider gets neither.
    expect(extractText(element)).not.toMatch(/clases? por cerrar/)
    // Hiding the control never hides the data: the reporte card renders.
    expect(extractText(element)).toMatch(/Buen avance\./)
  })

  it('hides it from an assigned voluntario (criterio 3: sólo el líder envía)', async () => {
    setup({ miRol: 'voluntario', reporte: REPORTE, sesiones: SESIONES_CERRADAS })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await GrupoDetallePage(params())) as any
    expect(findByType(element, EnviarReporte)).toBeNull()
    expect(extractText(element)).not.toMatch(/clases? por cerrar/)
  })

  it('shows it to a coordinador con alcance (criterio 8, capacity over relation)', async () => {
    setup({
      miRol: null,
      permisos: { gestionarGrupos: true },
      reporte: REPORTE,
      sesiones: SESIONES_CERRADAS,
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await GrupoDetallePage(params())) as any
    expect(findByType(element, EnviarReporte)).not.toBeNull()
  })

  it('passes a plain-JSON prop across the RSC boundary (frontera RSC)', async () => {
    setup({ miRol: 'lider', reporte: REPORTE, sesiones: SESIONES_CERRADAS })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await GrupoDetallePage(params())) as any
    const { grupoId } = findByType(element, EnviarReporte)?.props as { grupoId: string }
    expect(grupoId).toBe('g-1')
    expect(JSON.parse(JSON.stringify({ grupoId }))).toEqual({ grupoId })
  })

  it('offers nothing to send when the reporte was already sent (the DB refuses it)', async () => {
    setup({
      miRol: 'lider',
      reporte: { ...REPORTE, estado: 'enviado', firmaLiderFecha: '2026-10-20T00:00:00Z' },
      sesiones: SESIONES_CERRADAS,
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await GrupoDetallePage(params())) as any
    expect(findByType(element, EnviarReporte)).toBeNull()
    expect(extractText(element)).not.toMatch(/clases? por cerrar/)
    // The badge still tells the truth.
    expect(extractText(element)).toMatch(/Enviado/)
  })

  it('offers nothing to send when there is no reporte yet (creation is out of scope)', async () => {
    setup({ miRol: 'lider', reporte: null, sesiones: SESIONES_CERRADAS })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await GrupoDetallePage(params())) as any
    expect(findByType(element, EnviarReporte)).toBeNull()
  })
})
