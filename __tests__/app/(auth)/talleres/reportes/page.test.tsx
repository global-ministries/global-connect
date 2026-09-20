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
 * The two things this consolidation must get right, verified here:
 *   1. the counter row (estado counts) shows only when the viewer holds
 *      verReportes for MORE THAN ONE distinct equipo among the visible
 *      reportes — not a director-only feature, not a role check.
 *   2. every row always shows the "Reabierto" badge when reabierto_motivo
 *      is set — the old direccion/reportes page silently dropped it.
 */

import ReportesPage from '@/app/(auth)/talleres/reportes/page'
import { EstadoVacio } from '@/components/dream-team/estado-vacio'
import { ContenedorDashboard, BadgeSistema } from '@/components/ui/sistema-diseno'
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

describe('ReportesPage — gate', () => {
  it('shows the disabled message and resolves nothing when the flag is off', async () => {
    setup({ isEnabled: false })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await ReportesPage()) as any
    expect(extractText(element)).toMatch(/deshabilitado/i)
    expect(loadReportesMock).not.toHaveBeenCalled()
  })

  it('asks to log in and resolves nothing when there is no user', async () => {
    setup({ user: null })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await ReportesPage()) as any
    expect(extractText(element)).toMatch(/iniciar sesión/i)
    expect(loadReportesMock).not.toHaveBeenCalled()
  })

  it('shows a session-resolution message when the session cannot be resolved', async () => {
    setup({ hasSession: false })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await ReportesPage()) as any
    expect(extractText(element)).toMatch(/no se pudo resolver tu sesión/i)
    expect(loadReportesMock).not.toHaveBeenCalled()
  })
})

describe('ReportesPage — empty state', () => {
  it('shows EstadoVacio, not an error, when there are no reportes', async () => {
    setup({ rows: [] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await ReportesPage()) as any
    const vacio = findByType(element, EstadoVacio)
    expect(vacio).not.toBeNull()
    expect(String(vacio?.props.titulo)).toMatch(/no hay reportes/i)
  })
})

describe('ReportesPage — Reabierto badge (T7 regression fix)', () => {
  it('shows the Reabierto badge for a row with reabierto_motivo set', async () => {
    setup({
      rows: [makeReporteRow({ id: 'rep-1', estado: 'reabierto', reabierto_motivo: 'Faltaban firmas' })],
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await ReportesPage()) as any
    expect(extractText(element)).toMatch(/reabierto/i)
  })

  it('never shows the Reabierto badge for a row without reabierto_motivo', async () => {
    setup({ rows: [makeReporteRow({ id: 'rep-1', estado: 'enviado', reabierto_motivo: null })] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await ReportesPage()) as any
    const badges = findAllByType(element, BadgeSistema)
    expect(badges.some((b) => /reabierto/i.test(extractText(b.props.children)))).toBe(false)
  })
})

describe('ReportesPage — counter row predicate (breadth, not role)', () => {
  it('hides the counter row when the viewer holds verReportes in only one equipo', async () => {
    setup({
      rows: [makeReporteRow({ id: 'rep-1', equipoId: 'eq-a' })],
      permisosPorEquipo: new Map([['eq-a', PERMISOS_CON_REPORTES]]),
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await ReportesPage()) as any
    const text = extractText(element)
    expect(text).not.toMatch(/enviado\s*:\s*1/i)
  })

  it('shows the counter row when the viewer holds verReportes in more than one equipo', async () => {
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await ReportesPage()) as any
    const text = extractText(element)
    expect(text).toMatch(/enviado\s*:\s*1/i)
    expect(text).toMatch(/cerrado\s*:\s*1/i)
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await ReportesPage()) as any
    const text = extractText(element)
    expect(text).not.toMatch(/enviado\s*:\s*1/i)
  })

  it('resolves permisos once per DISTINCT equipo present in the rows', async () => {
    setup({
      rows: [
        makeReporteRow({ id: 'rep-1', equipoId: 'eq-a' }),
        makeReporteRow({ id: 'rep-2', equipoId: 'eq-a' }),
        makeReporteRow({ id: 'rep-3', equipoId: 'eq-b' }),
      ],
    })
    await ReportesPage()
    expect(cargarPermisosPorEquiposMock).toHaveBeenCalledTimes(1)
    const [, equipoIdsArg] = cargarPermisosPorEquiposMock.mock.calls[0]
    expect(new Set(equipoIdsArg)).toEqual(new Set(['eq-a', 'eq-b']))
  })
})

describe('ReportesPage — never drops a row (T6b rule)', () => {
  it('still renders a row whose equipo could not be resolved (equipoId/tallerNombre: null)', async () => {
    setup({
      rows: [makeReporteRow({ id: 'rep-orphan', equipoId: null, tallerNombre: null })],
      permisosPorEquipo: new Map([[null, PERMISOS_TALLER_ALL_FALSE]]),
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await ReportesPage()) as any
    expect(extractText(element)).toMatch(/grupo-1/i)
  })
})

describe('ReportesPage — page shell', () => {
  it('titles the page "Reportes"', async () => {
    setup({})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await ReportesPage()) as any
    const dashboard = findByType(element, ContenedorDashboard)
    expect(dashboard?.props.titulo).toBe('Reportes')
  })
})
