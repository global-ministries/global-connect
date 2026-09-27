/**
 * @jest-environment node
 *
 * T8 (odd/tasks/talleres-consolidar-pantallas.md) — /talleres/temporadas/
 * [id], replacing app/(auth)/admin/talleres/temporadas/[id]/page.tsx (kept
 * alive, unmodified, until T10 deletes it).
 *
 * T5 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) — the header
 * shows `direccionLabel` (never the temporada's slug), the page calls
 * `refrescarEstadosEdiciones(client)` UNSCOPED before reading, and forwards
 * `talleresEnTemporada`/`talleresDisponibles` (loadTemporadaDetalle's new
 * shape) to TemporadaDetailClient instead of the old flat
 * talleres/selectedTallerIds. `?creadas=N` shows a success notice.
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

jest.mock('@/lib/platform/talleres/refrescar-estados', () => ({
  refrescarEstadosEdiciones: jest.fn().mockResolvedValue(undefined),
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
const refrescarEstadosEdicionesMock = jest.requireMock('@/lib/platform/talleres/refrescar-estados')
  .refrescarEstadosEdiciones as jest.Mock

const DETALLE: TemporadaDetalle = {
  temporada: {
    id: 'temp-1',
    nombre: 'Temporada Otoño 2026',
    slug: 'otono-2026',
    descripcion: 'Talleres de otoño',
    estado: 'borrador',
    fecha_apertura: '2026-09-01T00:00:00.000Z',
    fecha_cierre: '2026-12-15T00:00:00.000Z',
    dream_team_equipo_id: 'root-1',
  },
  direccionLabel: 'Dirección de Conexión',
  talleresEnTemporada: [
    {
      id: 't-1',
      nombre: 'Matrimonio',
      slug: 'matrimonio',
      edicion: {
        id: 'ed-1',
        nombre_snapshot: 'Otoño 2026',
        estado: 'abierto',
        fecha_inicio: '2026-09-01',
        fecha_fin: '2026-10-15',
        total_inscripciones: 0,
      },
    },
  ],
  talleresDisponibles: [{ id: 't-2', nombre: 'Parejas', slug: 'parejas' }],
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

  refrescarEstadosEdicionesMock.mockReset().mockResolvedValue(undefined)
  loadTemporadaDetalleMock.mockReset().mockResolvedValue(
    opts.detalle === undefined ? DETALLE : opts.detalle,
  )
}

function params(id = 'temp-1', creadas?: string) {
  return { params: Promise.resolve({ id }), searchParams: Promise.resolve({ creadas }) }
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

  it('calls refrescarEstadosEdiciones (unscoped) before loadTemporadaDetalle', async () => {
    setup({})
    await TemporadaDetallePage(params())
    expect(refrescarEstadosEdicionesMock).toHaveBeenCalledWith(expect.anything())
    expect(loadTemporadaDetalleMock).toHaveBeenCalled()
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

  it('forwards talleresEnTemporada and talleresDisponibles unchanged', async () => {
    setup({})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TemporadaDetallePage(params())) as any
    const client = findByType(element, TemporadaDetailClient)
    expect(client?.props.talleresEnTemporada).toEqual(DETALLE.talleresEnTemporada)
    expect(client?.props.talleresDisponibles).toEqual(DETALLE.talleresDisponibles)
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

  it('shows the dirección label in the header, never the raw slug', async () => {
    setup({})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TemporadaDetallePage(params())) as any
    const text = extractText(element)
    expect(text).toMatch(/dirección de conexión/i)
    expect(text).not.toMatch(/otono-2026/)
  })

  it('never renders a raw estado key — always through temporadaEstadoLabel', async () => {
    setup({})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TemporadaDetallePage(params())) as any
    const badges = findAllByType(element, BadgeSistema)
    expect(badges.some((b) => /borrador/i.test(extractText(b.props.children)))).toBe(true)
  })

  it('shows a "Se crearon N ediciones" notice when ?creadas=N is present', async () => {
    setup({})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TemporadaDetallePage(params('temp-1', '3'))) as any
    expect(extractText(element)).toMatch(/se crearon 3 ediciones/i)
  })

  it('shows no notice when ?creadas is absent', async () => {
    setup({})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TemporadaDetallePage(params())) as any
    expect(extractText(element)).not.toMatch(/se crearon/i)
  })
})
