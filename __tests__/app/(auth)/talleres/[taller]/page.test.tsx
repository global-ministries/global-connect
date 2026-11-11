/**
 * @jest-environment node
 *
 * T3 (odd/tasks/talleres-configuracion-del-taller.md) — /talleres/[taller]
 * redesigned to the system pattern: cabecera (nombre editable in place),
 * Equipo (the node's real active servidores, "Asignar coordinador" gone
 * for good), Clases/Grupos (plantilla — added in a later T3 commit; this
 * file grows with them) and Ediciones.
 *
 * Mirrors the gate pattern of __tests__/app/(auth)/talleres/page.test.tsx
 * (flag -> user -> session, each an informational card, inspected
 * structurally via extractText/findByType rather than full rendering —
 * OpenEdicionForm/EditarNombreTaller are real client components with
 * their own hooks, so this RSC-only test mocks them to marker components
 * and inspects the unexecuted element tree's props, exactly like the
 * catalog page test does for <CatalogoTalleresClient>).
 *
 * Beyond the shared gate, this page adds one more early-exit: slug
 * resolution. `talleres` is world-readable (talleres_select_all, USING
 * true) so notFound() only fires for a slug with genuinely no row — never
 * as a stand-in for "you can't see this taller".
 *
 * The core of this test: every control's visibility is wired straight to
 * cargarPermisos()'s booleans, never a flat capability array, and
 * "Asignar coordinador" is gone from every render path.
 *
 * R3d (odd/tasks/talleres-rediseno.md) — the v2 page (artboard 22) moves the
 * ediciones list, «Abrir edición» and the side column into components of
 * components/talleres/taller/. This RSC test checks what the page hands
 * them (props), and __tests__/components/talleres/taller/ renders them.
 */

import TallerDetallePage from '@/app/(auth)/talleres/[taller]/page'
import { AbrirEdicionProvider, BotonAbrirEdicion } from '@/components/talleres/taller/abrir-edicion'
import { PuntoEstado } from '@/components/ui/punto-estado'
import { EdicionesTaller } from '@/components/talleres/taller/ediciones-taller'
import {
  EquipoTaller,
  PaginaPublicaTaller,
  PasosAbrirEdicion,
} from '@/components/talleres/taller/partes-taller'
import { EditarNombreTaller } from '@/components/talleres/editar-nombre-taller'
import { EditarDescripcionTaller } from '@/components/talleres/editar-descripcion-taller'
import { PlantillaClasesSection } from '@/components/talleres/plantilla-clases-section'
import { PlantillaGruposSection } from '@/components/talleres/plantilla-grupos-section'
import { ConfiguracionTaller } from '@/components/talleres/configuracion-taller'
import { PaginaSistema, TituloSistema } from '@/components/ui/sistema-diseno'
import { PERMISOS_TALLER_ALL_FALSE, type PermisosTaller } from '@/lib/platform/talleres/permisos'
import type { TallerDetalle } from '@/lib/platform/talleres/catalogo'
import type { CargaServidoresDelTaller, ServidorDelTaller } from '@/lib/platform/talleres/servidores-del-taller'
import { rutaCatalogo } from '@/lib/platform/talleres/rutas'
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
}))

jest.mock('@/lib/platform/talleres/servidores-del-taller', () => {
  const actual = jest.requireActual('@/lib/platform/talleres/servidores-del-taller')
  return { ...actual, loadServidoresDelTaller: jest.fn() }
})

jest.mock('@/lib/platform/talleres/plantilla', () => {
  const actual = jest.requireActual('@/lib/platform/talleres/plantilla')
  return { ...actual, loadPlantillaClases: jest.fn(), loadPlantillaGrupos: jest.fn() }
})

jest.mock('@/lib/platform/talleres/temporadas', () => ({
  loadTemporadasAbiertas: jest.fn(),
}))

jest.mock('@/lib/platform/talleres/refrescar-estados', () => ({
  refrescarEstadosEdiciones: jest.fn(),
}))

jest.mock('@/components/talleres/taller/abrir-edicion', () => ({
  AbrirEdicionProvider: () => null,
  BotonAbrirEdicion: () => null,
}))

jest.mock('@/components/talleres/taller/ediciones-taller', () => ({
  EdicionesTaller: () => null,
}))

jest.mock('@/components/talleres/configuracion-taller', () => ({
  ConfiguracionTaller: () => null,
}))

jest.mock('@/components/talleres/editar-nombre-taller', () => ({
  EditarNombreTaller: () => null,
}))

jest.mock('@/components/talleres/editar-descripcion-taller', () => ({
  EditarDescripcionTaller: () => null,
}))

jest.mock('@/components/talleres/plantilla-clases-section', () => ({
  PlantillaClasesSection: () => null,
}))

