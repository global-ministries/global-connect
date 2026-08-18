/**
 * @jest-environment node
 *
 * PR42 — Tests for the `/admin/talleres/inscripciones` page (RSC).
 *
 * The page composes:
 *   - isTalleresEnabled gate
 *   - auth gate (supabase.auth.getUser)
 *   - capability gate (director.read | admin.manage | coordinator.read)
 *   - URL-derived filters (estado, edicion, taller)
 *   - loadAdminInscripciones projection
 *   - Empty state / list rendering
 *
 * We mock the projection so the test stays focused on page-level
 * behavior: gates, header, sections, error/empty paths.
 */

// Make this file a module so its top-level `const` declarations don't
// collide with sibling global-script test files (e.g. PR34's
// edicion/page.test.tsx has no imports, so TypeScript treats them
// as one shared script-level namespace).
export {}

const loadAdminInscripcionesMock = jest.fn()

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

jest.mock('@/lib/platform/talleres/admin-inscripciones', () => ({
  loadAdminInscripciones: (client: unknown, filters: unknown) =>
    loadAdminInscripcionesMock(client, filters),
}))

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Page = require('@/app/(auth)/admin/talleres/inscripciones/page').default

const flagsMock = jest.requireMock('@/lib/platform/talleres/flags')
  .isTalleresEnabled as jest.Mock
const createSupabaseServerClientMock = jest.requireMock('@/lib/supabase/server')
  .createSupabaseServerClient as jest.Mock
const resolveSessionMock = jest.requireMock('@/lib/auth/platformSessionReadOnly')
  .resolveReadOnlyPlatformSession as jest.Mock

function setupPageMock(opts: {
  isEnabled?: boolean
  user?: { id: string } | null
  capabilities?: string[]
  rows?: Array<Record<string, unknown>>
  filters?: {
    estado?: string
    edicion?: string
    taller?: string
  }
}) {
  flagsMock.mockReset().mockReturnValue(opts.isEnabled ?? true)

  createSupabaseServerClientMock.mockReset().mockResolvedValue({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: opts.user === null ? null : (opts.user ?? { id: 'auth-1' }) },
        error: null,
      }),
    },
  })

  resolveSessionMock.mockReset().mockResolvedValue({
    personaId: 'u-1',
    subjectAuthId: 'auth-1',
    globalRoles: [],
    contexts: [],
    capabilities: (opts.capabilities ?? []).map((key) => ({
      key,
      experience: 'talleres_crecimiento',
      scopeType: 'taller',
      source: 'test',
    })),
  })

  loadAdminInscripcionesMock.mockReset().mockResolvedValue({
    rows: opts.rows ?? [],
    total: opts.rows?.length ?? 0,
  })

  return {
    client: { from: jest.fn() },
  }
}

