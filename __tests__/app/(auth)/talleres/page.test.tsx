/**
 * @jest-environment node
 *
 * T2 (odd/tasks/talleres-consolidar-pantallas.md) — /talleres (the new
 * consolidated catalog).
 *
 * Mirrors the gate pattern of nuevo-page.test.tsx (flag -> user ->
 * session, each an informational card, structurally inspected via
 * `extractText`/`containsForm`-style helpers rather than full
 * rendering) — but this page does NOT gate on a capability card: any
 * signed-in user may open it (docs/talleres-de-punta-a-punta.md's own
 * "Decisiones" — "cualquier usuario con sesión puede abrir /talleres").
 *
 * Section visibility (leader sees "Mis grupos", director sees the
 * create control, coordinator doesn't, member sees the empty inputs) is
 * proved at the PROPS level: `<CatalogoTalleresClient>` is a real client
 * component with its own hooks, so this RSC-only test (no DOM renderer)
 * cannot execute it — instead it inspects the unexecuted element's
 * `.props`, which the page computed. The component's own rendering
 * behavior given those props is covered separately in
 * __tests__/components/talleres/catalogo-talleres-client.test.tsx.
 */

import { CatalogoTalleresClient } from '@/components/talleres/catalogo-talleres-client'
import TalleresCatalogoPage from '@/app/(auth)/talleres/page'

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
  loadCatalogoTalleres: jest.fn(),
  loadMisGruposResumen: jest.fn(),
}))

jest.mock('@/lib/platform/talleres/equipo-organigrama', () => ({
  fetchOpcionesEquipoTaller: jest.fn(),
}))

const flagsMock = jest.requireMock('@/lib/platform/talleres/flags').isTalleresEnabled as jest.Mock
const createSupabaseServerClientMock = jest.requireMock('@/lib/supabase/server')
  .createSupabaseServerClient as jest.Mock
const resolveSessionMock = jest.requireMock('@/lib/auth/platformSessionReadOnly')
  .resolveReadOnlyPlatformSession as jest.Mock
const loadCatalogoTalleresMock = jest.requireMock('@/lib/platform/talleres/catalogo')
  .loadCatalogoTalleres as jest.Mock
const loadMisGruposResumenMock = jest.requireMock('@/lib/platform/talleres/catalogo')
  .loadMisGruposResumen as jest.Mock
const fetchOpcionesMock = jest.requireMock('@/lib/platform/talleres/equipo-organigrama')
  .fetchOpcionesEquipoTaller as jest.Mock

interface SetupOpts {
  isEnabled?: boolean
  user?: { id: string } | null
  hasSession?: boolean
  capabilities?: string[]
  catalogo?: unknown[]
  misGrupos?: unknown[]
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

  loadCatalogoTalleresMock.mockReset().mockResolvedValue(opts.catalogo ?? [])
  loadMisGruposResumenMock.mockReset().mockResolvedValue(opts.misGrupos ?? [])
  fetchOpcionesMock.mockReset().mockResolvedValue({ vincular: [], crearBajo: [] })
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

/**
 * True when the tree contains an <a>/<Link> whose href is the given
 * path. Walks EVERY prop value, not just `children` — the explorar
 * link is passed as `accionPrincipal` to `<ContenedorDashboard>`, a
 * sibling prop to `children`, which a children-only walk would miss.
 */
function containsHref(node: unknown, href: string): boolean {
  if (node === null || node === undefined || typeof node === 'boolean') return false
  if (Array.isArray(node)) return node.some((n) => containsHref(n, href))
  if (typeof node === 'object' && node !== null && 'props' in node) {
    const props = (node as { props?: Record<string, unknown> }).props
    if (!props) return false
    if (props.href === href) return true
    return Object.values(props).some((value) => containsHref(value, href))
  }
  return false
}

describe('TalleresCatalogoPage — gate', () => {
  it('shows the disabled message and loads nothing when the flag is off', async () => {
    setup({ isEnabled: false })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TalleresCatalogoPage()) as any
    expect(extractText(element)).toMatch(/deshabilitado/i)
    expect(loadCatalogoTalleresMock).not.toHaveBeenCalled()
    expect(loadMisGruposResumenMock).not.toHaveBeenCalled()
  })

  it('asks to log in and loads nothing when there is no user', async () => {
    setup({ user: null })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TalleresCatalogoPage()) as any
    expect(extractText(element)).toMatch(/iniciar sesión/i)
    expect(loadCatalogoTalleresMock).not.toHaveBeenCalled()
  })

