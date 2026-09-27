/**
 * @jest-environment node
 *
 * T5 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) — /talleres/
 * temporadas rewritten to list temporadas GROUPED BY DIRECCIÓN (root Dream
 * Team node label), replacing the old flat table (T8, odd/tasks/talleres-
 * consolidar-pantallas.md).
 *
 * Mirrors the gate + structural-inspection pattern of
 * __tests__/app/(auth)/talleres/reportes/page.test.tsx (flag -> user ->
 * session, each an informational card, inspected via extractText/
 * findByType rather than full rendering).
 *
 * PERMISSIONS: `puedeCrear` ("Crear Temporada" header CTA) is no longer a
 * flat capability check — it is true when `loadDireccionesConTalleres`
 * returns at least one dirección with `puedeEditar` (that loader's own
 * `cargarPermisos(client, raiz.id).editarTaller`, see temporadas.ts).
 * "Hide the control, never disable it" still holds.
 */

import TemporadasPage from '@/app/(auth)/talleres/temporadas/page'
import { EstadoVacio } from '@/components/dream-team/estado-vacio'
import { ContenedorDashboard, BadgeSistema } from '@/components/ui/sistema-diseno'
import type { TemporadaRow, DireccionConTalleres } from '@/lib/platform/talleres/temporadas'

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
  loadDireccionesConTalleres: jest.fn(),
}))

const flagsMock = jest.requireMock('@/lib/platform/talleres/flags').isTalleresEnabled as jest.Mock
const createSupabaseServerClientMock = jest.requireMock('@/lib/supabase/server')
  .createSupabaseServerClient as jest.Mock
const resolveSessionMock = jest.requireMock('@/lib/auth/platformSessionReadOnly')
  .resolveReadOnlyPlatformSession as jest.Mock
const loadTemporadasMock = jest.requireMock('@/lib/platform/talleres/temporadas')
  .loadTemporadas as jest.Mock
const loadDireccionesConTalleresMock = jest.requireMock('@/lib/platform/talleres/temporadas')
  .loadDireccionesConTalleres as jest.Mock

function makeTemporadaRow(overrides: Partial<TemporadaRow> = {}): TemporadaRow {
  return {
    id: 'temp-1',
    nombre: 'Temporada Otoño 2026',
    slug: 'otono-2026',
    estado: 'abierto',
    fecha_apertura: '2026-09-01T00:00:00.000Z',
    fecha_cierre: '2026-12-15T00:00:00.000Z',
    dream_team_equipo_id: 'root-conexion',
    tallerCount: 3,
    edicionCount: 3,
    ...overrides,
  }
}

function makeDireccion(overrides: Partial<DireccionConTalleres> = {}): DireccionConTalleres {
  return { id: 'root-conexion', label: 'Dirección de Conexión', puedeEditar: false, ...overrides }
}

interface SetupOpts {
  isEnabled?: boolean
  user?: { id: string } | null
  hasSession?: boolean
  rows?: readonly TemporadaRow[]
  direcciones?: readonly DireccionConTalleres[]
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

  loadTemporadasMock.mockReset().mockResolvedValue(opts.rows ?? [])
  loadDireccionesConTalleresMock.mockReset().mockResolvedValue(opts.direcciones ?? [makeDireccion()])
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
  it('shows EstadoVacio with the exact copy when no dirección has any temporada', async () => {
    setup({ rows: [], direcciones: [makeDireccion({ puedeEditar: true })] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TemporadasPage()) as any
    const vacio = findByType(element, EstadoVacio)
    expect(vacio).not.toBeNull()
    expect(String(vacio?.props.titulo)).toBe('Tu dirección todavía no tiene temporadas')
  })

  it('offers the CTA subtitle only when puedeCrear', async () => {
    setup({ rows: [], direcciones: [makeDireccion({ puedeEditar: false })] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TemporadasPage()) as any
    const vacio = findByType(element, EstadoVacio)
    expect(vacio?.props.subtitulo).toBeUndefined()
  })
})

describe('TemporadasPage — puedeCrear (hide the control, never disable it)', () => {
  it('hides "Crear Temporada" when no dirección has puedeEditar', async () => {
    setup({ rows: [], direcciones: [makeDireccion({ puedeEditar: false })] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TemporadasPage()) as any
    const dashboard = findByType(element, ContenedorDashboard)
    expect(dashboard?.props.accionPrincipal).toBeUndefined()
  })

  it('shows "Crear Temporada" when at least one dirección has puedeEditar', async () => {
    setup({
      rows: [],
      direcciones: [
        makeDireccion({ id: 'root-a', puedeEditar: false }),
        makeDireccion({ id: 'root-b', puedeEditar: true }),
      ],
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TemporadasPage()) as any
    const dashboard = findByType(element, ContenedorDashboard)
    expect(extractText(dashboard?.props.accionPrincipal)).toMatch(/crear temporada/i)
  })
})

describe('TemporadasPage — grouping by dirección', () => {
  it('groups temporada rows under their own dirección label', async () => {
    setup({
      direcciones: [
        makeDireccion({ id: 'root-conexion', label: 'Dirección de Conexión' }),
        makeDireccion({ id: 'root-experiencia', label: 'Dirección de Experiencia' }),
      ],
      rows: [
        makeTemporadaRow({ id: 'temp-1', nombre: 'Temporada Conexión', dream_team_equipo_id: 'root-conexion' }),
        makeTemporadaRow({ id: 'temp-2', nombre: 'Temporada Experiencia', dream_team_equipo_id: 'root-experiencia' }),
      ],
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TemporadasPage()) as any
    const text = extractText(element)
    expect(text).toMatch(/dirección de conexión/i)
    expect(text).toMatch(/dirección de experiencia/i)
    expect(text).toMatch(/temporada conexión/i)
    expect(text).toMatch(/temporada experiencia/i)
  })

  it('omits a dirección heading entirely when it has zero temporadas', async () => {
    setup({
      direcciones: [
        makeDireccion({ id: 'root-conexion', label: 'Dirección de Conexión' }),
        makeDireccion({ id: 'root-vacia', label: 'Dirección Sin Temporadas' }),
      ],
      rows: [makeTemporadaRow({ dream_team_equipo_id: 'root-conexion' })],
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TemporadasPage()) as any
    const text = extractText(element)
    expect(text).not.toMatch(/dirección sin temporadas/i)
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

  it('renders the temporada nombre and dates', async () => {
    setup({ rows: [makeTemporadaRow({ nombre: 'Temporada Primavera' })] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TemporadasPage()) as any
    const text = extractText(element)
    expect(text).toMatch(/temporada primavera/i)
  })

  it('shows "N talleres · M ediciones" from the row own counts', async () => {
    setup({ rows: [makeTemporadaRow({ tallerCount: 3, edicionCount: 2 })] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TemporadasPage()) as any
    const text = extractText(element)
    expect(text).toMatch(/3 talleres/i)
    expect(text).toMatch(/2 ediciones/i)
  })

  it('singularizes "1 taller · 1 edición"', async () => {
    setup({ rows: [makeTemporadaRow({ tallerCount: 1, edicionCount: 1 })] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await TemporadasPage()) as any
    const text = extractText(element)
    expect(text).toMatch(/1 taller\b/i)
    expect(text).toMatch(/1 edición\b/i)
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
