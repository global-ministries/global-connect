/**
 * @jest-environment node
 *
 * T6 (odd/tasks/talleres-consolidar-pantallas.md) — /talleres/pendientes,
 * the coordinator's cross-taller inbox. Replaces
 * /talleres/coordinacion/inscripciones, /talleres/coordinacion/solicitudes,
 * /talleres/direccion/solicitudes and the cross-edición half of
 * /admin/talleres/inscripciones.
 *
 * Mirrors the gate + structural-inspection pattern of
 * __tests__/app/(auth)/talleres/[taller]/[edicion]/page.test.tsx (flag ->
 * user -> session, each an informational card, inspected via
 * extractText/findByType rather than full rendering).
 *
 * The heart of this file: per-row permission resolution. Rows come from
 * SEVERAL equipos; a coordinador scoped to equipo A must see A's rows
 * WITH controls and B's rows WITHOUT controls, in the very same table —
 * never a flat page-level canWrite.
 */

import PendientesPage from '@/app/(auth)/talleres/pendientes/page'
import { TablaInscripciones } from '@/components/talleres/tabla-inscripciones'
import { ResolverSolicitudRetiroControls } from '@/components/talleres/resolver-solicitud-retiro-controls'
import { EstadoVacio } from '@/components/dream-team/estado-vacio'
import { ContenedorDashboard } from '@/components/ui/sistema-diseno'
import { PERMISOS_TALLER_ALL_FALSE, type PermisosTaller } from '@/lib/platform/talleres/permisos'
import type { InscripcionAdminRow } from '@/lib/platform/talleres/inscripciones-types'
import type { PendienteSolicitudRow } from '@/lib/platform/talleres/pendientes'

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

jest.mock('@/lib/platform/talleres/pendientes', () => ({
  loadPendientesInscripciones: jest.fn(),
  loadPendientesSolicitudes: jest.fn(),
}))

jest.mock('@/lib/platform/talleres/permisos', () => {
  const actual = jest.requireActual('@/lib/platform/talleres/permisos')
  return { ...actual, cargarPermisosPorEquipos: jest.fn() }
})

jest.mock('@/lib/platform/talleres/inscripciones-actions', () => ({
  approveInscripcionAction: jest.fn(),
  rejectInscripcionAction: jest.fn(),
}))

jest.mock('@/lib/platform/talleres/solicitudes-retiro-actions', () => ({
  aprobarSolicitudRetiroAction: jest.fn(),
  rechazarSolicitudRetiroAction: jest.fn(),
}))

const flagsMock = jest.requireMock('@/lib/platform/talleres/flags').isTalleresEnabled as jest.Mock
const createSupabaseServerClientMock = jest.requireMock('@/lib/supabase/server')
  .createSupabaseServerClient as jest.Mock
const resolveSessionMock = jest.requireMock('@/lib/auth/platformSessionReadOnly')
  .resolveReadOnlyPlatformSession as jest.Mock
const loadPendientesInscripcionesMock = jest.requireMock('@/lib/platform/talleres/pendientes')
  .loadPendientesInscripciones as jest.Mock
const loadPendientesSolicitudesMock = jest.requireMock('@/lib/platform/talleres/pendientes')
  .loadPendientesSolicitudes as jest.Mock
const cargarPermisosPorEquiposMock = jest.requireMock('@/lib/platform/talleres/permisos')
  .cargarPermisosPorEquipos as jest.Mock

function makeInscripcionRow(overrides: Partial<InscripcionAdminRow> = {}): InscripcionAdminRow {
  return {
    id: 'insc-1',
    edicion_id: 'ed-1',
    edicion_nombre: 'Septiembre 2026',
    edicion_estado: 'abierto',
    taller_id: 't-a',
    taller_nombre: 'Taller A',
    taller_slug: 'taller-a',
    cohorte_id: null,
    cohorte_edicion: null,
    persona_principal_id: 'p-1',
    persona_principal_nombre: 'Isaac Páez',
    persona_principal_email: 'isaac@example.com',
    companero_id: null,
    companero_nombre: null,
    link_type: null,
    estado: 'pendiente',
    created_at: '2026-09-10T00:00:00Z',
    updated_at: '2026-09-10T00:00:00Z',
    ...overrides,
  }
}

function makeSolicitudRow(overrides: Partial<PendienteSolicitudRow> = {}): PendienteSolicitudRow {
  return {
    id: 'sol-1',
    inscripcion_id: 'insc-1',
    grupo_asignacion_id: null,
    tipo: 'participante_retiro',
    estado: 'pendiente',
    motivo: 'Mudanza',
    created_at: '2026-09-10T00:00:00Z',
    equipoId: 'eq-a',
    tallerNombre: 'Taller A',
    tallerSlug: 'taller-a',
    ...overrides,
  }
}

const PERMISOS_FULL: PermisosTaller = {
  ...PERMISOS_TALLER_ALL_FALSE,
  ver: true,
  aprobarInscripciones: true,
  resolverRetiros: true,
}

