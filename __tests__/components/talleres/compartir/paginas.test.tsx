/**
 * @jest-environment node
 *
 * T6 of odd/tasks/talleres-reserva-publica.md (S2 S18): "Compartir" is for
 * who manages the taller only (cargarPermisos(...).editarTaller): the
 * taller page shows the action only to them, and /talleres/[taller]/compartir
 * refuses everyone else before reading anything more. It reads
 * talleres.publico to warn, and offers only the open ediciones.
 *
 * Inspects the unexecuted element tree, like
 * __tests__/app/(auth)/talleres/[taller]/page.test.tsx.
 */
import Link from 'next/link'

import TallerDetallePage from '@/app/(auth)/talleres/[taller]/page'
import CompartirTallerPage from '@/app/(auth)/talleres/[taller]/compartir/page'
import { CompartirTaller } from '@/components/talleres/compartir/compartir-taller'
import { PERMISOS_TALLER_ALL_FALSE, type PermisosTaller } from '@/lib/platform/talleres/permisos'
import type { TallerDetalle } from '@/lib/platform/talleres/catalogo'

jest.mock('@/lib/platform/talleres/flags', () => ({ isTalleresEnabled: () => true }))
jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: jest.fn() }))
jest.mock('@/lib/auth/platformSessionReadOnly', () => ({
  findPlatformSessionPersonaByAuthId: jest.fn(),
  resolveReadOnlyPlatformSession: jest.fn(async () => ({ personaId: 'p-1', subjectAuthId: 'auth-1', globalRoles: [], contexts: [], capabilities: [] })),
}))
jest.mock('@/lib/platform/talleres/catalogo', () => ({ loadTallerDetalle: jest.fn() }))
jest.mock('@/lib/platform/talleres/permisos', () => ({ ...jest.requireActual('@/lib/platform/talleres/permisos'), cargarPermisos: jest.fn() }))
jest.mock('@/lib/platform/talleres/equipo-organigrama', () => ({ fetchRutaEquipo: jest.fn(async () => null) }))
jest.mock('@/lib/platform/talleres/servidores-del-taller', () => ({
  ...jest.requireActual('@/lib/platform/talleres/servidores-del-taller'),
  loadServidoresDelTaller: jest.fn(async () => ({ ok: true, servidores: [] })),
}))
jest.mock('@/lib/platform/talleres/plantilla', () => ({
  ...jest.requireActual('@/lib/platform/talleres/plantilla'),
  loadPlantillaClases: jest.fn(async () => []),
  loadPlantillaGrupos: jest.fn(async () => []),
}))
jest.mock('@/lib/platform/talleres/temporadas', () => ({ loadTemporadasAbiertas: jest.fn(async () => []) }))
jest.mock('@/lib/platform/talleres/refrescar-estados', () => ({ refrescarEstadosEdiciones: jest.fn() }))
jest.mock('next/headers', () => ({ headers: async () => new Headers({ host: 'miembros.yosoyglobal.org' }) }))
jest.mock('@/components/talleres/compartir/compartir-taller', () => ({ CompartirTaller: () => null }))

const crearCliente = jest.requireMock('@/lib/supabase/server').createSupabaseServerClient as jest.Mock
const loadTallerDetalle = jest.requireMock('@/lib/platform/talleres/catalogo').loadTallerDetalle as jest.Mock
const cargarPermisos = jest.requireMock('@/lib/platform/talleres/permisos').cargarPermisos as jest.Mock

const TALLER: TallerDetalle = {
  id: 't-1',
  slug: 'mujer-de-hoy',
  nombre: 'Mujer de Hoy',
  descripcion: null,
  modalidad_default: 'periodo_general',
  estado: 'active',
  dream_team_equipo_id: 'eq-1',
  cadencia_dias: 7,
  duracion_minutos: null,
  tipo: 'individual',
  vinculo: null,
  regimen: 'temporada',
  cierre_inscripcion_offset_dias: 0,
  intervalo_ediciones_dias: null,
  clases_minimas_para_completar: null,
  ediciones: [
    { id: 'e-1', nombre_snapshot: 'Enero 2027', tipo: 'individual', estado: 'abierto', total_inscripciones: 3, temporada_id: null, fecha_inicio: '2027-01-14', fecha_fin: null },
    { id: 'e-2', nombre_snapshot: 'Abril 2027', tipo: 'individual', estado: 'borrador', total_inscripciones: 0, temporada_id: null, fecha_inicio: '2027-04-08', fecha_fin: null },
  ],
} as TallerDetalle

let lecturaPublico: jest.Mock

function preparar(permisos: Partial<PermisosTaller>, publico = false) {
  lecturaPublico = jest.fn(async () => ({ data: { publico }, error: null }))
  crearCliente.mockResolvedValue({
    auth: { getUser: jest.fn(async () => ({ data: { user: { id: 'auth-1' } }, error: null })) },
    from: jest.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle: lecturaPublico }) }) })),
  })
  loadTallerDetalle.mockResolvedValue(TALLER)
  cargarPermisos.mockResolvedValue({ ...PERMISOS_TALLER_ALL_FALSE, ...permisos })
}

type Nodo = { type?: unknown; props?: Record<string, unknown> }

/** Every element of a type in the tree (children and `acciones`), without rendering it. */
function todos(nodo: unknown, tipo: unknown, out: Nodo[] = []): Nodo[] {
  if (Array.isArray(nodo)) nodo.forEach((n) => todos(n, tipo, out))
  else if (nodo && typeof nodo === 'object' && 'props' in nodo) {
    const el = nodo as Nodo
    if (el.type === tipo) out.push(el)
    todos(el.props?.children, tipo, out)
    todos(el.props?.acciones, tipo, out)
  }
  return out
}

const enlacesCompartir = (arbol: unknown) => todos(arbol, Link).filter((l) => l.props?.href === '/talleres/mujer-de-hoy/compartir')

describe('the taller page action', () => {
  const ctx = { params: Promise.resolve({ taller: 'mujer-de-hoy' }), searchParams: Promise.resolve({}) }

  it('shows "Compartir" to who manages the taller', async () => {
    preparar({ editarTaller: true })
    const arbol = await TallerDetallePage(ctx)

    expect(enlacesCompartir(arbol).length).toBeGreaterThan(0)
  })

  it('hides it from everyone else', async () => {
    preparar({ ver: true, abrirEdicion: true })
    const arbol = await TallerDetallePage(ctx)

    expect(enlacesCompartir(arbol)).toHaveLength(0)
  })
})

describe('/talleres/[taller]/compartir', () => {
  const ctx = { params: Promise.resolve({ taller: 'mujer-de-hoy' }) }

  it('refuses who cannot manage the taller and reads nothing more', async () => {
    preparar({ ver: true })
    const arbol = await CompartirTallerPage(ctx)

    expect((arbol as Nodo).props?.texto).toBe('Solo quien gestiona este taller puede compartirlo.')
    expect(todos(arbol, CompartirTaller)).toHaveLength(0)
    expect(lecturaPublico).not.toHaveBeenCalled()
  })

  it('gives the manager the public origin, talleres.publico and only the open ediciones', async () => {
    preparar({ editarTaller: true }, false)
    const [compartir] = todos(await CompartirTallerPage(ctx), CompartirTaller)

    expect(compartir?.props).toEqual({
      base: 'https://miembros.yosoyglobal.org',
      slug: 'mujer-de-hoy',
      nombre: 'Mujer de Hoy',
      publico: false,
      ediciones: [{ id: 'e-1', nombre: 'Enero 2027' }],
    })
  })
})