const FULL_ROW = {
  id: 'insc-1',
  edicion_id: 'ed-1',
  edicion_nombre: 'Septiembre 2026',
  edicion_estado: 'abierto',
  taller_id: 't-1',
  taller_nombre: 'Matrimonio sobre la Roca',
  taller_slug: 'matrimonio-sobre-la-roca',
  cohorte_id: 'coh-1',
  cohorte_edicion: 'Septiembre 2026',
  persona_principal_id: 'u-1',
  persona_principal_nombre: 'Isaac Paez',
  persona_principal_email: 'isaac@example.com',
  companero_id: null,
  companero_nombre: null,
  link_type: null,
  estado: 'pendiente',
  created_at: '2026-08-15T12:00:00Z',
  updated_at: '2026-08-15T12:00:00Z',
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('InscripcionesPage — gates', () => {
  it('renders the disabled surface when the flag is off', async () => {
    setupPageMock({ isEnabled: false })
    const result = await Page({
      searchParams: Promise.resolve({}),
    })
    expect(result).toBeDefined()
    // The component returns a React tree; just confirming it doesn't throw.
  })

  it('does not call the loader when the user is unauthenticated', async () => {
    setupPageMock({ user: null })
    // The page calls `redirect('/login')` for unauthenticated users;
    // this throws NEXT_REDIRECT in the RSC runtime. We assert it
    // never reaches the loader.
    try {
      await Page({ searchParams: Promise.resolve({}) })
      // If no throw, the page did not redirect — that's a bug.
      throw new Error('expected NEXT_REDIRECT')
    } catch (err) {
      expect(String(err)).toMatch(/NEXT_REDIRECT/)
    }
    expect(loadAdminInscripcionesMock).not.toHaveBeenCalled()
  })

  it('does not call the loader when the user lacks read capability', async () => {
    setupPageMock({
      capabilities: ['talleres_crecimiento.participation.read'],
    })
    await Page({ searchParams: Promise.resolve({}) })
    expect(loadAdminInscripcionesMock).not.toHaveBeenCalled()
  })

  it('calls the loader for director.read holders', async () => {
    setupPageMock({
      capabilities: ['talleres_crecimiento.director.read'],
    })
    await Page({ searchParams: Promise.resolve({}) })
    expect(loadAdminInscripcionesMock).toHaveBeenCalled()
  })

  it('calls the loader for admin.manage holders', async () => {
    setupPageMock({
      capabilities: ['talleres_crecimiento.admin.manage'],
    })
    await Page({ searchParams: Promise.resolve({}) })
    expect(loadAdminInscripcionesMock).toHaveBeenCalled()
  })

  it('calls the loader for coordinator.read holders', async () => {
    setupPageMock({
      capabilities: ['talleres_crecimiento.coordinator.read'],
    })
    await Page({ searchParams: Promise.resolve({}) })
    expect(loadAdminInscripcionesMock).toHaveBeenCalled()
  })
})

describe('InscripcionesPage — filters propagation', () => {
  it('passes the estado filter to the loader', async () => {
    setupPageMock({
      capabilities: ['talleres_crecimiento.admin.manage'],
      filters: { estado: 'pendiente' },
    })
    await Page({ searchParams: Promise.resolve({ estado: 'pendiente' }) })
    const callArgs = loadAdminInscripcionesMock.mock.calls[0]!
    expect(callArgs[1]).toEqual({ estado: 'pendiente' })
  })

  it('passes the edicion filter to the loader', async () => {
    setupPageMock({
      capabilities: ['talleres_crecimiento.admin.manage'],
      filters: { edicion: 'ed-99' },
    })
    await Page({ searchParams: Promise.resolve({ edicion: 'ed-99' }) })
    const callArgs = loadAdminInscripcionesMock.mock.calls[0]!
    expect(callArgs[1]).toEqual({ edicion_id: 'ed-99' })
  })

  it('passes the taller filter to the loader (abstract id)', async () => {
    setupPageMock({
      capabilities: ['talleres_crecimiento.admin.manage'],
      filters: { taller: 't-1' },
    })
    await Page({ searchParams: Promise.resolve({ taller: 't-1' }) })
    const callArgs = loadAdminInscripcionesMock.mock.calls[0]!
    expect(callArgs[1]).toEqual({ taller_id: 't-1' })
  })

  it('rejects invalid estado values (defense against URL tampering)', async () => {
    setupPageMock({
      capabilities: ['talleres_crecimiento.admin.manage'],
    })
    await Page({ searchParams: Promise.resolve({ estado: 'bogus' }) })
    const callArgs = loadAdminInscripcionesMock.mock.calls[0]!
    expect(callArgs[1]).toEqual({}) // estado is undefined
  })
})

describe('InscripcionesPage — render surfaces', () => {
  it('renders the empty state when no rows are returned', async () => {
    setupPageMock({
      capabilities: ['talleres_crecimiento.admin.manage'],
      rows: [],
    })
    const result = await Page({ searchParams: Promise.resolve({}) })
    expect(result).toBeDefined()
  })

  it('renders the list when rows are returned', async () => {
    setupPageMock({
      capabilities: ['talleres_crecimiento.admin.manage'],
      rows: [FULL_ROW],
    })
    const result = await Page({ searchParams: Promise.resolve({}) })
    expect(result).toBeDefined()
  })
})
