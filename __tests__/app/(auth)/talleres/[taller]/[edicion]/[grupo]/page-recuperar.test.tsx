/**
 * @jest-environment node
 *
 * T8b follow-up (odd/tasks/talleres-reserva-publica.md, S17, L24) — who is
 * offered «Recuperar clase» on /talleres/[taller]/[edicion]/[grupo]. The
 * control follows talleres_registrar_recuperacion's own authority: the
 * grupo's líder, or director.write / coordinator.write on the grupo's
 * node, and never once the edición is closed (cerrada_en). admin.manage
 * alone (which makes permisos.gestionarGrupos true) is refused by the RPC,
 * so the page must not offer it either.
 *
 * Same structural-inspection approach as page.test.tsx (the element tree
 * is walked without rendering).
 */

import GrupoDetallePage from '@/app/(auth)/talleres/[taller]/[edicion]/[grupo]/page'
import { AsistenciaClaseCerrada } from '@/components/talleres/recuperar/asistencia-clase-cerrada.client'
import { LecturaAsistenciaClase } from '@/components/talleres/lectura-asistencia-clase.client'
import { PERMISOS_TALLER_ALL_FALSE, type PermisosTaller } from '@/lib/platform/talleres/permisos'
import type { TallerDetalle } from '@/lib/platform/talleres/catalogo'
import type { EdicionLocalDetalle } from '@/lib/platform/talleres/operacional'
import type { RecuperacionClase } from '@/lib/platform/talleres/recuperar-clase'

jest.mock('@/lib/platform/talleres/flags', () => ({ isTalleresEnabled: jest.fn(() => true) }))
jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: jest.fn() }))
jest.mock('@/lib/auth/platformSessionReadOnly', () => ({
  findPlatformSessionPersonaByAuthId: jest.fn(),
  resolveReadOnlyPlatformSession: jest.fn(),
}))
jest.mock('@/lib/platform/talleres/catalogo', () => ({ loadTallerDetalle: jest.fn() }))
jest.mock('@/lib/platform/talleres/operacional', () => ({ loadEdicionLocalDetalle: jest.fn() }))
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
jest.mock('@/lib/platform/talleres/recuperar-clase', () => {
  const actual = jest.requireActual('@/lib/platform/talleres/recuperar-clase')
  return {
    ...actual,
    loadPermiteRecuperar: jest.fn(),
    loadRecuperacionesGrupo: jest.fn(),
    loadMarcasGrupo: jest.fn(),
  }
})

const m = <T,>(path: string) => jest.requireMock(path) as T
const serverMock = m<{ createSupabaseServerClient: jest.Mock }>('@/lib/supabase/server')
const sessionMock = m<{ resolveReadOnlyPlatformSession: jest.Mock }>('@/lib/auth/platformSessionReadOnly')
const catalogoMock = m<{ loadTallerDetalle: jest.Mock }>('@/lib/platform/talleres/catalogo')
const operacionalMock = m<{ loadEdicionLocalDetalle: jest.Mock }>('@/lib/platform/talleres/operacional')
const grupoMock = m<Record<string, jest.Mock>>('@/lib/platform/talleres/grupo-detalle')
const permisosMock = m<{ cargarPermisos: jest.Mock }>('@/lib/platform/talleres/permisos')
const recuperarMock = m<Record<string, jest.Mock>>('@/lib/platform/talleres/recuperar-clase')

const TALLER = {
  id: 't-1',
  slug: 'parejas',
  nombre: 'Parejas',
  dream_team_equipo_id: 'eq-1',
  clases_minimas_para_completar: 3,
  ediciones: [],
} as unknown as TallerDetalle

const EDICION = {
  id: 'e-1',
  taller_id: 't-1',
  taller_nombre: 'Parejas',
  taller_slug: 'parejas',
  nombre_snapshot: 'Octubre 2026',
  cerrada_en: null,
} as unknown as EdicionLocalDetalle

const SESION_CERRADA = {
  id: 's-1',
  numero: 1,
  fechaProgramada: '2026-10-06',
  fechaRealizada: '2026-10-06',
  estado: 'cerrada',
  tema: null,
}

const ASISTENCIA = [
  { id: 'as-1', inscripcionId: 'i-1', personaId: 'p-1', nombre: 'Ana López', estado: 'presente', motivo: null },
  { id: 'as-2', inscripcionId: 'i-2', personaId: 'p-2', nombre: 'Luis Ruiz', estado: 'ausente', motivo: 'Viaje' },
]

interface Caso {
  readonly miRol?: 'lider' | 'voluntario' | null
  readonly permisos?: Partial<PermisosTaller>
  /** Capabilities auth_has_talleres_capability_scoped answers true for. */
  readonly capacidades?: readonly string[]
  readonly cerradaEn?: string | null
  readonly recuperaciones?: readonly RecuperacionClase[]
}

