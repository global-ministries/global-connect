/**
 * @jest-environment node
 *
 * T8 (odd/tasks/talleres-consolidar-pantallas.md) — /talleres/temporadas/
 * crear, replacing app/(auth)/admin/talleres/temporadas/crear/page.tsx
 * (kept alive, unmodified, until T10 deletes it).
 *
 * "crear", not "nueva" — parent decision, 2026-09-20 (see
 * lib/platform/talleres/rutas.ts's rutaTemporadaCrear header).
 *
 * Thin server wrapper: flag -> user -> session gate, then the SAME flat
 * capability check as the list page and actions.ts (director.write OR
 * admin.manage) — a viewer without it sees an informational "no tenés
 * permisos" card instead of the form (hide the control, never disable
 * it — here the whole page is the control).
 *
 * TallerTemporadaForm is a real client component with its own hooks —
 * mocked to a marker component, same pattern as every other RSC-only
 * page test in this family.
 */

import TemporadaCrearPage from '@/app/(auth)/talleres/temporadas/crear/page'
import { TallerTemporadaForm } from '@/app/(auth)/talleres/temporadas/crear/temporada-form'
import { ContenedorDashboard } from '@/components/ui/sistema-diseno'

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

jest.mock('@/app/(auth)/talleres/temporadas/crear/temporada-form', () => ({
  TallerTemporadaForm: () => null,
}))

const flagsMock = jest.requireMock('@/lib/platform/talleres/flags').isTalleresEnabled as jest.Mock
const createSupabaseServerClientMock = jest.requireMock('@/lib/supabase/server')
  .createSupabaseServerClient as jest.Mock
const resolveSessionMock = jest.requireMock('@/lib/auth/platformSessionReadOnly')
  .resolveReadOnlyPlatformSession as jest.Mock

interface SetupOpts {
  isEnabled?: boolean
  user?: { id: string } | null
  hasSession?: boolean
  capabilities?: string[]
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

describe('TemporadaCrearPage — gate', () => {
  it('shows the disabled message when the flag is off', async () => {
    setup({ isEnabled: false })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TemporadaCrearPage()) as any
    expect(extractText(element)).toMatch(/deshabilitado/i)
  })

  it('asks to log in when there is no user', async () => {
    setup({ user: null })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TemporadaCrearPage()) as any
    expect(extractText(element)).toMatch(/iniciar sesión/i)
  })

  it('shows a session-resolution message when the session cannot be resolved', async () => {
    setup({ hasSession: false })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TemporadaCrearPage()) as any
    expect(extractText(element)).toMatch(/no se pudo resolver tu sesión/i)
  })
})

describe('TemporadaCrearPage — puedeCrear gate', () => {
  it('shows a "no tenés permisos" card and no form without director.write or admin.manage', async () => {
    setup({ capabilities: ['talleres_crecimiento.coordinator.read'] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TemporadaCrearPage()) as any
    expect(extractText(element)).toMatch(/no tenés permisos/i)
    expect(findByType(element, TallerTemporadaForm)).toBeNull()
  })

  it('renders the form with director.write', async () => {
    setup({ capabilities: ['talleres_crecimiento.director.write'] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TemporadaCrearPage()) as any
    expect(findByType(element, TallerTemporadaForm)).not.toBeNull()
  })

  it('renders the form with admin.manage', async () => {
    setup({ capabilities: ['talleres_crecimiento.admin.manage'] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TemporadaCrearPage()) as any
    expect(findByType(element, TallerTemporadaForm)).not.toBeNull()
  })
})

describe('TemporadaCrearPage — page shell', () => {
  it('titles the page "Crear Temporada"', async () => {
    setup({ capabilities: ['talleres_crecimiento.director.write'] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TemporadaCrearPage()) as any
    const dashboard = findByType(element, ContenedorDashboard)
    expect(dashboard?.props.titulo).toBe('Crear Temporada')
  })
})
