/**
 * @jest-environment node
 *
 * T7 (odd/tasks/talleres-consolidar-pantallas.md) — /talleres/reportes,
 * replacing the role-prefixed pair app/(auth)/talleres/coordinacion/reportes
 * and app/(auth)/talleres/direccion/reportes (both kept alive, unmodified,
 * until T10 deletes them — see lib/platform/talleres/rutas.ts).
 *
 * Mirrors the gate + structural-inspection pattern of
 * __tests__/app/(auth)/talleres/pendientes/page.test.tsx (flag -> user ->
 * session, each an informational card, inspected via extractText/findByType
 * rather than full rendering).
 *
 * R3g (odd/tasks/talleres-rediseno.md) rebuilt the screen on v2: the page
 * now hands its data to ReportesTalleresClient, so these tests inspect the
 * client's props; the rendering (tabs, pills, «Reabierto», drawer) is
 * covered in __tests__/components/talleres/reportes/. Still verified here:
 *   1. the gate (flag -> user -> session) resolves nothing when it stops;
 *   2. the counter line shows only when the viewer holds verReportes for
 *      MORE THAN ONE distinct equipo among the visible reportes;
 *   3. a report whose equipo cannot be resolved is never dropped.
 */

import ReportesPage from '@/app/(auth)/talleres/reportes/page'
import { PaginaSistema } from '@/components/ui/sistema-diseno'
import { ReportesTalleresClient } from '@/components/talleres/reportes/reportes-talleres-client'
import { PERMISOS_TALLER_ALL_FALSE, type PermisosTaller } from '@/lib/platform/talleres/permisos'
import type { ReporteRow } from '@/lib/platform/talleres/reportes'

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

jest.mock('@/lib/platform/talleres/reportes', () => ({
  loadReportes: jest.fn(),
  loadEdicionesReporte: jest.fn(),
}))

jest.mock('@/lib/platform/talleres/refrescar-estados', () => ({
  refrescarEstadosEdiciones: jest.fn(),
}))

jest.mock('@/lib/platform/talleres/permisos', () => {
  const actual = jest.requireActual('@/lib/platform/talleres/permisos')
  return { ...actual, cargarPermisosPorEquipos: jest.fn() }
})

const flagsMock = jest.requireMock('@/lib/platform/talleres/flags').isTalleresEnabled as jest.Mock
const createSupabaseServerClientMock = jest.requireMock('@/lib/supabase/server')
  .createSupabaseServerClient as jest.Mock
const resolveSessionMock = jest.requireMock('@/lib/auth/platformSessionReadOnly')
  .resolveReadOnlyPlatformSession as jest.Mock
const loadReportesMock = jest.requireMock('@/lib/platform/talleres/reportes').loadReportes as jest.Mock
const loadEdicionesReporteMock = jest.requireMock('@/lib/platform/talleres/reportes').loadEdicionesReporte as jest.Mock
const refrescarMock = jest.requireMock('@/lib/platform/talleres/refrescar-estados').refrescarEstadosEdiciones as jest.Mock
const cargarPermisosPorEquiposMock = jest.requireMock('@/lib/platform/talleres/permisos')
  .cargarPermisosPorEquipos as jest.Mock

function makeReporteRow(overrides: Partial<ReporteRow> = {}): ReporteRow {
  return {
    id: 'rep-1',
    grupo_id: 'grupo-1',
    estado: 'enviado',
    firma_lider_fecha: '2026-09-10T00:00:00Z',
    reabierto_motivo: null,
    equipoId: 'eq-a',
    tallerNombre: 'Taller A',
    grupoNombre: 'Grupo 1',
    edicionId: 'ed-1',
    ...overrides,
  }
}

const PERMISOS_CON_REPORTES: PermisosTaller = { ...PERMISOS_TALLER_ALL_FALSE, ver: true, verReportes: true }

interface SetupOpts {
  isEnabled?: boolean
  user?: { id: string } | null
  hasSession?: boolean
  rows?: readonly ReporteRow[]
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