  it('shows a session-resolution message and loads nothing when the session cannot be resolved', async () => {
    setup({ hasSession: false })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TalleresCatalogoPage()) as any
    expect(extractText(element)).toMatch(/no se pudo resolver tu sesión/i)
    expect(loadCatalogoTalleresMock).not.toHaveBeenCalled()
  })

  it('does NOT gate on a capability card — any signed-in user with zero capabilities reaches the catalog', async () => {
    setup({ capabilities: [] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TalleresCatalogoPage()) as any
    expect(loadCatalogoTalleresMock).toHaveBeenCalledTimes(1)
    expect(findByType(element, CatalogoTalleresClient)).not.toBeNull()
  })
})

describe('TalleresCatalogoPage — always-visible explorar link', () => {
  it('renders a link to /talleres/explorar regardless of role', async () => {
    setup({ capabilities: ['talleres_crecimiento.director.write'] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TalleresCatalogoPage()) as any
    expect(containsHref(element, '/talleres/explorar')).toBe(true)
  })
})

describe('TalleresCatalogoPage — section wiring per role', () => {
  it('leader: misGrupos is passed through and puedeCrear is false', async () => {
    setup({
      capabilities: ['talleres_crecimiento.lead.read'],
      misGrupos: [{ id: 'g-1', nombre: 'Grupo A', estado: 'activo', tallerNombre: null, edicionNombre: null, proximaClase: null }],
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TalleresCatalogoPage()) as any
    const node = findByType(element, CatalogoTalleresClient)
    expect(node).not.toBeNull()
    expect((node?.props.misGrupos as unknown[]).length).toBe(1)
    expect(node?.props.puedeCrear).toBe(false)
    expect(fetchOpcionesMock).not.toHaveBeenCalled()
  })

  it('director.write: puedeCrear is true, catálogo is passed through, opciones are fetched', async () => {
    setup({
      capabilities: ['talleres_crecimiento.director.write'],
      catalogo: [{ id: 't-1', slug: 'x', nombre: 'X', estado: 'active', dream_team_equipo_id: null, ediciones: [] }],
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TalleresCatalogoPage()) as any
    const node = findByType(element, CatalogoTalleresClient)
    expect(node?.props.puedeCrear).toBe(true)
    expect((node?.props.catalogo as unknown[]).length).toBe(1)
    expect(fetchOpcionesMock).toHaveBeenCalledTimes(1)
  })

  it('admin.manage also grants puedeCrear (mirrors create_taller_abstract\'s own gate)', async () => {
    setup({ capabilities: ['talleres_crecimiento.admin.manage'] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TalleresCatalogoPage()) as any
    const node = findByType(element, CatalogoTalleresClient)
    expect(node?.props.puedeCrear).toBe(true)
  })

  it('coordinator.read: sees the catálogo but puedeCrear is false and opciones are never fetched', async () => {
    setup({
      capabilities: ['talleres_crecimiento.coordinator.read'],
      catalogo: [{ id: 't-1', slug: 'x', nombre: 'X', estado: 'active', dream_team_equipo_id: null, ediciones: [] }],
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TalleresCatalogoPage()) as any
    const node = findByType(element, CatalogoTalleresClient)
    expect(node?.props.puedeCrear).toBe(false)
    expect((node?.props.catalogo as unknown[]).length).toBe(1)
    expect(fetchOpcionesMock).not.toHaveBeenCalled()
  })

  it('member (zero capabilities): empty catálogo and misGrupos, no create — and the explorar link is present', async () => {
    setup({ capabilities: [] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TalleresCatalogoPage()) as any
    const node = findByType(element, CatalogoTalleresClient)
    expect(node?.props.misGrupos).toEqual([])
    expect(node?.props.catalogo).toEqual([])
    expect(node?.props.puedeCrear).toBe(false)
    expect(containsHref(element, '/talleres/explorar')).toBe(true)
  })
})