function setup(caso: Caso): jest.Mock {
  const rpc = jest.fn(async (nombre: string, args: { p_capability_key?: string; p_equipo_id?: string }) => {
    if (nombre === 'auth_has_talleres_capability_scoped') {
      const ok = args.p_equipo_id === 'eq-1' && (caso.capacidades ?? []).includes(args.p_capability_key ?? '')
      return { data: ok, error: null }
    }
    return { data: null, error: null }
  })
  serverMock.createSupabaseServerClient.mockResolvedValue({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'auth-1' } }, error: null }) },
    rpc,
  })
  sessionMock.resolveReadOnlyPlatformSession.mockResolvedValue({
    personaId: 'p-yo',
    subjectAuthId: 'auth-1',
    globalRoles: [],
    contexts: [],
    capabilities: [],
  })
  catalogoMock.loadTallerDetalle.mockResolvedValue(TALLER)
  operacionalMock.loadEdicionLocalDetalle.mockResolvedValue({ ...EDICION, cerrada_en: caso.cerradaEn ?? null })
  grupoMock.loadGrupoDetalle.mockResolvedValue({
    id: 'g-1',
    nombre: 'Martes',
    capacidad: 10,
    estado: 'activo',
    cohorteId: 'c-1',
    edicionId: 'e-1',
  })
  grupoMock.loadMiAsignacionGrupo.mockResolvedValue(null)
  grupoMock.resolveEquipoDeGrupo.mockResolvedValue('eq-1')
  grupoMock.loadGrupoAsignaciones.mockResolvedValue([{ id: 'a-1', personaId: 'p-lider', rol: 'lider', nombre: 'Juan' }])
  grupoMock.loadGrupoSesiones.mockResolvedValue([SESION_CERRADA])
  grupoMock.loadAsistenciaPorClase.mockResolvedValue(ASISTENCIA)
  grupoMock.loadGrupoReporte.mockResolvedValue(null)
  grupoMock.loadGrupoInscripciones.mockResolvedValue({ aprobadas: [], retiradas: [] })
  grupoMock.loadEsMiembroDelGrupo.mockResolvedValue(caso.miRol != null)
  grupoMock.loadRolEnGrupo.mockResolvedValue(caso.miRol ?? null)
  permisosMock.cargarPermisos.mockResolvedValue({ ...PERMISOS_TALLER_ALL_FALSE, ver: true, ...caso.permisos })
  recuperarMock.loadPermiteRecuperar.mockResolvedValue(true)
  recuperarMock.loadRecuperacionesGrupo.mockResolvedValue(caso.recuperaciones ?? [])
  recuperarMock.loadMarcasGrupo.mockResolvedValue([])
  return rpc
}

async function render(): Promise<unknown> {
  return GrupoDetallePage({
    params: Promise.resolve({ taller: 'parejas', edicion: 'e-1', grupo: 'g-1' }),
    searchParams: Promise.resolve({ clase: 's-1' }),
  })
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

beforeEach(() => {
  jest.clearAllMocks()
})

describe('GrupoDetallePage — «Recuperar clase» follows the RPC authority (S17)', () => {
  it('admin.manage alone (gestionarGrupos) is not offered «Recuperar clase»', async () => {
    setup({ permisos: { gestionarGrupos: true }, capacidades: ['talleres_crecimiento.admin.manage'] })
    const tree = await render()
    expect(findByType(tree, AsistenciaClaseCerrada)).toBeNull()
    expect(findByType(tree, LecturaAsistenciaClase)).not.toBeNull()
  })

  it('director.write on the grupo node is offered it', async () => {
    const rpc = setup({ permisos: { gestionarGrupos: true }, capacidades: ['talleres_crecimiento.director.write'] })
    const tree = await render()
    expect(findByType(tree, AsistenciaClaseCerrada)?.props.puedeRecuperar).toBe(true)
    expect(rpc).toHaveBeenCalledWith('auth_has_talleres_capability_scoped', {
      p_capability_key: 'talleres_crecimiento.director.write',
      p_equipo_id: 'eq-1',
    })
  })

  it('coordinator.write on the grupo node is offered it', async () => {
    setup({ permisos: { gestionarGrupos: true }, capacidades: ['talleres_crecimiento.coordinator.write'] })
    const tree = await render()
    expect(findByType(tree, AsistenciaClaseCerrada)?.props.puedeRecuperar).toBe(true)
  })

  it('the grupo líder is offered it without any capability', async () => {
    setup({ miRol: 'lider' })
    const tree = await render()
    expect(findByType(tree, AsistenciaClaseCerrada)?.props.puedeRecuperar).toBe(true)
  })

  it('a voluntario is not', async () => {
    setup({ miRol: 'voluntario' })
    const tree = await render()
    expect(findByType(tree, AsistenciaClaseCerrada)).toBeNull()
  })

  it('a closed edición hides it from the líder', async () => {
    setup({ miRol: 'lider', cerradaEn: '2026-10-30T12:00:00Z' })
    const tree = await render()
    expect(findByType(tree, AsistenciaClaseCerrada)).toBeNull()
    expect(findByType(tree, LecturaAsistenciaClase)).not.toBeNull()
  })

  it('a closed edición hides it from a director too', async () => {
    setup({
      permisos: { gestionarGrupos: true },
      capacidades: ['talleres_crecimiento.director.write'],
      cerradaEn: '2026-10-30T12:00:00Z',
    })
    const tree = await render()
    expect(findByType(tree, AsistenciaClaseCerrada)).toBeNull()
  })

  it('an admin.manage-only reader still sees a recovered clase, read-only', async () => {
    setup({
      permisos: { gestionarGrupos: true },
      capacidades: ['talleres_crecimiento.admin.manage'],
      recuperaciones: [{ id: 'r-1', sesionId: 's-1', personaId: 'p-2', fecha: '2026-10-08', dadaPor: 'p-lider', nota: null }],
    })
    const tree = await render()
    expect(findByType(tree, AsistenciaClaseCerrada)?.props.puedeRecuperar).toBe(false)
  })
})
