/**
 * @jest-environment node
 *
 * /talleres/pendientes — the coordinator's cross-taller inbox (T6,
 * odd/tasks/talleres-consolidar-pantallas.md), rebuilt on the v2 anatomy in
 * R3e (odd/tasks/talleres-rediseno.md, S1, S2, S4; artboard
 * design/talleres-interior/23).
 *
 * The page gates (flag -> user -> session), loads the three sources
 * (pendiente inscripciones, aprobada ones for «Sin grupo», pending retiros),
 * resolves permisos ONCE PER DISTINCT EQUIPO and hands plain items to the
 * client island. The heart of this file is still per-row authority: a
 * coordinador scoped to equipo A may decide A's items and not B's, in the
 * same list.
 */

import PendientesPage from '@/app/(auth)/talleres/pendientes/page'
import { PendientesClient } from '@/components/talleres/pendientes/pendientes-client'
import type { ItemPendiente } from '@/components/talleres/pendientes/vista-pendientes'
import { PERMISOS_TALLER_ALL_FALSE, type PermisosTaller } from '@/lib/platform/talleres/permisos'
import type { InscripcionAdminRow } from '@/lib/platform/talleres/inscripciones-types'
import type {
  ExtraInscripcion,
  PendienteSolicitudRow,
  PendientesInscripcionesResult,
} from '@/lib/platform/talleres/pendientes'

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
    grupo_id: null,
    grupo_nombre: null,
    ...overrides,
  }
}