  loadReportesMock.mockReset().mockResolvedValue(opts.rows ?? [])
  loadEdicionesReporteMock.mockReset().mockResolvedValue([])
  refrescarMock.mockReset().mockResolvedValue(undefined)
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
function findAllByType(
  node: unknown,
  type: unknown,
  acc: Array<{ props: Record<string, unknown> }> = [],
): Array<{ props: Record<string, unknown> }> {
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
async function render(searchParams?: Record<string, string>): Promise<any> {
  return ReportesPage(searchParams ? { searchParams: Promise.resolve(searchParams) } : undefined)
}

function clientProps(element: unknown): Record<string, unknown> {
  const client = findByType(element, ReportesTalleresClient)
  expect(client).not.toBeNull()
  return client!.props
}

describe('ReportesPage — gate', () => {
  it('shows the disabled message and resolves nothing when the flag is off', async () => {
    setup({ isEnabled: false })
    const element = await render()
    expect(extractText(element)).toMatch(/deshabilitado/i)
    expect(loadReportesMock).not.toHaveBeenCalled()
    expect(loadEdicionesReporteMock).not.toHaveBeenCalled()
  })

  it('asks to log in (with «tú») and resolves nothing when there is no user', async () => {
    setup({ user: null })
    const element = await render()
    expect(extractText(element)).toMatch(/Necesitas iniciar sesión/)
    expect(loadReportesMock).not.toHaveBeenCalled()
  })

  it('shows a session-resolution message when the session cannot be resolved', async () => {
    setup({ hasSession: false })
    const element = await render()
    expect(extractText(element)).toMatch(/no se pudo resolver tu sesión/i)
    expect(loadReportesMock).not.toHaveBeenCalled()
    expect(loadEdicionesReporteMock).not.toHaveBeenCalled()
  })
})

describe('ReportesPage — data handed to the screen', () => {
  it('refreshes the estados before reading and passes the ediciones and reports to the client', async () => {
    setup({ rows: [makeReporteRow({ id: 'rep-1', estado: 'reabierto', reabierto_motivo: 'Faltaban firmas' })] })
    const edicion = { id: 'ed-1' }
    loadEdicionesReporteMock.mockResolvedValue([edicion])
    const props = clientProps(await render())
    expect(refrescarMock).toHaveBeenCalledTimes(1)
    expect(refrescarMock.mock.invocationCallOrder[0]).toBeLessThan(loadEdicionesReporteMock.mock.invocationCallOrder[0])
    expect(props.ediciones).toEqual([edicion])
    expect(props.grupos).toEqual([
      {
        id: 'rep-1',
        grupoId: 'grupo-1',
        grupoNombre: 'Grupo 1',
        estado: 'reabierto',
        firmaLiderFecha: '2026-09-10T00:00:00Z',
        reabiertoMotivo: 'Faltaban firmas',
        tallerNombre: 'Taller A',
        edicionId: 'ed-1',
      },
    ])
    expect(props.hoy).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('still passes a report whose equipo could not be resolved (T6b rule)', async () => {
    setup({
      rows: [makeReporteRow({ id: 'rep-orphan', equipoId: null, tallerNombre: null, grupoNombre: null, edicionId: null })],
      permisosPorEquipo: new Map([[null, PERMISOS_TALLER_ALL_FALSE]]),
    })
    const props = clientProps(await render())
    expect((props.grupos as Array<{ id: string }>).map((g) => g.id)).toEqual(['rep-orphan'])
  })

  it('reads vista, rango and filtro from the URL', async () => {
    setup({})
    const props = clientProps(await render({ vista: 'grupos', rango: '6m', filtro: 'reabiertos' }))
    expect(props.consultaInicial).toEqual({ vista: 'grupos', rango: '6m', filtro: 'reabiertos' })
  })

  it('falls back to Por taller and Este año without parameters', async () => {
    setup({})
    const props = clientProps(await render())
    expect(props.consultaInicial).toEqual({ vista: 'talleres', rango: 'anio', filtro: null })
  })
})

describe('ReportesPage — counter line predicate (breadth, not role)', () => {
  it('hides the counters when the viewer holds verReportes in only one equipo', async () => {
    setup({
      rows: [makeReporteRow({ id: 'rep-1', equipoId: 'eq-a' })],
      permisosPorEquipo: new Map([['eq-a', PERMISOS_CON_REPORTES]]),
    })
    expect(clientProps(await render()).mostrarContadores).toBe(false)
  })

  it('shows the counters when the viewer holds verReportes in more than one equipo', async () => {
    setup({
      rows: [
        makeReporteRow({ id: 'rep-1', equipoId: 'eq-a', estado: 'enviado' }),
        makeReporteRow({ id: 'rep-2', equipoId: 'eq-b', estado: 'cerrado' }),
      ],
      permisosPorEquipo: new Map([
        ['eq-a', PERMISOS_CON_REPORTES],
        ['eq-b', PERMISOS_CON_REPORTES],
      ]),
    })
    expect(clientProps(await render()).mostrarContadores).toBe(true)
  })

  it('does not count an equipo toward breadth when verReportes is false there, even with rows from 2 equipos', async () => {
    setup({
      rows: [
        makeReporteRow({ id: 'rep-1', equipoId: 'eq-a', estado: 'enviado' }),
        makeReporteRow({ id: 'rep-2', equipoId: 'eq-b', estado: 'cerrado' }),
      ],
      permisosPorEquipo: new Map([
        ['eq-a', PERMISOS_CON_REPORTES],
        ['eq-b', PERMISOS_TALLER_ALL_FALSE],
      ]),
    })
    expect(clientProps(await render()).mostrarContadores).toBe(false)
  })

  it('resolves permisos once per DISTINCT equipo present in the rows', async () => {
    setup({
      rows: [
        makeReporteRow({ id: 'rep-1', equipoId: 'eq-a' }),
        makeReporteRow({ id: 'rep-2', equipoId: 'eq-a' }),
        makeReporteRow({ id: 'rep-3', equipoId: 'eq-b' }),
      ],
    })
    await render()
    expect(cargarPermisosPorEquiposMock).toHaveBeenCalledTimes(1)
    const [, equipoIdsArg] = cargarPermisosPorEquiposMock.mock.calls[0]
    expect(new Set(equipoIdsArg)).toEqual(new Set(['eq-a', 'eq-b']))
  })
})

describe('ReportesPage — page shell', () => {
  it('titles the page «Reportes de talleres»', async () => {
    setup({})
    const dashboard = findByType(await render(), PaginaSistema)
    expect(dashboard?.props.titulo).toBe('Reportes de talleres')
  })
})