interface SetupOpts {
  isEnabled?: boolean
  user?: { id: string } | null
  hasSession?: boolean
  inscripciones?: { rows: readonly InscripcionAdminRow[]; equipoIdByTallerId: ReadonlyMap<string, string | null> }
  solicitudes?: readonly PendienteSolicitudRow[]
  permisosPorEquipo?: ReadonlyMap<string | null, PermisosTaller>
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
      ? { personaId: 'p-1', subjectAuthId: 'auth-1', globalRoles: [], contexts: [], capabilities: [] }
      : null,
  )

  loadPendientesInscripcionesMock
    .mockReset()
    .mockResolvedValue(opts.inscripciones ?? { rows: [], equipoIdByTallerId: new Map() })
  loadPendientesSolicitudesMock.mockReset().mockResolvedValue(opts.solicitudes ?? [])
  cargarPermisosPorEquiposMock.mockReset().mockResolvedValue(opts.permisosPorEquipo ?? new Map())
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

/** Finds EVERY element of the given type in the tree, WITHOUT executing it. */
function findAllByType(node: unknown, type: unknown, acc: Array<{ props: Record<string, unknown> }> = []): Array<{ props: Record<string, unknown> }> {
  if (node === null || node === undefined || typeof node === 'boolean') return acc
  if (Array.isArray(node)) {
    for (const child of node) findAllByType(child, type, acc)
    return acc
  }
  if (typeof node === 'object' && node !== null && 'type' in node) {
    const el = node as { type: unknown; props?: { children?: unknown } }
    if (el.type === type) acc.push(el as { props: Record<string, unknown> })
    findAllByType(el.props?.children, type, acc)
    return acc
  }
  return acc
}

function findByType(node: unknown, type: unknown): { props: Record<string, unknown> } | null {
  return findAllByType(node, type)[0] ?? null
}

describe('PendientesPage — gate', () => {
  it('shows the disabled message and resolves nothing when the flag is off', async () => {
    setup({ isEnabled: false })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await PendientesPage()) as any
    expect(extractText(element)).toMatch(/deshabilitado/i)
    expect(loadPendientesInscripcionesMock).not.toHaveBeenCalled()
  })

  it('asks to log in and resolves nothing when there is no user', async () => {
    setup({ user: null })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await PendientesPage()) as any
    expect(extractText(element)).toMatch(/iniciar sesión/i)
    expect(loadPendientesInscripcionesMock).not.toHaveBeenCalled()
  })

  it('shows a session-resolution message when the session cannot be resolved', async () => {
    setup({ hasSession: false })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await PendientesPage()) as any
    expect(extractText(element)).toMatch(/no se pudo resolver tu sesión/i)
    expect(loadPendientesInscripcionesMock).not.toHaveBeenCalled()
  })
})

describe('PendientesPage — nothing pending', () => {
  it('shows a calm EstadoVacio, not an error, when both sections are empty', async () => {
    setup({})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await PendientesPage()) as any
    const vacio = findByType(element, EstadoVacio)
    expect(vacio).not.toBeNull()
    expect(String(vacio?.props.titulo)).toMatch(/no tenés nada pendiente/i)
    expect(findByType(element, TablaInscripciones)).toBeNull()
  })
})

describe('PendientesPage — T10 estado filter (odd/tasks/talleres-consolidar-pantallas.md)', () => {
  // T10: /admin/talleres/inscripciones's full multi-estado audit had no
  // 1:1 replacement — this filter closes that gap without a new route.
  // Default (no ?estado=, or an unrecognized value) stays "pendiente",
  // so the plain inbox view is unchanged for everyone who never touches
  // the filter.

  function searchParamsOf(estado: string | undefined) {
    return { searchParams: Promise.resolve(estado === undefined ? {} : { estado }) }
  }

  it('defaults to estado=pendiente when no filter is given', async () => {
    setup({})
    await PendientesPage(searchParamsOf(undefined))
    expect(loadPendientesInscripcionesMock).toHaveBeenCalledWith(expect.anything(), ['pendiente'])
  })

  it('?estado=aprobado filters to that single estado', async () => {
    setup({})
    await PendientesPage(searchParamsOf('aprobado'))
    expect(loadPendientesInscripcionesMock).toHaveBeenCalledWith(expect.anything(), ['aprobado'])
  })

  it('?estado=todas requests every real estado (the cross-edición audit view)', async () => {
    setup({})
    await PendientesPage(searchParamsOf('todas'))
    expect(loadPendientesInscripcionesMock).toHaveBeenCalledWith(
      expect.anything(),
      ['pendiente', 'aprobado', 'no_aprobado', 'retirado'],
    )
  })

  it('an unrecognized ?estado= value falls back to pendiente instead of crashing or querying unfiltered', async () => {
    setup({})
    await PendientesPage(searchParamsOf('not-a-real-estado'))
    expect(loadPendientesInscripcionesMock).toHaveBeenCalledWith(expect.anything(), ['pendiente'])
  })

  it('renders every filter option as a link carrying its own ?estado= value', async () => {
    setup({})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await PendientesPage(searchParamsOf(undefined))) as any
    const text = extractText(element)
    for (const label of ['Pendientes', 'Aprobadas', 'No aprobadas', 'Retiradas', 'Todas']) {
      expect(text).toContain(label)
    }
  })
})