function makeSolicitudRow(overrides: Partial<PendienteSolicitudRow> = {}): PendienteSolicitudRow {
  return {
    id: 'sol-1',
    inscripcion_id: 'insc-9',
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

function fuente(
  rows: readonly InscripcionAdminRow[],
  equipos: Record<string, string | null> = {},
  extras: Record<string, ExtraInscripcion> = {},
): PendientesInscripcionesResult {
  return {
    rows,
    equipoIdByTallerId: new Map(Object.entries(equipos)),
    extraPorInscripcion: new Map(Object.entries(extras)),
  }
}

const VACIA = fuente([])

const PERMISOS_FULL: PermisosTaller = {
  ...PERMISOS_TALLER_ALL_FALSE,
  ver: true,
  aprobarInscripciones: true,
  resolverRetiros: true,
  gestionarGrupos: true,
}

interface SetupOpts {
  isEnabled?: boolean
  user?: { id: string } | null
  hasSession?: boolean
  pendientes?: PendientesInscripcionesResult
  aprobadas?: PendientesInscripcionesResult
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
    .mockImplementation(async (_client: unknown, estados: readonly string[]) =>
      estados[0] === 'aprobado' ? (opts.aprobadas ?? VACIA) : (opts.pendientes ?? VACIA),
    )
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

interface ClientElement {
  readonly type: unknown
  readonly props: {
    readonly items: readonly ItemPendiente[]
    readonly hoy: string
    readonly filtrosIniciales: unknown
    readonly itemInicial: string | null
  }
}

const SIN_PARAMS = { searchParams: Promise.resolve({}) }

async function renderClient(ctx: Parameters<typeof PendientesPage>[0] = SIN_PARAMS): Promise<ClientElement> {
  const element = (await PendientesPage(ctx)) as unknown as ClientElement
  expect(element.type).toBe(PendientesClient)
  return element
}

describe('PendientesPage — gate', () => {
  it('shows the disabled message and resolves nothing when the flag is off', async () => {
    setup({ isEnabled: false })
    const element = await PendientesPage(SIN_PARAMS)
    expect(extractText(element)).toMatch(/deshabilitado/i)
    expect(loadPendientesInscripcionesMock).not.toHaveBeenCalled()
  })

  it('asks to log in (neutral «tú») and resolves nothing when there is no user', async () => {
    setup({ user: null })
    const element = await PendientesPage(SIN_PARAMS)
    expect(extractText(element)).toContain('Necesitas iniciar sesión.')
    expect(loadPendientesInscripcionesMock).not.toHaveBeenCalled()
  })

  it('shows a session-resolution message when the session cannot be resolved', async () => {
    setup({ hasSession: false })
    const element = await PendientesPage(SIN_PARAMS)
    expect(extractText(element)).toMatch(/no se pudo resolver tu sesión/i)
    expect(loadPendientesInscripcionesMock).not.toHaveBeenCalled()
  })
})

describe('PendientesPage — sources', () => {
  it('loads pendiente inscripciones, aprobada ones (for «Sin grupo») and the retiros', async () => {
    setup({})
    const element = await renderClient()
    expect(loadPendientesInscripcionesMock).toHaveBeenCalledWith(expect.anything(), ['pendiente'])
    expect(loadPendientesInscripcionesMock).toHaveBeenCalledWith(expect.anything(), ['aprobado'])
    expect(loadPendientesSolicitudesMock).toHaveBeenCalledTimes(1)
    expect(element.props.items).toEqual([])
  })

  it('reads the filters and the open item from the URL', async () => {
    setup({})
    const element = await renderClient({
      searchParams: Promise.resolve({ atencion: 'identidad', taller: 'taller-a', q: 'ana', item: 'aprobar:insc-1' }),
    })
    expect(element.props.filtrosIniciales).toEqual({ atencion: 'identidad', taller: 'taller-a', q: 'ana' })
    expect(element.props.itemInicial).toBe('aprobar:insc-1')
  })

  it('ignores an unknown atencion value instead of filtering by it', async () => {
    setup({})
    const element = await renderClient({ searchParams: Promise.resolve({ atencion: 'todas' }) })
    expect(element.props.filtrosIniciales).toEqual({ atencion: null, taller: null, q: '' })
  })

  it('marks por_verificar inscripciones and turns aprobada ones without grupo into «sin-grupo» items', async () => {
    setup({
      pendientes: fuente([makeInscripcionRow({ id: 'insc-pv' })], { 't-a': 'eq-a' }, {
        'insc-pv': { origen: 'publico', porVerificar: true, grupoId: null },
      }),
      aprobadas: fuente(
        [
          makeInscripcionRow({ id: 'insc-sg', estado: 'aprobado' }),
          makeInscripcionRow({ id: 'insc-cg', estado: 'aprobado' }),
        ],
        { 't-a': 'eq-a' },
        {
          'insc-sg': { origen: 'app', porVerificar: false, grupoId: null },
          'insc-cg': { origen: 'app', porVerificar: false, grupoId: 'g-1' },
        },
      ),
      permisosPorEquipo: new Map([['eq-a', PERMISOS_FULL]]),
    })
    const { props } = await renderClient()
    expect(props.items.map((i) => i.clave).sort()).toEqual(['aprobar:insc-pv', 'sin-grupo:insc-sg'])
    expect(props.items.find((i) => i.clave === 'aprobar:insc-pv')).toMatchObject({ porVerificar: true, origen: 'publico' })
  })
})

describe('PendientesPage — per-item permission resolution (the heart of T6)', () => {
  it('lets the viewer decide taller A items and not taller B items, in the same list', async () => {
    setup({
      pendientes: fuente(
        [
          makeInscripcionRow({ id: 'insc-a', taller_id: 't-a' }),
          makeInscripcionRow({ id: 'insc-b', taller_id: 't-b', taller_nombre: 'Taller B', taller_slug: 'taller-b' }),
        ],
        { 't-a': 'eq-a', 't-b': 'eq-b' },
      ),
      solicitudes: [makeSolicitudRow({ id: 'sol-a', equipoId: 'eq-a' }), makeSolicitudRow({ id: 'sol-b', equipoId: 'eq-b' })],
      permisosPorEquipo: new Map([
        ['eq-a', PERMISOS_FULL],
        ['eq-b', PERMISOS_TALLER_ALL_FALSE],
      ]),
    })
    const { props } = await renderClient()
    const puede = Object.fromEntries(props.items.map((i) => [i.clave, i.puedeDecidir]))
    expect(puede).toEqual({
      'aprobar:insc-a': true,
      'aprobar:insc-b': false,
      'retiro:sol-a': true,
      'retiro:sol-b': false,
    })
  })

  it('a retiro whose equipo cannot be resolved is kept, and is not decidable without that permission', async () => {
    setup({ solicitudes: [makeSolicitudRow({ id: 'sol-orphan', equipoId: null })] })
    const { props } = await renderClient()
    expect(props.items).toHaveLength(1)
    expect(props.items[0]).toMatchObject({ clave: 'retiro:sol-orphan', motivo: 'Mudanza', puedeDecidir: false })
  })

  it('resolves permisos once, for the DISTINCT equipos of every source', async () => {
    setup({
      pendientes: fuente(
        [
          makeInscripcionRow({ id: 'insc-1', taller_id: 't-a' }),
          makeInscripcionRow({ id: 'insc-2', taller_id: 't-a' }),
          makeInscripcionRow({ id: 'insc-3', taller_id: 't-b' }),
        ],
        { 't-a': 'eq-a', 't-b': 'eq-b' },
      ),
      aprobadas: fuente([makeInscripcionRow({ id: 'insc-4', taller_id: 't-c', estado: 'aprobado' })], { 't-c': 'eq-c' }),
      solicitudes: [makeSolicitudRow({ equipoId: 'eq-a' })],
    })
    await renderClient()
    expect(cargarPermisosPorEquiposMock).toHaveBeenCalledTimes(1)
    const [, equipoIdsArg] = cargarPermisosPorEquiposMock.mock.calls[0]
    expect(new Set(equipoIdsArg)).toEqual(new Set(['eq-a', 'eq-b', 'eq-c']))
  })

  it('REGRESSION GUARD — every prop handed to the client island is plain data (no functions)', async () => {
    setup({
      pendientes: fuente([makeInscripcionRow()], { 't-a': 'eq-a' }),
      solicitudes: [makeSolicitudRow()],
      permisosPorEquipo: new Map([['eq-a', PERMISOS_FULL]]),
    })
    const { props } = await renderClient()
    const containsFunction = (v: unknown): boolean => {
      if (typeof v === 'function') return true
      if (Array.isArray(v)) return v.some(containsFunction)
      if (v && typeof v === 'object') return Object.values(v).some(containsFunction)
      return false
    }
    for (const value of Object.values(props)) {
      expect(containsFunction(value)).toBe(false)
      expect(() => JSON.stringify(value)).not.toThrow()
    }
  })
})
