/**
 * @jest-environment node
 *
 * PR34 — Tests for the /admin/talleres/edicion/[id] page (RSC).
 *
 * The page composes:
 *   - isTalleresEnabled gate
 *   - auth gate (supabase.auth.getUser)
 *   - capability gate (director.write | admin.manage)
 *   - loadEdicionLocalDetalle projection
 *
 * We mock the projection so the test stays focused on page-level
 * behavior: gates, header, sections, error/empty paths.
 */

const loadEdicionMock = jest.fn()

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

jest.mock('@/lib/platform/talleres/operacional', () => ({
  loadEdicionLocalDetalle: (client: unknown, id: string) => loadEdicionMock(client, id),
}))

const flagsMock = jest.requireMock('@/lib/platform/talleres/flags')
  .isTalleresEnabled as jest.Mock
const createSupabaseServerClientMock = jest.requireMock('@/lib/supabase/server')
  .createSupabaseServerClient as jest.Mock
const findPersonaByAuthIdMock = jest.requireMock(
  '@/lib/auth/platformSessionReadOnly',
).findPlatformSessionPersonaByAuthId as jest.Mock
const resolveSessionMock = jest.requireMock(
  '@/lib/auth/platformSessionReadOnly',
).resolveReadOnlyPlatformSession as jest.Mock

function setupPageMock(opts: {
  isEnabled?: boolean
  user?: { id: string } | null
  personaId?: string | null
  capabilities?: string[]
  edicion?: unknown | null
}) {
  flagsMock.mockReset().mockReturnValue(opts.isEnabled ?? true)
  findPersonaByAuthIdMock.mockReset().mockImplementation(() =>
    Promise.resolve(
      opts.personaId
        ? { id: opts.personaId, authId: 'auth-1', globalRoles: [] }
        : null,
    ),
  )
  resolveSessionMock.mockReset().mockResolvedValue(
    opts.personaId
      ? {
          personaId: opts.personaId,
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

  loadEdicionMock.mockReset().mockResolvedValue(
    opts.edicion === undefined ? fullEdicion : opts.edicion,
  )

  createSupabaseServerClientMock.mockReset().mockResolvedValue({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: opts.user === null ? null : (opts.user ?? { id: 'auth-1' }) },
        error: null,
      }),
    },
    from: jest.fn(),
  })
}

const fullEdicion = {
  id: 'e-1',
  taller_id: 't-1',
  taller_nombre: 'Matrimonio sobre la Roca',
  taller_slug: 'matrimonio-sobre-la-roca',
  nombre_snapshot: 'Otoño 2026',
  tipo: 'pareja' as const,
  link_type: 'matrimonio' as const,
  modalidad_inscripcion: 'periodo_general' as const,
  estado: 'abierto' as const,
  sesiones_snapshot: 8,
  duracion_estimada_minutos_snapshot: 90,
  firmantes: [
    { persona_id: 'p-1', rol_etiqueta: 'Director', orden: 1 },
    { persona_id: 'p-2', rol_etiqueta: 'Coordinador', orden: 2 },
  ],
  cohorte: {
    id: 'c-1',
    dream_team_equipo_id: 'eq-1',
    edicion: 'Otoño 2026',
    started_at: '2026-09-01T00:00:00Z',
    ended_at: null,
  },
  periodo_general: {
    id: 'pg-1',
    fecha_apertura_automatica: '2026-08-01T00:00:00Z',
    fecha_cierre_automatica: '2026-11-30T00:00:00Z',
    fecha_apertura_manual: null,
    fecha_cierre_manual: null,
    fecha_cierre_real: null,
    motivo_cierre: null,
  },
  inscripciones_count: 12,
  inscripciones_aprobadas_count: 8,
  certificados_count: 3,
}

beforeEach(() => {
  // Intentionally do NOT reset modules here — the jest.mock() setup
  // at the top of this file binds `createSupabaseServerClient` to a
  // stable jest.fn() that we control. `jest.resetModules()` would
  // wipe the mocked module export, leaving createSupabaseServerClient
  // undefined and the page would crash on `(supabase as any).auth`.
})

