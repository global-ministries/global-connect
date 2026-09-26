/**
 * @jest-environment jsdom
 *
 * PR F (restructure §7) — Grupos admin section (client island).
 *
 * T4 (odd/tasks/talleres-configuracion-del-taller.md) — STEP 1: the grupos
 * are already INSTANCIADOS (from open_edicion), so this component now
 * receives them as a prop (loaded server-side by the page,
 * lib/platform/talleres/grupo-detalle.ts's loadGruposInstanciados) with
 * their facilitadores, instead of fetching the list itself via
 * GET /api/talleres/grupos. "Asignar {rol}" still uses the free
 * SelectLeaderModal for this step — the bounded picker replaces it in the
 * next work unit.
 */

import { fireEvent, render, screen } from '@testing-library/react'

let capturedSearchEndpoint: string | undefined

jest.mock('@/components/modals/SelectLeaderModal', () => ({
  __esModule: true,
  default: ({
    open,
    onSelect,
    onClose,
    searchEndpoint,
  }: {
    open: boolean
    onSelect: (u: { id: string; nombre: string; apellido: string }) => void
    onClose: () => void
    searchEndpoint?: string
  }) => {
    capturedSearchEndpoint = searchEndpoint
    return open ? (
      <button
        type="button"
        onClick={() => {
          onSelect({ id: 'usuario-9', nombre: 'Juan', apellido: 'Pérez' })
          onClose()
        }}
      >
        stub-pick-persona
      </button>
    ) : null
  },
}))

const refreshMock = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}))

import { GruposSection } from '@/components/talleres/grupos-section'

const GRUPOS = [
  {
    id: 'g-1',
    nombre: 'Grupo Alfa',
    capacidad: 12,
    estado: 'activo',
    ocupacion: 5,
    facilitadores: [{ id: 'a-1', personaId: 'p-1', rol: 'lider', nombre: 'Ana', apellido: 'Gómez' }],
  },
]

function baseProps(overrides: Partial<Parameters<typeof GruposSection>[0]> = {}) {
  return {
    tallerSlug: 'matrimonio-sobre-la-roca',
    edicionId: 'e-1',
    cohorteId: 'c-1',
    grupos: GRUPOS,
    puedeEditar: true,
    ...overrides,
  }
}

interface FetchCall {
  url: string
  init?: RequestInit
}
const fetchCalls: FetchCall[] = []

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response
}

beforeEach(() => {
  capturedSearchEndpoint = undefined
  refreshMock.mockReset()
  fetchCalls.length = 0
  ;(global as unknown as { fetch: jest.Mock }).fetch = jest.fn((url: string, init?: RequestInit) => {
    fetchCalls.push({ url, init })
    const method = (init?.method ?? 'GET').toUpperCase()
    if (url === '/api/talleres/grupos' && method === 'POST') {
      const payload = JSON.parse(init!.body as string) as Record<string, unknown>
      return Promise.resolve(
        jsonResponse({ grupo: { id: 'g-new', estado: 'activo', ...payload }, sesiones: { total: 8 } }, 201),
      )
    }
    if (/\/api\/talleres\/grupos\/[^/]+\/asignaciones$/.test(url) && method === 'POST') {
      const payload = JSON.parse(init!.body as string) as Record<string, unknown>
      return Promise.resolve(jsonResponse({ id: 'asig-1', grupo_id: 'g-1', ...payload }, 201))
    }
    return Promise.resolve(jsonResponse({ error: 'unexpected' }, 500))
  })
})

describe('GruposSection — list (T4, from prop)', () => {
  it('lists grupos with nombre, capacidad and facilitadores (nombre apellido · rol)', () => {
    render(<GruposSection {...baseProps()} />)
    expect(screen.getByText('Grupo Alfa')).toBeInTheDocument()
    expect(screen.getByText(/Capacidad 12/)).toBeInTheDocument()
    expect(screen.getByText(/Ana Gómez.*Líder/)).toBeInTheDocument()
  })

  it('links each grupo row to /talleres/[taller]/[edicion]/[grupo]', () => {
    render(<GruposSection {...baseProps()} />)
    const link = screen.getByRole('link', { name: /Grupo Alfa/i })
    expect(link).toHaveAttribute('href', '/talleres/matrimonio-sobre-la-roca/e-1/g-1')
  })

  it('shows ocupación as n / capacidad', () => {
    render(<GruposSection {...baseProps()} />)
    expect(screen.getByText(/5 \/ 12/)).toBeInTheDocument()
  })

  it('renders an empty state when the edición has no grupos', () => {
    render(<GruposSection {...baseProps({ grupos: [] })} />)
    expect(screen.getByText(/todavía no tiene grupos/i)).toBeInTheDocument()
  })
})

describe('GruposSection — read-only viewer', () => {
  it('shows the data but no crear-grupo or asignar controls', () => {
    render(<GruposSection {...baseProps({ puedeEditar: false })} />)
    expect(screen.getByText('Grupo Alfa')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /crear grupo/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /asignar/i })).not.toBeInTheDocument()
  })
})

describe('GruposSection — create grupo (PR F)', () => {
  it('POSTs the grupo and surfaces the generated-session count', async () => {
    render(<GruposSection {...baseProps()} />)
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Grupo Beta' } })
    fireEvent.change(screen.getByLabelText('Capacidad'), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: /crear grupo/i }))

    expect(await screen.findByText(/8 sesiones/i)).toBeInTheDocument()
    const post = fetchCalls.find(
      (c) => c.url === '/api/talleres/grupos' && (c.init?.method ?? '').toUpperCase() === 'POST',
    )
    expect(post).toBeDefined()
    expect(JSON.parse(post!.init!.body as string)).toMatchObject({
      cohorte_id: 'c-1',
      nombre: 'Grupo Beta',
      capacidad: 10,
    })
  })
})

describe('GruposSection — assign persona (PR F, temporary free picker)', () => {
  it('points the picker at talleres own people search, not /api/lideres/buscar', async () => {
    render(<GruposSection {...baseProps()} />)
    fireEvent.click(screen.getByRole('button', { name: /asignar/i }))
    expect(capturedSearchEndpoint).toBe('/api/talleres/admin/usuarios/buscar')
  })

  it('assigns the picked usuario with the selected rol via the asignaciones route', async () => {
    render(<GruposSection {...baseProps()} />)
    fireEvent.click(screen.getByRole('button', { name: /asignar/i }))
    fireEvent.click(await screen.findByText('stub-pick-persona'))

    expect(await screen.findByText(/asignaci[oó]n creada/i)).toBeInTheDocument()
    const post = fetchCalls.find(
      (c) => /\/asignaciones$/.test(c.url) && (c.init?.method ?? '').toUpperCase() === 'POST',
    )
    expect(post).toBeDefined()
    expect(post!.url).toBe('/api/talleres/grupos/g-1/asignaciones')
    expect(JSON.parse(post!.init!.body as string)).toMatchObject({ persona_id: 'usuario-9', rol: 'lider' })
  })
})
