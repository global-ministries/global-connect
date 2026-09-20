/**
 * @jest-environment node
 *
 * T8 (odd/tasks/talleres-consolidar-pantallas.md) — /talleres/temporadas,
 * the consolidated list, replacing
 * app/(auth)/admin/talleres/temporadas/page.tsx (kept alive, unmodified,
 * until T10 deletes it — see lib/platform/talleres/rutas.ts).
 *
 * Mirrors the gate + structural-inspection pattern of
 * __tests__/app/(auth)/talleres/reportes/page.test.tsx (flag -> user ->
 * session, each an informational card, inspected via extractText/
 * findByType rather than full rendering).
 *
 * PERMISSIONS: `puedeCrear` is a flat capability check
 * (director.write OR admin.manage), NOT cargarPermisos(client, equipoId) —
 * see actions.ts's own header for the evidence (talleres_temporadas' RLS
 * uses the UNSCOPED auth_has_talleres_capability, exactly like
 * create_taller_abstract, whose reasoning app/(auth)/talleres/page.tsx
 * (T2) already documents for `puedeCrear` there). "Hide the control,
 * never disable it" still holds: the button only renders when puedeCrear.
 */

import TemporadasPage from '@/app/(auth)/talleres/temporadas/page'
import { EstadoVacio } from '@/components/dream-team/estado-vacio'
import { ContenedorDashboard, BadgeSistema } from '@/components/ui/sistema-diseno'
import type { TemporadaRow } from '@/lib/platform/talleres/temporadas'

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

jest.mock('@/lib/platform/talleres/temporadas', () => ({
  loadTemporadas: jest.fn(),
}))

const flagsMock = jest.requireMock('@/lib/platform/talleres/flags').isTalleresEnabled as jest.Mock
const createSupabaseServerClientMock = jest.requireMock('@/lib/supabase/server')
  .createSupabaseServerClient as jest.Mock
const resolveSessionMock = jest.requireMock('@/lib/auth/platformSessionReadOnly')
  .resolveReadOnlyPlatformSession as jest.Mock
const loadTemporadasMock = jest.requireMock('@/lib/platform/talleres/temporadas')
  .loadTemporadas as jest.Mock

function makeTemporadaRow(overrides: Partial<TemporadaRow> = {}): TemporadaRow {
  return {
    id: 'temp-1',
    nombre: 'Temporada Otoño 2026',
    slug: 'otono-2026',
    estado: 'abierto',
    fecha_apertura: '2026-09-01T00:00:00.000Z',
    fecha_cierre: '2026-12-15T00:00:00.000Z',
    ...overrides,
  }
}

interface SetupOpts {
  isEnabled?: boolean
  user?: { id: string } | null
  hasSession?: boolean
  capabilities?: string[]
  rows?: readonly TemporadaRow[]
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
          capabilities: (opts.capabilities ?? []).map((key) => ({
            key,
            experience: 'talleres_crecimiento',
            scopeType: 'taller',
            source: 'test',
          })),
        }
      : null,
  )

  loadTemporadasMock.mockReset().mockResolvedValue(opts.rows ?? [])
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

describe('TemporadasPage — gate', () => {
  it('shows the disabled message and resolves nothing when the flag is off', async () => {
    setup({ isEnabled: false })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TemporadasPage()) as any
    expect(extractText(element)).toMatch(/deshabilitado/i)
    expect(loadTemporadasMock).not.toHaveBeenCalled()
  })

  it('asks to log in and resolves nothing when there is no user', async () => {
    setup({ user: null })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TemporadasPage()) as any
    expect(extractText(element)).toMatch(/iniciar sesión/i)
    expect(loadTemporadasMock).not.toHaveBeenCalled()
  })

  it('shows a session-resolution message when the session cannot be resolved', async () => {
    setup({ hasSession: false })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TemporadasPage()) as any
    expect(extractText(element)).toMatch(/no se pudo resolver tu sesión/i)
    expect(loadTemporadasMock).not.toHaveBeenCalled()
  })
})

describe('TemporadasPage — empty state', () => {
  it('shows EstadoVacio, not an error, when there are no temporadas', async () => {
    setup({ rows: [] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TemporadasPage()) as any
    const vacio = findByType(element, EstadoVacio)
    expect(vacio).not.toBeNull()
    expect(String(vacio?.props.titulo)).toMatch(/no hay temporadas/i)
  })
})

describe('TemporadasPage — puedeCrear (hide the control, never disable it)', () => {
  it('hides "Crear Temporada" for a viewer without director.write or admin.manage', async () => {
    setup({ rows: [], capabilities: ['talleres_crecimiento.coordinator.read'] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TemporadasPage()) as any
    const dashboard = findByType(element, ContenedorDashboard)
    expect(dashboard?.props.accionPrincipal).toBeUndefined()
  })

  it('shows "Crear Temporada" for a viewer with director.write', async () => {
    setup({ rows: [], capabilities: ['talleres_crecimiento.director.write'] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TemporadasPage()) as any
    const dashboard = findByType(element, ContenedorDashboard)
    expect(extractText(dashboard?.props.accionPrincipal)).toMatch(/crear temporada/i)
  })

  it('shows "Crear Temporada" for a viewer with admin.manage', async () => {
    setup({ rows: [], capabilities: ['talleres_crecimiento.admin.manage'] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TemporadasPage()) as any
    const dashboard = findByType(element, ContenedorDashboard)
    expect(extractText(dashboard?.props.accionPrincipal)).toMatch(/crear temporada/i)
  })
})

describe('TemporadasPage — rows', () => {
  it('never renders a raw estado key — always through temporadaEstadoLabel', async () => {
    setup({ rows: [makeTemporadaRow({ estado: 'abierto' })] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TemporadasPage()) as any
    const badges = findAllByType(element, BadgeSistema)
    expect(badges.some((b) => /abierta/i.test(extractText(b.props.children)))).toBe(true)
  })

  it('renders the temporada nombre and slug', async () => {
    setup({ rows: [makeTemporadaRow({ nombre: 'Temporada Primavera', slug: 'primavera-2027' })] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TemporadasPage()) as any
    const text = extractText(element)
    expect(text).toMatch(/temporada primavera/i)
    expect(text).toMatch(/primavera-2027/)
  })
})

describe('TemporadasPage — page shell', () => {
  it('titles the page "Temporadas"', async () => {
    setup({ rows: [] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TemporadasPage()) as any
    const dashboard = findByType(element, ContenedorDashboard)
    expect(dashboard?.props.titulo).toBe('Temporadas')
  })
})
