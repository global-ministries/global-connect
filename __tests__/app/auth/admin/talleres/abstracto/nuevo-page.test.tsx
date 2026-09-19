/**
 * @jest-environment node
 *
 * T4c — Gate /admin/talleres/abstracto/nuevo like its siblings.
 *
 * Before this fix, this page had NO isTalleresEnabled() check, NO
 * session check, and NO director.write/admin.manage capability check
 * — unlike its siblings abstracto/page.tsx and abstracto/[slug]/page.tsx.
 * With the flag off the screen was still reachable, and it ran a live
 * fetchOpcionesEquipoTaller query for any authenticated user regardless
 * of capability (a read-only talleres user could see the admin node
 * picker). No write escalation (createTallerAbstract re-checks), but
 * it didn't match its siblings.
 *
 * This mirrors the exact gate abstracto/page.tsx uses: isTalleresEnabled
 * -> getUser -> resolveReadOnlyPlatformSession -> director.write /
 * admin.manage capability check — each returning the same informational
 * card the siblings render for that case (neither sibling uses
 * notFound()/redirect() for these three cases).
 *
 * The page is called directly as a plain async function (no DOM
 * render): the returned React element tree is inspected structurally
 * for the expected copy, which is enough to prove which branch ran and
 * avoids executing the client-only CrearTallerAbstractoForm (hooks,
 * next/navigation, sonner) that the success branch renders opaquely.
 */

import CrearTallerAbstractoPage from '@/app/(auth)/admin/talleres/abstracto/nuevo/page'
import { CrearTallerAbstractoForm } from '@/app/(auth)/admin/talleres/abstracto/nuevo/crear-form'

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

jest.mock('@/lib/platform/talleres/equipo-organigrama', () => ({
  fetchOpcionesEquipoTaller: jest.fn(),
}))

const flagsMock = jest.requireMock('@/lib/platform/talleres/flags')
  .isTalleresEnabled as jest.Mock
const createSupabaseServerClientMock = jest.requireMock('@/lib/supabase/server')
  .createSupabaseServerClient as jest.Mock
const resolveSessionMock = jest.requireMock('@/lib/auth/platformSessionReadOnly')
  .resolveReadOnlyPlatformSession as jest.Mock
const fetchOpcionesMock = jest.requireMock('@/lib/platform/talleres/equipo-organigrama')
  .fetchOpcionesEquipoTaller as jest.Mock

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

/** True when the element tree contains a <CrearTallerAbstractoForm> node. */
function containsForm(node: unknown): boolean {
  if (node === null || node === undefined || typeof node === 'boolean') return false
  if (Array.isArray(node)) return node.some(containsForm)
  if (typeof node === 'object' && node !== null && 'type' in node) {
    const el = node as { type: unknown; props?: { children?: unknown } }
    if (el.type === CrearTallerAbstractoForm) return true
    return containsForm(el.props?.children)
  }
  return false
}

describe('CrearTallerAbstractoPage — gate (T4c)', () => {
  it('shows the disabled message and never fetches opciones when the flag is off', async () => {
    setup({ isEnabled: false })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await CrearTallerAbstractoPage()) as any
    expect(fetchOpcionesMock).not.toHaveBeenCalled()
    expect(extractText(element)).toMatch(/deshabilitado/i)
    expect(containsForm(element)).toBe(false)
  })

  it('asks to log in and never fetches opciones when there is no user', async () => {
    setup({ user: null })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await CrearTallerAbstractoPage()) as any
    expect(fetchOpcionesMock).not.toHaveBeenCalled()
    expect(extractText(element)).toMatch(/iniciar sesión/i)
    expect(containsForm(element)).toBe(false)
  })

  it('shows a session-resolution message and never fetches opciones when the session cannot be resolved', async () => {
    setup({ hasSession: false })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await CrearTallerAbstractoPage()) as any
    expect(fetchOpcionesMock).not.toHaveBeenCalled()
    expect(extractText(element)).toMatch(/no se pudo resolver tu sesión/i)
    expect(containsForm(element)).toBe(false)
  })

  it('shows a permission message and never fetches opciones without director.write/admin.manage', async () => {
    setup({ capabilities: ['talleres_crecimiento.participation.read'] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await CrearTallerAbstractoPage()) as any
    expect(fetchOpcionesMock).not.toHaveBeenCalled()
    expect(extractText(element)).toMatch(/no tenés permiso/i)
    expect(containsForm(element)).toBe(false)
  })

  it('fetches opciones and renders the form with director.write', async () => {
    setup({ capabilities: ['talleres_crecimiento.director.write'] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await CrearTallerAbstractoPage()) as any
    expect(fetchOpcionesMock).toHaveBeenCalledTimes(1)
    expect(containsForm(element)).toBe(true)
  })

  it('fetches opciones and renders the form with admin.manage', async () => {
    setup({ capabilities: ['talleres_crecimiento.admin.manage'] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await CrearTallerAbstractoPage()) as any
    expect(fetchOpcionesMock).toHaveBeenCalledTimes(1)
    expect(containsForm(element)).toBe(true)
  })
})