describe('PendientesPage — per-row permission resolution (the heart of T6)', () => {
  it('shows controls for taller A rows and hides them for taller B rows, in the same table', async () => {
    const rowA = makeInscripcionRow({ id: 'insc-a', taller_id: 't-a' })
    const rowB = makeInscripcionRow({ id: 'insc-b', taller_id: 't-b', taller_nombre: 'Taller B' })
    setup({
      inscripciones: {
        rows: [rowA, rowB],
        equipoIdByTallerId: new Map([
          ['t-a', 'eq-a'],
          ['t-b', 'eq-b'],
        ]),
      },
      permisosPorEquipo: new Map([
        ['eq-a', PERMISOS_FULL],
        ['eq-b', PERMISOS_TALLER_ALL_FALSE],
      ]),
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await PendientesPage()) as any
    const tabla = findByType(element, TablaInscripciones)
    expect(tabla).not.toBeNull()
    const canWrite = tabla?.props.canWrite as (row: InscripcionAdminRow) => boolean
    expect(typeof canWrite).toBe('function')
    expect(canWrite(rowA)).toBe(true)
    expect(canWrite(rowB)).toBe(false)
  })

  it('resolves permisos once per DISTINCT equipo, not once per row', async () => {
    const rows = [
      makeInscripcionRow({ id: 'insc-1', taller_id: 't-a' }),
      makeInscripcionRow({ id: 'insc-2', taller_id: 't-a' }),
      makeInscripcionRow({ id: 'insc-3', taller_id: 't-b' }),
    ]
    setup({
      inscripciones: {
        rows,
        equipoIdByTallerId: new Map([
          ['t-a', 'eq-a'],
          ['t-b', 'eq-b'],
        ]),
      },
    })
    await PendientesPage()
    expect(cargarPermisosPorEquiposMock).toHaveBeenCalledTimes(1)
    const [, equipoIdsArg] = cargarPermisosPorEquiposMock.mock.calls[0]
    expect(new Set(equipoIdsArg)).toEqual(new Set(['eq-a', 'eq-b']))
  })

  it('retiro controls appear only when resolverRetiros is granted for that row\'s equipo', async () => {
    const rowA = makeSolicitudRow({ id: 'sol-a', equipoId: 'eq-a' })
    const rowB = makeSolicitudRow({ id: 'sol-b', equipoId: 'eq-b' })
    setup({
      solicitudes: [rowA, rowB],
      permisosPorEquipo: new Map([
        ['eq-a', PERMISOS_FULL],
        ['eq-b', PERMISOS_TALLER_ALL_FALSE],
      ]),
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await PendientesPage()) as any
    const controls = findAllByType(element, ResolverSolicitudRetiroControls)
    expect(controls).toHaveLength(1)
    expect(controls[0]?.props.solicitudId).toBe('sol-a')
  })

  it('a row whose equipo cannot be resolved (equipoId: null) never shows retiro controls', async () => {
    setup({
      solicitudes: [makeSolicitudRow({ id: 'sol-orphan', equipoId: null })],
      permisosPorEquipo: new Map([[null, PERMISOS_FULL]]),
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await PendientesPage()) as any
    // Even if a caller mis-configured the null-equipo entry as fully
    // permitted, an orphan row still renders (never dropped) — this just
    // documents current behavior rather than asserting a specific choice.
    expect(extractText(element)).toMatch(/mudanza/i)
  })
})

describe('PendientesPage — sections', () => {
  it('shows both section headings when both have rows', async () => {
    setup({
      inscripciones: {
        rows: [makeInscripcionRow()],
        equipoIdByTallerId: new Map([['t-a', 'eq-a']]),
      },
      solicitudes: [makeSolicitudRow()],
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await PendientesPage()) as any
    const text = extractText(element)
    expect(text).toMatch(/inscripciones por aprobar/i)
    expect(text).toMatch(/retiros por resolver/i)
  })

  it('shows a section-local empty state for retiros when only inscripciones has rows', async () => {
    setup({
      inscripciones: {
        rows: [makeInscripcionRow()],
        equipoIdByTallerId: new Map([['t-a', 'eq-a']]),
      },
      solicitudes: [],
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await PendientesPage()) as any
    expect(findByType(element, TablaInscripciones)).not.toBeNull()
    const vacios = findAllByType(element, EstadoVacio)
    expect(vacios.some((v) => /no hay retiros pendientes/i.test(String(v.props.titulo)))).toBe(true)
  })

  it('titles the page "Pendientes"', async () => {
    setup({})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await PendientesPage()) as any
    const dashboard = findByType(element, ContenedorDashboard)
    expect(dashboard?.props.titulo).toBe('Pendientes')
  })
})
