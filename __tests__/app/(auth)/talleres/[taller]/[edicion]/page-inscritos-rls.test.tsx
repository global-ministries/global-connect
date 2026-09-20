/**
 * @jest-environment node
 *
 * T6b (odd/tasks/talleres-consolidar-pantallas.md) — regression test for
 * the persona_principal RLS trap in loadAdminInscripciones, exercised
 * through the REAL screen it feeds: /talleres/[taller]/[edicion]'s
 * "Inscritos" section.
 *
 * Unlike __tests__/app/(auth)/talleres/[taller]/[edicion]/page.test.tsx,
 * this file does NOT mock `lib/platform/talleres/admin-inscripciones` —
 * it exercises the REAL loader against a stub supabase client, so the
 * RLS embed trap is actually reachable end to end, not shortcut by a
 * loader-level mock.
 *
 * Production RLS on `usuarios` (verified 2026-09-20) grants SELECT only
 * to: yourself, an admin/pastor, or a Grupos de Vida leader/director who
 * shares a group with the target (`puede_ver_usuario`). A plain taller
 * coordinador (full talleres capabilities, no Grupos de Vida leadership)
 * matches NONE of those, so PostgREST's `usuarios!persona_principal_id`
 * embed on `taller_inscripciones` resolves to `null` for every enrolled
 * person. The pre-fix loader treated that null as "drop the row"
 * (`if (!persona) continue`), so a coordinador's own "Inscritos" section
 * — on the very screen built for them — rendered EMPTY, even though the
 * enrollment itself was fully RLS-visible.
 *
 * RED (pre-fix): this test fails because the stub's `taller_inscripciones`
 * row (persona_principal embed null, exactly what RLS returns for a
 * coordinador) gets dropped, so EstadoVacio renders instead of
 * TablaInscripciones.
 * GREEN (post-fix): the row survives with a degraded '—' name.
 */

import EdicionDetallePage from '@/app/(auth)/talleres/[taller]/[edicion]/page'
import { TablaInscripciones } from '@/components/talleres/tabla-inscripciones'
import { EstadoVacio } from '@/components/dream-team/estado-vacio'
import { PERMISOS_TALLER_ALL_FALSE } from '@/lib/platform/talleres/permisos'
import type { TallerDetalle } from '@/lib/platform/talleres/catalogo'
import type { EdicionLocalDetalle } from '@/lib/platform/talleres/operacional'

jest.mock('@/lib/platform/talleres/flags', () => ({
  isTalleresEnabled: jest.fn(() => true),
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

// `lib/platform/talleres/admin-inscripciones` is intentionally NOT
// mocked here — this test exercises the real `loadAdminInscripciones`
// against the stub client below, so the RLS embed trap stays reachable.

const flagsMock = jest.requireMock('@/lib/platform/talleres/flags').isTalleresEnabled as jest.Mock
const createSupabaseServerClientMock = jest.requireMock('@/lib/supabase/server')
  .createSupabaseServerClient as jest.Mock
const resolveSessionMock = jest.requireMock('@/lib/auth/platformSessionReadOnly')
  .resolveReadOnlyPlatformSession as jest.Mock
const loadTallerDetalleMock = jest.requireMock('@/lib/platform/talleres/catalogo')
  .loadTallerDetalle as jest.Mock
const loadEdicionLocalDetalleMock = jest.requireMock('@/lib/platform/talleres/operacional')
  .loadEdicionLocalDetalle as jest.Mock
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
  cohorte: null,
  periodo_general: null,
  inscripciones_count: 1,
  inscripciones_aprobadas_count: 0,
  certificados_count: 0,
}

// The row exactly as PostgREST returns it to a plain coordinador under
// the pre-fix embed-based query: the enrollment itself is RLS-visible
// (it comes back from `taller_inscripciones` at all), but the embedded
// `usuarios` join comes back null because `puede_ver_usuario` denies it.
// `persona_principal_id`/`companero_id` are also present, matching the
// post-fix scalar-column SELECT — this fixture is valid against both
// the pre-fix and post-fix loader shapes.
const INSCRIPCION_ROW_RLS_DENIED_PERSONA = {
  id: 'i-1',
  taller_id: 'e-1', // FK -> the edición id
  estado: 'pendiente',
  link_type: null,
  created_at: '2026-09-10T00:00:00Z',
  updated_at: '2026-09-10T00:00:00Z',
  cohorte_id: null,
  persona_principal_id: 'p-1',
  companero_id: null,
  persona_principal: null, // pre-fix embed shape: denied -> null
  companero: null,
}

interface StubChain {
  select: jest.Mock
  eq: jest.Mock
  in: jest.Mock
  order: jest.Mock
  limit: jest.Mock
  then: (resolve: (v: { data: unknown; error: null }) => unknown) => Promise<unknown>
}

function buildStubClient() {
  const from = jest.fn((table: string) => {
    const chain: StubChain = {} as StubChain
    chain.select = jest.fn(() => chain)
    chain.eq = jest.fn(() => chain)
    chain.in = jest.fn(() => chain)
    chain.order = jest.fn(() => chain)
    chain.limit = jest.fn(() => chain)
    chain.then = (resolve) => {
      if (table === 'taller_inscripciones') {
        return Promise.resolve({ data: [INSCRIPCION_ROW_RLS_DENIED_PERSONA], error: null }).then(
          resolve,
        )
      }
      if (table === 'taller_ediciones') {
        return Promise.resolve({
          data: [
            {
              id: 'e-1',
              nombre_snapshot: 'Septiembre 2026',
              estado: 'borrador',
              taller_id: 't-1',
              taller: {
                id: 't-1',
                slug: 'matrimonio-sobre-la-roca',
                nombre: 'Matrimonio sobre la Roca',
              },
            },
          ],
          error: null,
        }).then(resolve)
      }
      return Promise.resolve({ data: [], error: null }).then(resolve)
    }
    return chain
  })

  return {
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'auth-1' } }, error: null }),
    },
    from,
    // Post-fix, loadAdminInscripciones resolves names via this RPC. No
    // match here simulates the RLS-denied-viewer case: the row must
    // still survive with a degraded name, never be dropped.
    rpc: jest.fn(() => Promise.resolve({ data: [], error: null })),
  }
}

function params() {
  return { params: Promise.resolve({ taller: 'matrimonio-sobre-la-roca', edicion: 'e-1' }) }
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

beforeEach(() => {
  flagsMock.mockReset().mockReturnValue(true)
  createSupabaseServerClientMock.mockReset().mockResolvedValue(buildStubClient())
  resolveSessionMock.mockReset().mockResolvedValue({
    personaId: 'p-1',
    subjectAuthId: 'auth-1',
    globalRoles: [],
    contexts: [],
    capabilities: [],
  })
  loadTallerDetalleMock.mockReset().mockResolvedValue(TALLER)
  loadEdicionLocalDetalleMock.mockReset().mockResolvedValue(EDICION)
  cargarPermisosMock.mockReset().mockResolvedValue({ ...PERMISOS_TALLER_ALL_FALSE })
})

describe('EdicionDetallePage — Inscritos, real loadAdminInscripciones, usuarios embed denied by RLS', () => {
  it('keeps the enrollment row instead of hiding it: a coordinador without Grupos de Vida leadership must still see who is enrolled', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await EdicionDetallePage(params())) as any

    expect(findByType(element, EstadoVacio)).toBeNull()
    const tabla = findByType(element, TablaInscripciones)
    expect(tabla).not.toBeNull()
    expect((tabla!.props.rows as unknown[]).length).toBe(1)
  })
})
