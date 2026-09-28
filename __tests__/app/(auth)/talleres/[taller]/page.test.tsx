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
 */

import TallerDetallePage from '@/app/(auth)/talleres/[taller]/page'
import { OpenEdicionForm } from '@/components/talleres/open-edicion-form'
import { EditarNombreTaller } from '@/components/talleres/editar-nombre-taller'
import { EditarDescripcionTaller } from '@/components/talleres/editar-descripcion-taller'
import { PlantillaClasesSection } from '@/components/talleres/plantilla-clases-section'
import { PlantillaGruposSection } from '@/components/talleres/plantilla-grupos-section'
import { EstadoVacio } from '@/components/dream-team/estado-vacio'
import { ContenedorDashboard } from '@/components/ui/sistema-diseno'
import { PERMISOS_TALLER_ALL_FALSE, type PermisosTaller } from '@/lib/platform/talleres/permisos'
import type { TallerDetalle } from '@/lib/platform/talleres/catalogo'
import type { ServidorDelTaller } from '@/lib/platform/talleres/servidores-del-taller'
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
}))

jest.mock('@/lib/platform/talleres/servidores-del-taller', () => {
  const actual = jest.requireActual('@/lib/platform/talleres/servidores-del-taller')
  return { ...actual, loadServidoresDelTaller: jest.fn() }
})

jest.mock('@/lib/platform/talleres/plantilla', () => ({
  loadPlantillaClases: jest.fn(),
  loadPlantillaGrupos: jest.fn(),
}))

jest.mock('@/lib/platform/talleres/temporadas', () => ({
  loadTemporadasAbiertas: jest.fn(),
}))

jest.mock('@/components/talleres/open-edicion-form', () => ({
  OpenEdicionForm: () => null,
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
  ediciones: [
    { id: 'e-1', nombre_snapshot: 'Septiembre 2026', tipo: 'pareja', estado: 'abierto', total_inscripciones: 3 },
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
  plantillaClases?: readonly { id: string; numero: number; tema: string; activo: boolean }[]
  plantillaGrupos?: readonly {
    id: string
    nombre: string
    orden: number
    capacidad: number
    activo: boolean
    facilitadores: readonly unknown[]
  }[]
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
  loadServidoresDelTallerMock.mockReset().mockResolvedValue(opts.servidores ?? [])
  loadPlantillaClasesMock.mockReset().mockResolvedValue(opts.plantillaClases ?? [])
  loadPlantillaGruposMock.mockReset().mockResolvedValue(opts.plantillaGrupos ?? [])
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
})

describe('TallerDetallePage — Equipo', () => {
  it('lists active servidores with their rol', async () => {
    setup({ servidores: [SERVIDOR_LIDER] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TallerDetallePage(params())) as any
    const text = extractText(element)
    expect(text).toMatch(/Ana Gómez/)
    expect(text).toMatch(/Líder/)
    expect(loadServidoresDelTallerMock).toHaveBeenCalledWith(expect.anything(), 't-1')
  })

  it('links to Gestionar en Servidores', async () => {
    setup({ servidores: [SERVIDOR_LIDER] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TallerDetallePage(params())) as any
    const links = findAllByType(element, Link)
    const servidoresLink = links.find((l) => l.props.href === '/admin/dream-team/servidores')
    expect(servidoresLink).toBeDefined()
  })

  it('shows an empty state when there are no active servidores', async () => {
    setup({ servidores: [] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TallerDetallePage(params())) as any
    const vacio = findByType(element, EstadoVacio)
    expect(vacio?.props.titulo).toBe('Sin servidores activos en este equipo')
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
  it('passes the loaded plantilla clases, cadencia and duracion to PlantillaClasesSection', async () => {
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
    expect(clasesSection?.props.cadenciaDias).toBe(7)
    expect(clasesSection?.props.duracionMinutos).toBeNull()
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

  it('passes sesionesEstimadas as the count of ACTIVE plantilla clases', async () => {
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
    expect(findByType(element, OpenEdicionForm)?.props.sesionesEstimadas).toBe(2)
  })

  it('passes sesionesEstimadas as null when the taller has no active plantilla clases, so OpenEdicionForm keeps the old sesiones field (acceptance criterion 8)', async () => {
    setup({ permisos: { abrirEdicion: true }, plantillaClases: [] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TallerDetallePage(params())) as any
    expect(findByType(element, OpenEdicionForm)?.props.sesionesEstimadas).toBeNull()
  })

  it('passes sesionesEstimadas as null when every plantilla clase is inactive', async () => {
    setup({
      permisos: { abrirEdicion: true },
      plantillaClases: [{ id: 'c-1', numero: 1, tema: 'Sígueme', activo: false }],
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TallerDetallePage(params())) as any
    expect(findByType(element, OpenEdicionForm)?.props.sesionesEstimadas).toBeNull()
  })

  it('passes taller.dream_team_equipo_id to cargarPermisos', async () => {
    setup({})
    await TallerDetallePage(params())
    expect(cargarPermisosMock).toHaveBeenCalledWith(expect.anything(), 'eq-1')
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

  it('links each edición row to /talleres/[taller]/[edicion]', async () => {
    setup({})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TallerDetallePage(params())) as any
    const links = findAllByType(element, Link)
    const edicionLink = links.find(
      (l) => l.props.href === rutaEdicion('matrimonio-sobre-la-roca', 'e-1'),
    )
    expect(edicionLink).toBeDefined()
  })
})
