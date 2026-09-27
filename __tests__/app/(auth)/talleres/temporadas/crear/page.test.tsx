/**
 * @jest-environment node
 *
 * T8 (odd/tasks/talleres-consolidar-pantallas.md) — /talleres/temporadas/
 * crear, replacing app/(auth)/admin/talleres/temporadas/crear/page.tsx
 * (kept alive, unmodified, until T10 deletes it).
 *
 * T5 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) — the page now
 * loads eligible direcciones (`loadDireccionesConTalleres`, filtered to
 * `puedeEditar`) plus, for each, its own tree's talleres
 * (`loadTalleresDeDireccion`), and hands them to the form instead of a flat
 * capability gate. Zero eligible direcciones shows the same "no permisos"
 * card as before, now with a neutral (no voseo) message.
 *
 * TallerTemporadaForm is a real client component with its own hooks —
 * mocked to a marker component, same pattern as every other RSC-only
 * page test in this family.
 */

import TemporadaCrearPage from '@/app/(auth)/talleres/temporadas/crear/page'
import { TallerTemporadaForm } from '@/app/(auth)/talleres/temporadas/crear/temporada-form'
import { ContenedorDashboard } from '@/components/ui/sistema-diseno'
import type { DireccionConTalleres, TallerParaTemporada } from '@/lib/platform/talleres/temporadas'

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
  loadDireccionesConTalleres: jest.fn(),
  loadTalleresDeDireccion: jest.fn(),
}))

jest.mock('@/app/(auth)/talleres/temporadas/crear/temporada-form', () => ({
  TallerTemporadaForm: () => null,
}))

const flagsMock = jest.requireMock('@/lib/platform/talleres/flags').isTalleresEnabled as jest.Mock
const createSupabaseServerClientMock = jest.requireMock('@/lib/supabase/server')
  .createSupabaseServerClient as jest.Mock
const resolveSessionMock = jest.requireMock('@/lib/auth/platformSessionReadOnly')
  .resolveReadOnlyPlatformSession as jest.Mock
const loadDireccionesConTalleresMock = jest.requireMock('@/lib/platform/talleres/temporadas')
  .loadDireccionesConTalleres as jest.Mock
const loadTalleresDeDireccionMock = jest.requireMock('@/lib/platform/talleres/temporadas')
  .loadTalleresDeDireccion as jest.Mock

function makeDireccion(overrides: Partial<DireccionConTalleres> = {}): DireccionConTalleres {
  return { id: 'root-1', label: 'Dirección de Conexión', puedeEditar: true, ...overrides }
}

interface SetupOpts {
  isEnabled?: boolean
  user?: { id: string } | null
  hasSession?: boolean
  direcciones?: readonly DireccionConTalleres[]
  talleres?: readonly TallerParaTemporada[]
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
          capabilities: [],
        }
      : null,
  )

  loadDireccionesConTalleresMock.mockReset().mockResolvedValue(opts.direcciones ?? [makeDireccion()])
  loadTalleresDeDireccionMock.mockReset().mockResolvedValue(opts.talleres ?? [])
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
  it('shows a neutral (no voseo) "no permisos" card and no form when no dirección has puedeEditar', async () => {
    setup({ direcciones: [makeDireccion({ puedeEditar: false })] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TemporadaCrearPage()) as any
    expect(extractText(element)).toMatch(/no tienes permisos/i)
    expect(extractText(element)).not.toMatch(/tenés/i)
    expect(findByType(element, TallerTemporadaForm)).toBeNull()
  })

  it('renders the form when at least one dirección has puedeEditar', async () => {
    setup({ direcciones: [makeDireccion({ puedeEditar: true })] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TemporadaCrearPage()) as any
    expect(findByType(element, TallerTemporadaForm)).not.toBeNull()
  })

  it('passes only the puedeEditar=true direcciones, each with its own loadTalleresDeDireccion result', async () => {
    setup({
      direcciones: [makeDireccion({ id: 'root-a', puedeEditar: false }), makeDireccion({ id: 'root-b', puedeEditar: true })],
      talleres: [{ id: 't-1', nombre: 'Matrimonio', nodoLabel: 'Dirección de Conexión', regimen: 'temporada' }],
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TemporadaCrearPage()) as any
    const form = findByType(element, TallerTemporadaForm)
    expect(loadTalleresDeDireccionMock).toHaveBeenCalledWith(expect.anything(), 'root-b')
    expect(loadTalleresDeDireccionMock).not.toHaveBeenCalledWith(expect.anything(), 'root-a')
    expect(form?.props.direcciones).toEqual([
      {
        id: 'root-b',
        label: 'Dirección de Conexión',
        talleres: [{ id: 't-1', nombre: 'Matrimonio', nodoLabel: 'Dirección de Conexión', regimen: 'temporada' }],
      },
    ])
  })
})

describe('TemporadaCrearPage — page shell', () => {
  it('titles the page "Crear Temporada"', async () => {
    setup({})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TemporadaCrearPage()) as any
    const dashboard = findByType(element, ContenedorDashboard)
    expect(dashboard?.props.titulo).toBe('Crear Temporada')
  })
})