jest.mock('@/components/talleres/plantilla-grupos-section', () => ({
  PlantillaGruposSection: () => null,
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
const loadServidoresDelTallerMock = jest.requireMock('@/lib/platform/talleres/servidores-del-taller')
  .loadServidoresDelTaller as jest.Mock
const loadPlantillaClasesMock = jest.requireMock('@/lib/platform/talleres/plantilla')
  .loadPlantillaClases as jest.Mock
const loadPlantillaGruposMock = jest.requireMock('@/lib/platform/talleres/plantilla')
  .loadPlantillaGrupos as jest.Mock
const loadTemporadasAbiertasMock = jest.requireMock('@/lib/platform/talleres/temporadas')
  .loadTemporadasAbiertas as jest.Mock
const refrescarEstadosEdicionesMock = jest.requireMock('@/lib/platform/talleres/refrescar-estados')
  .refrescarEstadosEdiciones as jest.Mock

const fromMock = jest.fn()

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
  vinculo: null,
  regimen: 'temporada',
  cierre_inscripcion_offset_dias: 0,
  intervalo_ediciones_dias: null,
  clases_minimas_para_completar: null,
  ediciones: [
    {
      id: 'e-1',
      nombre_snapshot: 'Septiembre 2026',
      tipo: 'pareja',
      estado: 'abierto',
      total_inscripciones: 3,
      temporada_id: null,
      fecha_inicio: '2026-09-01',
      fecha_fin: '2026-09-22',
    },
  ],
}

const SERVIDOR_LIDER: ServidorDelTaller = {
  personaId: 'p-1',
  nombre: 'Ana',
  apellido: 'Gómez',
  rolServicio: 'Líder',
  equipoLabel: 'Próximo Paso',
}

interface SetupOpts {
  isEnabled?: boolean
  user?: { id: string } | null
  hasSession?: boolean
  taller?: TallerDetalle | null
  permisos?: Partial<PermisosTaller>
  servidores?: readonly ServidorDelTaller[]
  cargaServidores?: CargaServidoresDelTaller
  plantillaClases?: readonly { id: string; numero: number; tema: string; activo: boolean }[]
  plantillaGrupos?: readonly {
    id: string
    nombre: string
    orden: number
    capacidad: number
    activo: boolean
    facilitadores: readonly unknown[]
  }[]
  /** T11 — Dream Team capability keys for the viewer (gates "Gestionar en Servidores"). */
  capabilities?: readonly string[]
  /** R3d — talleres.publico as the select returns it; 'error' makes the select fail. */
  publico?: boolean | 'error'
}

function setup(opts: SetupOpts): void {
  flagsMock.mockReset().mockReturnValue(opts.isEnabled ?? true)

  const publico = opts.publico ?? false
  fromMock.mockReset().mockReturnValue({
    select: () => ({
      eq: () => ({
        maybeSingle: () =>
          Promise.resolve(
            publico === 'error'
              ? { data: null, error: { message: 'boom' } }
              : { data: { publico }, error: null },
          ),
      }),
    }),
  })
  createSupabaseServerClientMock.mockReset().mockResolvedValue({
    from: fromMock,
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
          capabilities: (opts.capabilities ?? []).map((key) => ({
            key,
            experience: 'dream_team',
            scopeType: 'experience',
            source: 'test',
          })),
        }
      : null,
  )

  loadTallerDetalleMock.mockReset().mockResolvedValue(opts.taller === undefined ? TALLER : opts.taller)
  cargarPermisosMock.mockReset().mockResolvedValue({ ...PERMISOS_TALLER_ALL_FALSE, ...opts.permisos })
  fetchRutaEquipoMock.mockReset().mockResolvedValue(null)
  loadServidoresDelTallerMock
    .mockReset()
    .mockResolvedValue(opts.cargaServidores ?? { ok: true, servidores: opts.servidores ?? [] })
  loadPlantillaClasesMock.mockReset().mockResolvedValue(opts.plantillaClases ?? [])
  loadPlantillaGruposMock.mockReset().mockResolvedValue(opts.plantillaGrupos ?? [])
  loadTemporadasAbiertasMock.mockReset().mockResolvedValue([])
  refrescarEstadosEdicionesMock.mockReset().mockResolvedValue(undefined)
}

function params(taller = 'matrimonio-sobre-la-roca', searchParams: { creadas?: string } = {}) {
  return { params: Promise.resolve({ taller }), searchParams: Promise.resolve(searchParams) }
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

/** The props AbrirEdicionProvider hands OpenEdicionForm (null without the provider). */
function formulario(node: unknown): { props: Record<string, unknown> } | null {
  const provider = findByType(node, AbrirEdicionProvider)
  return provider ? { props: provider.props.formulario as Record<string, unknown> } : null
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

describe('TallerDetallePage — gate', () => {
  it('shows the disabled message and resolves nothing when the flag is off', async () => {
    setup({ isEnabled: false })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TallerDetallePage(params())) as any
    expect(extractText(element)).toMatch(/deshabilitado/i)
    expect(loadTallerDetalleMock).not.toHaveBeenCalled()
  })

  it('asks to log in (neutral Spanish, no voseo) and resolves nothing when there is no user', async () => {
    setup({ user: null })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TallerDetallePage(params())) as any
    expect(extractText(element)).toMatch(/necesitas iniciar sesión/i)
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

describe('TallerDetallePage — cabecera', () => {
  it('shows EditarNombreTaller when cargarPermisos grants editarTaller', async () => {
    setup({ permisos: { editarTaller: true } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TallerDetallePage(params())) as any
    const editar = findByType(element, EditarNombreTaller)
    expect(editar).not.toBeNull()
    expect(editar?.props).toEqual({
      tallerId: 't-1',
      tallerSlug: 'matrimonio-sobre-la-roca',
      nombre: 'Matrimonio sobre la Roca',
    })
  })

  it('shows the plain nombre (never EditarNombreTaller) for a read-only viewer', async () => {
    setup({ permisos: { editarTaller: false } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TallerDetallePage(params())) as any
    expect(findByType(element, EditarNombreTaller)).toBeNull()
    expect(extractText(element)).toMatch(/Matrimonio sobre la Roca/)
  })

  it('shows EditarDescripcionTaller when cargarPermisos grants editarTaller', async () => {
    setup({ permisos: { editarTaller: true } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TallerDetallePage(params())) as any
    const editar = findByType(element, EditarDescripcionTaller)
    expect(editar).not.toBeNull()
    expect(editar?.props).toEqual({
      tallerId: 't-1',
      tallerSlug: 'matrimonio-sobre-la-roca',
      descripcion: 'Un taller de ejemplo.',
    })
  })

  it('shows the plain descripcion (never EditarDescripcionTaller) for a read-only viewer', async () => {
    setup({ permisos: { editarTaller: false } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TallerDetallePage(params())) as any
    expect(findByType(element, EditarDescripcionTaller)).toBeNull()
    expect(extractText(element)).toMatch(/Un taller de ejemplo\./)
  })

  // T10 (odd/tasks/talleres-configuracion-del-taller.md, design audit) — the
  // read-only nombre used to render a SECOND <h1> on top of the page's own
  // (PaginaSistema's DesktopHeader); it is now a level-2 TituloSistema,
  // so the page keeps exactly one h1.
  it('never renders a raw h1 for the read-only nombre (single page title)', async () => {
    setup({ permisos: { editarTaller: false } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TallerDetallePage(params())) as any
    expect(findByType(element, 'h1')).toBeNull()
    const nombreHeading = findAllByType(element, TituloSistema).find(
      (t) => t.props.nivel === 2 && extractText(t.props.children) === 'Matrimonio sobre la Roca',
    )
    expect(nombreHeading).toBeDefined()
  })

  // T10 — the slug used to render as a visible `<code>` under the nombre;
  // dropped for the design audit (nombre/descripcion edit stays).
  it('never shows the slug in the cabecera', async () => {
    setup({})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TallerDetallePage(params())) as any
    expect(findByType(element, 'code')).toBeNull()
  })
})

describe('TallerDetallePage — Equipo', () => {
  it('hands the active servidores and the plantilla grupos to EquipoTaller', async () => {
    const grupos = [{ id: 'g-1', nombre: 'Grupo Alfa', orden: 1, capacidad: 12, activo: true, facilitadores: [] }]
    setup({ servidores: [SERVIDOR_LIDER], plantillaGrupos: grupos })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TallerDetallePage(params())) as any
    const equipo = findByType(element, EquipoTaller)
    expect(equipo?.props.servidores).toEqual([SERVIDOR_LIDER])
    expect(equipo?.props.sinAutoridad).toBe(false)
    expect(equipo?.props.grupos).toEqual(grupos)
    expect(loadServidoresDelTallerMock).toHaveBeenCalledWith(expect.anything(), 't-1')
  })

  // T11 (flow audit) — «Gestionar en Servidores» only with a Dream Team read
  // capability (the check /admin/dream-team/servidores itself gates on),
  // filtered to this taller's equipo.
  it('links to Gestionar en Servidores, filtered to this taller\'s equipo, when the viewer has Dream Team read capability', async () => {
    setup({ servidores: [SERVIDOR_LIDER], capabilities: ['dream_team.org.manage'] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TallerDetallePage(params())) as any
    expect(findByType(element, EquipoTaller)?.props.enlaceServidores).toBe('/admin/dream-team/servidores?equipo=eq-1')
  })

  it('hides Gestionar en Servidores when the viewer has no Dream Team read capability', async () => {
    setup({ servidores: [SERVIDOR_LIDER], capabilities: [] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TallerDetallePage(params())) as any
    expect(findByType(element, EquipoTaller)?.props.enlaceServidores).toBeNull()
  })

  it('hides Gestionar en Servidores when the taller has no dream_team_equipo_id yet, even with capability', async () => {
    setup({ taller: { ...TALLER, dream_team_equipo_id: null }, capabilities: ['dream_team.org.manage'] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TallerDetallePage(params())) as any
    expect(findByType(element, EquipoTaller)?.props.enlaceServidores).toBeNull()
  })

  // B2 correction (T7) — a 42501 is an access state, never the empty one.
  it('marks the access state, not the empty one, when the viewer has no authority over the equipo', async () => {
    setup({ cargaServidores: { ok: false, reason: 'sin_autoridad' } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TallerDetallePage(params())) as any
    const equipo = findByType(element, EquipoTaller)
    expect(equipo?.props.sinAutoridad).toBe(true)
    expect(equipo?.props.servidores).toEqual([])
  })

  it('a load error is not the access state', async () => {
    setup({ cargaServidores: { ok: false, reason: 'error' } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TallerDetallePage(params())) as any
    expect(findByType(element, EquipoTaller)?.props.sinAutoridad).toBe(false)
  })

  it('passes an empty servidores list to PlantillaGruposSection when the viewer has no authority over the equipo', async () => {
    setup({ cargaServidores: { ok: false, reason: 'sin_autoridad' } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TallerDetallePage(params())) as any
    const gruposSection = findByType(element, PlantillaGruposSection)
    expect(gruposSection?.props.servidores).toEqual([])
  })

  it('never fetches servidores when the taller has no equipo', async () => {
    setup({ taller: { ...TALLER, dream_team_equipo_id: null } })
    await TallerDetallePage(params())
    expect(loadServidoresDelTallerMock).not.toHaveBeenCalled()
  })

  it('never renders "Asignar coordinador" anywhere on the page', async () => {
    setup({ permisos: { editarTaller: true, asignarEquipo: true }, servidores: [SERVIDOR_LIDER] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TallerDetallePage(params())) as any
    expect(extractText(element)).not.toMatch(/Asignar coordinador/i)
  })
})

describe('TallerDetallePage — Clases y Grupos (plantilla)', () => {
  it('passes the loaded plantilla clases to PlantillaClasesSection (cadencia/duracion moved to ConfiguracionTaller)', async () => {
    setup({
      plantillaClases: [
        { id: 'c-1', numero: 1, tema: 'Sígueme', activo: true },
        { id: 'c-2', numero: 2, tema: 'Intimidad con Dios', activo: true },
      ],
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TallerDetallePage(params())) as any
    const clasesSection = findByType(element, PlantillaClasesSection)
    expect(clasesSection?.props.clases).toHaveLength(2)
    expect(clasesSection?.props).not.toHaveProperty('cadenciaDias')
    expect(clasesSection?.props).not.toHaveProperty('duracionMinutos')
  })

  it('gates plantilla edit controls with permisos.editarTaller, not a flat capability', async () => {
    setup({ permisos: { editarTaller: true } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    let element = (await TallerDetallePage(params())) as any
    expect(findByType(element, PlantillaClasesSection)?.props.puedeEditar).toBe(true)
    expect(findByType(element, PlantillaGruposSection)?.props.puedeEditar).toBe(true)

    setup({ permisos: { editarTaller: false } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    element = (await TallerDetallePage(params())) as any
    expect(findByType(element, PlantillaClasesSection)?.props.puedeEditar).toBe(false)
    expect(findByType(element, PlantillaGruposSection)?.props.puedeEditar).toBe(false)
  })

  it('passes the loaded plantilla grupos and the shared servidores list (for the picker) to PlantillaGruposSection', async () => {
    setup({
      servidores: [SERVIDOR_LIDER],
      plantillaGrupos: [
        { id: 'g-1', nombre: 'Grupo Alfa', orden: 1, capacidad: 12, activo: true, facilitadores: [] },
      ],
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TallerDetallePage(params())) as any
    const gruposSection = findByType(element, PlantillaGruposSection)
    expect(gruposSection?.props.grupos).toHaveLength(1)
    expect(gruposSection?.props.servidores).toEqual([SERVIDOR_LIDER])
  })

  it('still renders both plantilla sections (empty) when the taller has no plantilla yet', async () => {
    setup({ plantillaClases: [], plantillaGrupos: [] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TallerDetallePage(params())) as any
    expect(findByType(element, PlantillaClasesSection)).not.toBeNull()
    expect(findByType(element, PlantillaGruposSection)).not.toBeNull()
  })
})

describe('TallerDetallePage — permission wiring', () => {
  it('mounts «Abrir edición» (AbrirEdicionProvider) when cargarPermisos grants abrirEdicion', async () => {
    setup({ permisos: { abrirEdicion: true } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TallerDetallePage(params())) as any
    expect(formulario(element)).not.toBeNull()
    expect(loadTemporadasAbiertasMock).toHaveBeenCalledTimes(1)
  })

  it('never mounts «Abrir edición» when cargarPermisos denies abrirEdicion', async () => {
    setup({ permisos: { abrirEdicion: false } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TallerDetallePage(params())) as any
    expect(formulario(element)).toBeNull()
    expect(loadTemporadasAbiertasMock).not.toHaveBeenCalled()
  })

  // T4 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) —
  // "sesionesEstimadas" is gone: the new one-question form has no clase-
  // count field at all (talleres_crear_edicion never takes one). The page
  // instead derives `clasesPorGrupo`, falling back to 1 (the same
  // fallback talleres_instanciar_edicion applies server-side) rather than
  // null, since there is no more UI branch for "ask the user".
  it('passes clasesPorGrupo as the count of ACTIVE plantilla clases', async () => {
    setup({
      permisos: { abrirEdicion: true },
      plantillaClases: [
        { id: 'c-1', numero: 1, tema: 'Sígueme', activo: true },
        { id: 'c-2', numero: 2, tema: 'Intimidad con Dios', activo: true },
        { id: 'c-3', numero: 3, tema: 'Compañerismo', activo: false },
      ],
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TallerDetallePage(params())) as any
    expect(formulario(element)?.props.clasesPorGrupo).toBe(2)
  })

  it('passes clasesPorGrupo as 1 (never null) when the taller has no active plantilla clases', async () => {
    setup({ permisos: { abrirEdicion: true }, plantillaClases: [] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TallerDetallePage(params())) as any
    expect(formulario(element)?.props.clasesPorGrupo).toBe(1)
  })

  it('passes clasesPorGrupo as 1 when every plantilla clase is inactive', async () => {
    setup({
      permisos: { abrirEdicion: true },
      plantillaClases: [{ id: 'c-1', numero: 1, tema: 'Sígueme', activo: false }],
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TallerDetallePage(params())) as any
    expect(formulario(element)?.props.clasesPorGrupo).toBe(1)
  })

  // T11 (odd/tasks/talleres-configuracion-del-taller.md) — "Crear edición"
  // preview props: tallerSlug (for the post-create redirect), the count of
  // ACTIVE plantilla grupos ("N"), and the list of plantilla facilitadores
  // that open_edicion would omit right now (previewFacilitadoresOmitidos).
  it('passes tallerSlug so OpenEdicionForm can redirect to the new edición', async () => {
    setup({ permisos: { abrirEdicion: true } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TallerDetallePage(params())) as any
    expect(formulario(element)?.props.tallerSlug).toBe('matrimonio-sobre-la-roca')
  })

  // T4 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) —
  // duracion_minutos/cadencia_dias are no longer OpenEdicionForm's concern
  // (it needs cadenciaDias only, for the preview's fecha fin math);
  // duracion_minutos itself now goes to ConfiguracionTaller instead.
  it('passes cadenciaDias and cierreInscripcionOffsetDias verbatim to OpenEdicionForm', async () => {
    setup({
      permisos: { abrirEdicion: true },
      taller: { ...TALLER, cadencia_dias: 14, cierre_inscripcion_offset_dias: -5 },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TallerDetallePage(params())) as any
    const form = formulario(element)
    expect(form?.props.cadenciaDias).toBe(14)
    expect(form?.props.cierreInscripcionOffsetDias).toBe(-5)
  })

  it('passes regimen and intervaloEdicionesDias verbatim to OpenEdicionForm', async () => {
    setup({
      permisos: { abrirEdicion: true },
      taller: { ...TALLER, regimen: 'cadencia', intervalo_ediciones_dias: 28 },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TallerDetallePage(params())) as any
    const form = formulario(element)
    expect(form?.props.regimen).toBe('cadencia')
    expect(form?.props.intervaloEdicionesDias).toBe(28)
  })

  // T1 (odd/tasks/proximo-paso.md, S1)
  it('passes ancla_ediciones to ConfiguracionTaller and OpenEdicionForm', async () => {
    setup({
      permisos: { editarTaller: true, abrirEdicion: true },
      taller: { ...TALLER, regimen: 'cadencia', intervalo_ediciones_dias: null, ancla_ediciones: 'primer_domingo_mes' },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TallerDetallePage(params())) as any
    expect(findByType(element, ConfiguracionTaller)?.props.anclaEdiciones).toBe('primer_domingo_mes')
    expect(formulario(element)?.props.anclaEdiciones).toBe('primer_domingo_mes')
  })

  // T2b (odd/tasks/proximo-paso.md, L6.2)
  it('passes inscripcion_automatica to ConfiguracionTaller', async () => {
    setup({ permisos: { editarTaller: true }, taller: { ...TALLER, inscripcion_automatica: true } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TallerDetallePage(params())) as any
    expect(findByType(element, ConfiguracionTaller)?.props.inscripcionAutomatica).toBe(true)
  })

  it('passes every configuration field verbatim to ConfiguracionTaller', async () => {
    setup({
      permisos: { editarTaller: true },
      taller: {
        ...TALLER,
        tipo: 'pareja',
        vinculo: 'novios',
        regimen: 'cadencia',
        cierre_inscripcion_offset_dias: -3,
        intervalo_ediciones_dias: 28,
        clases_minimas_para_completar: 6,
        minimo_inscritos: 12,
        permite_recuperar_clases: false,
        cadencia_dias: 14,
        duracion_minutos: 75,
      },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TallerDetallePage(params())) as any
    const config = findByType(element, ConfiguracionTaller)
    expect(config?.props).toEqual({
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

  // T9 (odd/tasks/talleres-reserva-publica.md) — mínimo and recuperar come
  // from the loader now; a row without them reads «sin mínimo» and «sí».
  it('passes minimoInscritos null and permiteRecuperarClases true when the row has neither', async () => {
    setup({ permisos: { editarTaller: true } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TallerDetallePage(params())) as any
    const config = findByType(element, ConfiguracionTaller)
    expect(config?.props.minimoInscritos).toBeNull()
    expect(config?.props.permiteRecuperarClases).toBe(true)
  })

  it('passes gruposPlantillaActivos as the count of ACTIVE plantilla grupos', async () => {
    setup({
      permisos: { abrirEdicion: true },
      plantillaGrupos: [
        { id: 'g-1', nombre: 'Grupo Alfa', orden: 1, capacidad: 12, activo: true, facilitadores: [] },
        { id: 'g-2', nombre: 'Grupo Beta', orden: 2, capacidad: 12, activo: true, facilitadores: [] },
        { id: 'g-3', nombre: 'Grupo Gamma', orden: 3, capacidad: 12, activo: false, facilitadores: [] },
      ],
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TallerDetallePage(params())) as any
    expect(formulario(element)?.props.gruposPlantillaActivos).toBe(2)
  })

  it('passes facilitadoresOmitidosPreview naming a plantilla facilitador who is no longer an active servidor, only from ACTIVE grupos', async () => {
    setup({
      permisos: { abrirEdicion: true },
      servidores: [SERVIDOR_LIDER],
      plantillaGrupos: [
        {
          id: 'g-1',
          nombre: 'Grupo Alfa',
          orden: 1,
          capacidad: 12,
          activo: true,
          facilitadores: [
            { id: 'f-1', personaId: 'p-1', rol: 'lider', nombre: 'Ana', apellido: 'Gómez' },
            { id: 'f-2', personaId: 'p-9', rol: 'voluntario', nombre: 'Marta', apellido: 'Díaz' },
          ],
        },
        {
          id: 'g-2',
          nombre: 'Grupo Inactivo',
          orden: 2,
          capacidad: 12,
          activo: false,
          facilitadores: [{ id: 'f-3', personaId: 'p-8', rol: 'lider', nombre: 'Otro', apellido: 'Más' }],
        },
      ],
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TallerDetallePage(params())) as any
    expect(formulario(element)?.props.facilitadoresOmitidosPreview).toEqual([
      { personaId: 'p-9', nombre: 'Marta Díaz', plantillaGrupo: 'Grupo Alfa' },
    ])
  })

  it('passes taller.dream_team_equipo_id to cargarPermisos', async () => {
    setup({})
    await TallerDetallePage(params())
    expect(cargarPermisosMock).toHaveBeenCalledWith(expect.anything(), 'eq-1')
  })
})

// T4 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) — the
// one-question "Crear edición" flow: refresh-before-read, régimen-gated
// temporadas fetch, and the exclusion of temporadas this taller already
// has a non-cancelled edición in.
describe('TallerDetallePage — T4: refresh and temporadas wiring', () => {
  it('refreshes estados before reading the taller', async () => {
    setup({})
    const calls: string[] = []
    refrescarEstadosEdicionesMock.mockImplementation(async () => {
      calls.push('refrescar')
    })
    loadTallerDetalleMock.mockImplementation(async () => {
      calls.push('load')
      return TALLER
    })
    await TallerDetallePage(params())
    expect(calls).toEqual(['refrescar', 'load'])
    expect(refrescarEstadosEdicionesMock).toHaveBeenCalledWith(expect.anything())
  })

  it('never fetches temporadas for a régimen=cadencia taller, even with abrirEdicion', async () => {
    setup({ permisos: { abrirEdicion: true }, taller: { ...TALLER, regimen: 'cadencia' } })
    await TallerDetallePage(params())
    expect(loadTemporadasAbiertasMock).not.toHaveBeenCalled()
  })

  it('excludes temporadas this taller already has a non-cancelled edición in', async () => {
    loadTemporadasAbiertasMock.mockReset().mockResolvedValue([
      { id: 'temp-1', nombre: 'Otoño 2026', fecha_apertura: '2026-09-01' },
      { id: 'temp-2', nombre: 'Primavera 2027', fecha_apertura: '2027-03-01' },
    ])
    setup({
      permisos: { abrirEdicion: true },
      taller: {
        ...TALLER,
        regimen: 'temporada',
        ediciones: [
          { id: 'e-1', nombre_snapshot: 'Otoño 2026', tipo: 'pareja', estado: 'abierto', total_inscripciones: 1, temporada_id: 'temp-1', fecha_inicio: '2026-09-01', fecha_fin: '2026-09-22' },
        ],
      },
    })
    loadTemporadasAbiertasMock.mockResolvedValue([
      { id: 'temp-1', nombre: 'Otoño 2026', fecha_apertura: '2026-09-01' },
      { id: 'temp-2', nombre: 'Primavera 2027', fecha_apertura: '2027-03-01' },
    ])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TallerDetallePage(params())) as any
    expect(formulario(element)?.props.temporadasDisponibles).toEqual([
      { id: 'temp-2', nombre: 'Primavera 2027', fecha_apertura: '2027-03-01' },
    ])
  })

  it('does NOT exclude a temporada whose only edición of this taller is cancelled', async () => {
    setup({
      permisos: { abrirEdicion: true },
      taller: {
        ...TALLER,
        regimen: 'temporada',
        ediciones: [
          { id: 'e-1', nombre_snapshot: 'Otoño 2026', tipo: 'pareja', estado: 'cancelado', total_inscripciones: 0, temporada_id: 'temp-1', fecha_inicio: '2026-09-01', fecha_fin: '2026-09-22' },
        ],
      },
    })
    loadTemporadasAbiertasMock.mockResolvedValue([{ id: 'temp-1', nombre: 'Otoño 2026', fecha_apertura: '2026-09-01' }])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TallerDetallePage(params())) as any
    expect(formulario(element)?.props.temporadasDisponibles).toEqual([
      { id: 'temp-1', nombre: 'Otoño 2026', fecha_apertura: '2026-09-01' },
    ])
  })
})

// T4 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) — redirected
// here from OpenEdicionForm after "crear también las próximas" creates
// more than one edición.
describe('TallerDetallePage — T4: ?creadas=N notice', () => {
  it('shows the notice when creadas is present and positive', async () => {
    setup({})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TallerDetallePage(params('matrimonio-sobre-la-roca', { creadas: '3' }))) as any
    expect(extractText(element)).toMatch(/Se crearon 3 ediciones/)
  })

  it('shows no notice without the query param', async () => {
    setup({})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TallerDetallePage(params())) as any
    expect(extractText(element)).not.toMatch(/se crearon/i)
  })
})

// T11 (odd/tasks/talleres-configuracion-del-taller.md, flow audit) — the
// "Pasos para abrir una edición" checklist, only for editarTaller (the same
// capacity that gates the plantilla edit controls). R3d: it sits in the side
// column (PasosAbrirEdicion; its rendering is in partes-taller.test.tsx).
describe('TallerDetallePage — T11: Pasos para abrir una edición', () => {
  function pasos(element: unknown): Record<string, boolean> {
    const lista = findByType(element, PasosAbrirEdicion)?.props.pasos as { etiqueta: string; listo: boolean }[]
    return Object.fromEntries(lista.map((p) => [p.etiqueta, p.listo]))
  }

  it('shows the checklist when editarTaller is granted', async () => {
    setup({ permisos: { editarTaller: true } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TallerDetallePage(params())) as any
    expect(findByType(element, PasosAbrirEdicion)).not.toBeNull()
  })

  it('hides the checklist when editarTaller is denied', async () => {
    setup({ permisos: { editarTaller: false } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TallerDetallePage(params())) as any
    expect(findByType(element, PasosAbrirEdicion)).toBeNull()
  })

  it('marks every step Pendiente when there is no equipo, clase or grupo', async () => {
    setup({ permisos: { editarTaller: true }, servidores: [], plantillaClases: [], plantillaGrupos: [] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TallerDetallePage(params())) as any
    expect(pasos(element)).toEqual({
      'Equipo del nodo': false,
      'Plantilla de clases': false,
      'Plantilla de grupos': false,
    })
  })

  it('marks each step Listo with an active servidor, an active clase and an active grupo', async () => {
    setup({
      permisos: { editarTaller: true },
      servidores: [SERVIDOR_LIDER],
      plantillaClases: [{ id: 'c-1', numero: 1, tema: 'Sígueme', activo: true }],
      plantillaGrupos: [{ id: 'g-1', nombre: 'Grupo Alfa', orden: 1, capacidad: 12, activo: true, facilitadores: [] }],
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TallerDetallePage(params())) as any
    expect(pasos(element)).toEqual({
      'Equipo del nodo': true,
      'Plantilla de clases': true,
      'Plantilla de grupos': true,
    })
  })

  it('does not count inactive clases or grupos as Listo', async () => {
    setup({
      permisos: { editarTaller: true },
      plantillaClases: [{ id: 'c-1', numero: 1, tema: 'Sígueme', activo: false }],
      plantillaGrupos: [{ id: 'g-1', nombre: 'Grupo Alfa', orden: 1, capacidad: 12, activo: false, facilitadores: [] }],
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TallerDetallePage(params())) as any
    expect(pasos(element)['Plantilla de clases']).toBe(false)
    expect(pasos(element)['Plantilla de grupos']).toBe(false)
  })

  // T4 — the final step names the ONE question «Abrir edición» will ask, by régimen.
  it('names the temporada question for régimen=temporada and the primera clase for régimen=cadencia', async () => {
    setup({ permisos: { editarTaller: true }, taller: { ...TALLER, regimen: 'temporada' } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    let element = (await TallerDetallePage(params())) as any
    expect(findByType(element, PasosAbrirEdicion)?.props.textoFinal).toBe('Crear edición (elige la temporada)')
    setup({ permisos: { editarTaller: true }, taller: { ...TALLER, regimen: 'cadencia' } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    element = (await TallerDetallePage(params())) as any
    expect(findByType(element, PasosAbrirEdicion)?.props.textoFinal).toBe('Crear edición (primera clase)')
  })

  it('the Ediciones section carries id="ediciones" (the checklist\'s and the catálogo\'s anchor)', async () => {
    setup({ permisos: { editarTaller: true } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TallerDetallePage(params())) as any
    const sections = findAllByType(element, 'section')
    const ediciones = sections.find((s) => s.props['aria-labelledby'] === 'ediciones-heading')
    expect(ediciones?.props.id).toBe('ediciones')
    expect(findByType(ediciones, EdicionesTaller)).not.toBeNull()
  })
})

describe('TallerDetallePage — headings (design audit)', () => {
  it('never renders a raw h1 or h2 on the page itself', async () => {
    setup({ servidores: [SERVIDOR_LIDER] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TallerDetallePage(params())) as any
    expect(findByType(element, 'h1')).toBeNull()
    expect(findByType(element, 'h2')).toBeNull()
  })
})

describe('TallerDetallePage — Ediciones (R3d)', () => {
  it('hands every edición of the taller to EdicionesTaller with the slug and name', async () => {
    setup({})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TallerDetallePage(params())) as any
    const lista = findByType(element, EdicionesTaller)
    expect(lista?.props).toEqual({
      tallerSlug: 'matrimonio-sobre-la-roca',
      tallerNombre: 'Matrimonio sobre la Roca',
      ediciones: TALLER.ediciones,
    })
  })

  it('summarises the ediciones by estado under the title', async () => {
    setup({
      taller: {
        ...TALLER,
        ediciones: [
          { ...TALLER.ediciones[0]!, id: 'a', estado: 'abierto' },
          { ...TALLER.ediciones[0]!, id: 'b', estado: 'en_curso' },
          { ...TALLER.ediciones[0]!, id: 'c', estado: 'cerrado' },
          { ...TALLER.ediciones[0]!, id: 'd', estado: 'cerrado' },
        ],
      },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TallerDetallePage(params())) as any
    const texto = extractText(element).replace(/\s+/g, ' ')
    expect(texto).toMatch(/1 edición con inscripción abierta · 1 en curso · 2 cerradas/)
  })

  it('says it has no ediciones yet when the taller has none', async () => {
    setup({ taller: { ...TALLER, ediciones: [] } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TallerDetallePage(params())) as any
    expect(extractText(element)).toMatch(/Todavía sin ediciones/)
  })
})

describe('TallerDetallePage — Página pública (R3d)', () => {
  it('shows talleres.publico read from the taller row by id', async () => {
    setup({ publico: true, permisos: { editarTaller: true } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TallerDetallePage(params())) as any
    expect(fromMock).toHaveBeenCalledWith('talleres')
    expect(findByType(element, PaginaPublicaTaller)?.props).toEqual({
      slug: 'matrimonio-sobre-la-roca',
      publico: true,
      enlaceCompartir: '/talleres/matrimonio-sobre-la-roca/compartir',
    })
  })

  it('shows a non-public taller without the Compartir link to a read-only viewer', async () => {
    setup({ publico: false })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TallerDetallePage(params())) as any
    expect(findByType(element, PaginaPublicaTaller)?.props).toEqual({
      slug: 'matrimonio-sobre-la-roca',
      publico: false,
      enlaceCompartir: null,
    })
  })

  it('hides the section when talleres.publico cannot be read', async () => {
    setup({ publico: 'error' })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TallerDetallePage(params())) as any
    expect(findByType(element, PaginaPublicaTaller)).toBeNull()
  })
})

describe('TallerDetallePage — content', () => {
  it('titles the page with the taller name and links back to /talleres', async () => {
    setup({})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TallerDetallePage(params())) as any
    const dashboard = findByType(element, PaginaSistema)
    expect(dashboard?.props.titulo).toBe('Matrimonio sobre la Roca')
    expect(dashboard?.props.regreso).toEqual({ href: rutaCatalogo(), texto: 'Talleres' })
  })

  it('shows the taller estado, tipo and régimen under the title', async () => {
    setup({})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TallerDetallePage(params())) as any
    const estado = findAllByType(element, PuntoEstado).find((p) => p.props.etiqueta === 'Activo')
    expect(estado?.props.tono).toBe('success')
    expect(extractText(element)).toMatch(/Parejas/)
    expect(extractText(element)).toMatch(/Por temporada de la dirección/)
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

  // T11 (flow audit) — the org-chart path links to /admin/dream-team/estructura
  // with Dream Team read capability, plain text otherwise.
  it('links the org-chart path to /admin/dream-team/estructura when the viewer has Dream Team read capability', async () => {
    setup({ capabilities: ['dream_team.org.manage'] })
    fetchRutaEquipoMock.mockResolvedValue('Dirección de Conexión › Grupos de Corto Plazo')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TallerDetallePage(params())) as any
    const link = findAllByType(element, Link).find((l) => l.props.href === '/admin/dream-team/estructura')
    expect(link).toBeDefined()
    expect(extractText(link)).toMatch(/Dirección de Conexión › Grupos de Corto Plazo/)
  })

  it('shows the org-chart path as plain text (no link) without Dream Team read capability', async () => {
    setup({ capabilities: [] })
    fetchRutaEquipoMock.mockResolvedValue('Dirección de Conexión › Grupos de Corto Plazo')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TallerDetallePage(params())) as any
    expect(extractText(element)).toMatch(/Dirección de Conexión › Grupos de Corto Plazo/)
    const link = findAllByType(element, Link).find((l) => l.props.href === '/admin/dream-team/estructura')
    expect(link).toBeUndefined()
  })

  it('keeps ConfiguracionTaller on the page under id="configuracion-heading" (the catálogo\'s anchor)', async () => {
    setup({ permisos: { editarTaller: true } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TallerDetallePage(params())) as any
    expect(findByType(element, ConfiguracionTaller)).not.toBeNull()
  })
})

// T6/T9 (odd/tasks/talleres-reserva-publica.md) and R3d — header actions in
// artboard 22 order: Compartir · Avisos · Configuración (editarTaller) and
// «Abrir edición» (BotonAbrirEdicion, only inside AbrirEdicionProvider), in
// the desktop header and again under the title on phones.
describe('TallerDetallePage — acciones del encabezado', () => {
  const AVISOS = '/talleres/matrimonio-sobre-la-roca/avisos'
  const COMPARTIR = '/talleres/matrimonio-sobre-la-roca/compartir'
  const CONFIGURACION = '#configuracion-heading'

  function hrefs(node: unknown): string[] {
    return findAllByType(node, Link).map((l) => String(l.props.href))
  }

  it('shows Compartir, Avisos and Configuración in the desktop header and on the phone with editarTaller', async () => {
    setup({ permisos: { editarTaller: true } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TallerDetallePage(params())) as any
    const acciones = findByType(element, PaginaSistema)?.props.acciones
    expect(hrefs(acciones)).toEqual([COMPARTIR, AVISOS, CONFIGURACION])
    expect(extractText(acciones)).toMatch(/Compartir.*Avisos.*Configuración/)
    expect(findByType(acciones, BotonAbrirEdicion)).not.toBeNull()
    const enCuerpo = hrefs(findByType(element, PaginaSistema)?.props.children).filter((h) =>
      [AVISOS, COMPARTIR, CONFIGURACION].includes(h),
    )
    expect(enCuerpo).toEqual([COMPARTIR, AVISOS, CONFIGURACION])
  })

  it('shows only «Abrir edición» with abrirEdicion and without editarTaller', async () => {
    setup({ permisos: { editarTaller: false, abrirEdicion: true } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TallerDetallePage(params())) as any
    const acciones = findByType(element, PaginaSistema)?.props.acciones
    expect(hrefs(acciones)).toEqual([])
    expect(findByType(acciones, BotonAbrirEdicion)).not.toBeNull()
  })

  it('has no header actions without editarTaller nor abrirEdicion', async () => {
    setup({ permisos: { editarTaller: false } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TallerDetallePage(params())) as any
    expect(findByType(element, PaginaSistema)?.props.acciones).toBeUndefined()
    expect(hrefs(element)).not.toContain(AVISOS)
    expect(hrefs(element)).not.toContain(COMPARTIR)
    expect(hrefs(element)).not.toContain(CONFIGURACION)
  })
})
