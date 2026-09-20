/**
 * @jest-environment node
 *
 * T8 (odd/tasks/talleres-consolidar-pantallas.md) — /talleres/temporadas/
 * [id], replacing app/(auth)/admin/talleres/temporadas/[id]/page.tsx (kept
 * alive, unmodified, until T10 deletes it).
 *
 * Mirrors the gate + dynamic-params pattern of
 * __tests__/app/(auth)/talleres/[taller]/page.test.tsx: flag -> user ->
 * session, each an informational card, then notFound() when the id does
 * not resolve to any temporada.
 *
 * TemporadaDetailClient is a real client component with its own hooks —
 * mocked to a marker component here, exactly like OpenEdicionForm/
 * AssignServicioForm in the [taller] page test — so this RSC-only test
 * inspects the unexecuted element's `.props` instead of rendering it.
 *
 * PERMISSIONS: `canWrite` is the same flat capability check as the list
 * page and actions.ts — see actions.ts's header for the evidence.
 */

import TemporadaDetallePage from '@/app/(auth)/talleres/temporadas/[id]/page'
import { TemporadaDetailClient } from '@/app/(auth)/talleres/temporadas/[id]/temporada-detail-client'
import { ContenedorDashboard, BadgeSistema } from '@/components/ui/sistema-diseno'
import type { TemporadaDetalle } from '@/lib/platform/talleres/temporadas'

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
  loadTemporadaDetalle: jest.fn(),
}))

jest.mock('@/app/(auth)/talleres/temporadas/[id]/temporada-detail-client', () => ({
  TemporadaDetailClient: () => null,
}))

const flagsMock = jest.requireMock('@/lib/platform/talleres/flags').isTalleresEnabled as jest.Mock
const createSupabaseServerClientMock = jest.requireMock('@/lib/supabase/server')
  .createSupabaseServerClient as jest.Mock
const resolveSessionMock = jest.requireMock('@/lib/auth/platformSessionReadOnly')
  .resolveReadOnlyPlatformSession as jest.Mock
const loadTemporadaDetalleMock = jest.requireMock('@/lib/platform/talleres/temporadas')
  .loadTemporadaDetalle as jest.Mock

const DETALLE: TemporadaDetalle = {
  temporada: {
    id: 'temp-1',
    nombre: 'Temporada Otoño 2026',
    slug: 'otono-2026',
    descripcion: 'Talleres de otoño',
    estado: 'borrador',
    fecha_apertura: '2026-09-01T00:00:00.000Z',
    fecha_cierre: '2026-12-15T00:00:00.000Z',
  },
  talleres: [{ id: 't-1', nombre: 'Matrimonio', slug: 'matrimonio' }],
  selectedTallerIds: ['t-1'],
}

interface SetupOpts {
  isEnabled?: boolean
  user?: { id: string } | null
  hasSession?: boolean
  capabilities?: string[]
  detalle?: TemporadaDetalle | null
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

  loadTemporadaDetalleMock.mockReset().mockResolvedValue(
    opts.detalle === undefined ? DETALLE : opts.detalle,
  )
}

function params(id = 'temp-1') {
  return { params: Promise.resolve({ id }) }
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

describe('TemporadaDetallePage — gate', () => {
  it('shows the disabled message and resolves nothing when the flag is off', async () => {
    setup({ isEnabled: false })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TemporadaDetallePage(params())) as any
    expect(extractText(element)).toMatch(/deshabilitado/i)
    expect(loadTemporadaDetalleMock).not.toHaveBeenCalled()
  })

  it('asks to log in and resolves nothing when there is no user', async () => {
    setup({ user: null })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TemporadaDetallePage(params())) as any
    expect(extractText(element)).toMatch(/iniciar sesión/i)
    expect(loadTemporadaDetalleMock).not.toHaveBeenCalled()
  })

  it('shows a session-resolution message when the session cannot be resolved', async () => {
    setup({ hasSession: false })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TemporadaDetallePage(params())) as any
    expect(extractText(element)).toMatch(/no se pudo resolver tu sesión/i)
    expect(loadTemporadaDetalleMock).not.toHaveBeenCalled()
  })

  it('calls notFound() when the id does not resolve to any temporada', async () => {
    setup({ detalle: null })
    await expect(TemporadaDetallePage(params('no-existe'))).rejects.toThrow(
      /NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/,
    )
  })
})

describe('TemporadaDetallePage — canWrite wiring (flat capability check)', () => {
  it('passes canWrite=false to TemporadaDetailClient without a write capability', async () => {
    setup({ capabilities: ['talleres_crecimiento.director.read'] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TemporadaDetallePage(params())) as any
    const client = findByType(element, TemporadaDetailClient)
    expect(client?.props.canWrite).toBe(false)
  })

  it('passes canWrite=true with director.write', async () => {
    setup({ capabilities: ['talleres_crecimiento.director.write'] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TemporadaDetallePage(params())) as any
    const client = findByType(element, TemporadaDetailClient)
    expect(client?.props.canWrite).toBe(true)
  })

  it('passes canWrite=true with admin.manage', async () => {
    setup({ capabilities: ['talleres_crecimiento.admin.manage'] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TemporadaDetallePage(params())) as any
    const client = findByType(element, TemporadaDetailClient)
    expect(client?.props.canWrite).toBe(true)
  })

  it('forwards talleres and selectedTallerIds unchanged', async () => {
    setup({})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TemporadaDetallePage(params())) as any
    const client = findByType(element, TemporadaDetailClient)
    expect(client?.props.talleres).toEqual(DETALLE.talleres)
    expect(client?.props.selectedTallerIds).toEqual(DETALLE.selectedTallerIds)
    expect(client?.props.temporadaId).toBe('temp-1')
    expect(client?.props.estado).toBe('borrador')
  })
})

describe('TemporadaDetallePage — content', () => {
  it('titles the page with the temporada name and links back to /talleres/temporadas', async () => {
    setup({})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TemporadaDetallePage(params())) as any
    const dashboard = findByType(element, ContenedorDashboard)
    expect(dashboard?.props.titulo).toBe('Temporada Otoño 2026')
    expect((dashboard?.props.botonRegreso as { href?: string })?.href).toBe('/talleres/temporadas')
  })

  it('never renders a raw estado key — always through temporadaEstadoLabel', async () => {
    setup({})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TemporadaDetallePage(params())) as any
    const badges = findAllByType(element, BadgeSistema)
    expect(badges.some((b) => /borrador/i.test(extractText(b.props.children)))).toBe(true)
  })
})