async function renderPage(id = 'e-1') {
  const { default: Page } = await import(
    '@/app/(auth)/admin/talleres/edicion/[id]/page'
  )
  const jsx = await Page({ params: Promise.resolve({ id }) })
  const React = await import('react')
  const { renderToStaticMarkup } = await import('react-dom/server')
  return renderToStaticMarkup(React.createElement('div', null, jsx))
}

describe('EdicionLocalDetailPage — kill switch', () => {
  it('renders the disabled-empty state when isTalleresEnabled is false', async () => {
    setupPageMock({ isEnabled: false })
    const html = await renderPage('e-1')
    expect(html).toMatch(/deshabilitado/)
    expect(loadEdicionMock).not.toHaveBeenCalled()
  })
})

describe('EdicionLocalDetailPage — auth gate', () => {
  it('renders the sign-in prompt when there is no user', async () => {
    setupPageMock({ user: null })
    const html = await renderPage('e-1')
    expect(html).toMatch(/iniciar sesión/i)
    expect(loadEdicionMock).not.toHaveBeenCalled()
  })
})

describe('EdicionLocalDetailPage — projection', () => {
  it('renders the edicion snapshot, taller back-link, cohorte, periodo, and counts', async () => {
    setupPageMock({
      personaId: 'p-1',
      capabilities: ['talleres_crecimiento.director.write'],
      edicion: fullEdicion,
    })
    const html = await renderPage('e-1')

    // Header
    expect(html).toContain('Otoño 2026')
    expect(html).toContain('abierto')

    // Información de la edición
    expect(html).toContain('Pareja')
    expect(html).toContain('Matrimonio')
    expect(html).toContain('Periodo general')
    expect(html).toContain('Sesiones (snapshot)')
    expect(html).toContain('Duración estimada (min)')
    // Firmantes — both rows are rendered.
    expect(html).toContain('Director')
    expect(html).toContain('Coordinador')

    // Taller abstracto — back-link target is the taller slug.
    expect(html).toContain('/admin/talleres/abstracto/matrimonio-sobre-la-roca')
    expect(html).toContain('Matrimonio sobre la Roca')

    // Cohorte — the fecha_apertura snapshot is formatted to es locale.
    // 2026-09-01 (UTC midnight) renders as "31/8/2026" in es locale
    // because the UTC date is rendered in local TZ. We assert on
    // structural content only (no exact date string).
    expect(html).toContain('eq-1')

    // Período general — same: assert on labels, not formatted dates.
    expect(html).toContain('Apertura automática')
    expect(html).toContain('Cierre automático')

    // Counts
    expect(html).toContain('Inscripciones (total)')
    expect(html).toContain('Aprobadas / pendientes')
    expect(html).toContain('Certificados emitidos')
  })

  it('renders empty states when cohorte and periodo_general are null', async () => {
    setupPageMock({
      personaId: 'p-1',
      capabilities: ['talleres_crecimiento.director.write'],
      edicion: {
        ...fullEdicion,
        cohorte: null,
        periodo_general: null,
        firmantes: [],
      },
    })
    const html = await renderPage('e-1')

    expect(html).toContain('todavía no tiene cohorte')
    expect(html).toContain('No hay período general asociado')
    expect(html).toContain('Sin firmantes configurados')
  })

  it('renders the not-found path when the projection returns null', async () => {
    setupPageMock({
      personaId: 'p-1',
      capabilities: ['talleres_crecimiento.director.write'],
      edicion: null,
    })

    // Calling notFound() throws NEXT_HTTP_ERROR_FALLBACK;404 in the
    // Next.js test runtime. We assert on that signature.
    const { default: Page } = await import(
      '@/app/(auth)/admin/talleres/edicion/[id]/page'
    )
    await expect(
      Page({ params: Promise.resolve({ id: 'missing' }) }),
    ).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/)
  })
})