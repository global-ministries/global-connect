/**
 * @jest-environment jsdom
 *
 * PR F (restructure §7) — Grupos admin section (client island).
 *
 * The section lives inside the edición detail page. Given a cohorte id it:
 *   - lists the cohorte's grupos       (GET  /api/talleres/grupos?cohorte_id=)
 *   - creates a grupo                  (POST /api/talleres/grupos → { grupo, sesiones })
 *     and surfaces how many weekly sessions generate_taller_sesiones made
 *   - assigns a líder/voluntario       (POST /api/talleres/grupos/[id]/asignaciones)
 *     through the shared SelectLeaderModal persona picker
 *
 * We stub SelectLeaderModal (so the assign flow never touches
 * /api/lideres/buscar) and mock global.fetch, mirroring the harness in
 * app/(auth)/talleres/explorar/explorar-client.test.tsx.
 */

import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'

// Stub the shared picker: when open, expose a single button that selects a
// known usuario. This lets us drive the assign flow deterministically.
jest.mock('@/components/modals/SelectLeaderModal', () => ({
  __esModule: true,
  default: ({
    open,
    onSelect,
    onClose,
  }: {
    open: boolean
    onSelect: (u: { id: string; nombre: string; apellido: string }) => void
    onClose: () => void
  }) =>
    open ? (
      <button
        type="button"
        onClick={() => {
          onSelect({ id: 'usuario-9', nombre: 'Juan', apellido: 'Pérez' })
          onClose()
        }}
      >
        stub-pick-persona
      </button>
    ) : null,
}))

import { GruposSection } from '@/app/(auth)/admin/talleres/edicion/[id]/grupos-section'

interface GrupoRow {
  id: string
  cohorte_id: string
  nombre: string
  capacidad: number
  estado: string
  completed_at?: string | null
}

interface AsignacionRow {
  id: string
  grupo_id: string
  persona_id: string
  rol: string
  activo: boolean
  started_at?: string
}

interface FetchCall {
  url: string
  init?: RequestInit
}

const state: {
  grupos: GrupoRow[]
  asignaciones: Record<string, AsignacionRow[]>
} = { grupos: [], asignaciones: {} }
const fetchCalls: FetchCall[] = []

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response
}

beforeEach(() => {
  state.grupos = []
  state.asignaciones = {}
  fetchCalls.length = 0

  ;(global as unknown as { fetch: jest.Mock }).fetch = jest.fn(
    (url: string, init?: RequestInit) => {
      fetchCalls.push({ url, init })
      const method = (init?.method ?? 'GET').toUpperCase()

      if (url.startsWith('/api/talleres/grupos?') && method === 'GET') {
        return Promise.resolve(
          jsonResponse({ grupos: state.grupos, count: state.grupos.length }),
        )
      }
      if (url === '/api/talleres/grupos' && method === 'POST') {
        const payload = JSON.parse(init!.body as string) as Record<string, unknown>
        return Promise.resolve(
          jsonResponse(
            {
              grupo: { id: 'g-new', estado: 'activo', ...payload },
              sesiones: { ok: true, grupo_id: 'g-new', total: 8, created: 8 },
            },
            201,
          ),
        )
      }
      // List a grupo's active asignaciones (Slice 4a).
      const listMatch = /\/api\/talleres\/grupos\/([^/]+)\/asignaciones$/.exec(url)
      if (listMatch && method === 'GET') {
        const rows = state.asignaciones[listMatch[1]] ?? []
        return Promise.resolve(jsonResponse({ asignaciones: rows, count: rows.length }))
      }
      if (/\/api\/talleres\/grupos\/[^/]+\/asignaciones$/.test(url) && method === 'POST') {
        const payload = JSON.parse(init!.body as string) as Record<string, unknown>
        return Promise.resolve(
          jsonResponse({ id: 'asig-1', grupo_id: 'g-1', ...payload }, 201),
        )
      }
      // Soft-remove a líder (Slice 4b).
      if (/\/api\/talleres\/grupos\/[^/]+\/asignaciones\/[^/]+$/.test(url) && method === 'DELETE') {
        const payload = init?.body
          ? (JSON.parse(init.body as string) as Record<string, unknown>)
          : {}
        return Promise.resolve(
          jsonResponse({ asignacion: { id: 'asig-1', activo: false, ...payload } }),
        )
      }
      // Edit a grupo (Slice 2).
      if (/\/api\/talleres\/grupos\/[^/]+$/.test(url) && method === 'PATCH') {
        const payload = JSON.parse(init!.body as string) as Record<string, unknown>
        return Promise.resolve(
          jsonResponse({ grupo: { id: 'g-1', cohorte_id: 'c-1', estado: 'activo', ...payload } }),
        )
      }
      // Soft-cancel a grupo (Slice 3).
      if (/\/api\/talleres\/grupos\/[^/]+$/.test(url) && method === 'DELETE') {
        return Promise.resolve(
          jsonResponse({ grupo: { id: 'g-1', cohorte_id: 'c-1', estado: 'cancelado' } }),
        )
      }
      return Promise.resolve(jsonResponse({ error: 'unexpected' }, 500))
    },
  )
})

describe('GruposSection — list (PR F)', () => {
  it('fetches grupos for the cohorte on mount and lists them', async () => {
    state.grupos = [
      { id: 'g-1', cohorte_id: 'c-1', nombre: 'Grupo Alfa', capacidad: 12, estado: 'activo' },
    ]
    render(<GruposSection cohorteId="c-1" />)

    expect(await screen.findByText('Grupo Alfa')).toBeInTheDocument()
    expect(fetchCalls[0]?.url).toContain('/api/talleres/grupos?cohorte_id=c-1')
  })

  it('renders an empty state when the cohorte has no grupos', async () => {
    state.grupos = []
    render(<GruposSection cohorteId="c-1" />)

    expect(await screen.findByText(/todavía no tiene grupos/i)).toBeInTheDocument()
  })
})

describe('GruposSection — create grupo (PR F)', () => {
  it('POSTs the grupo and surfaces the generated-session count', async () => {
    state.grupos = []
    render(<GruposSection cohorteId="c-1" />)
    await screen.findByText(/todavía no tiene grupos/i)

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

describe('GruposSection — assign persona (PR F)', () => {
  it('assigns the picked usuario with the selected rol via the asignaciones route', async () => {
    state.grupos = [
      { id: 'g-1', cohorte_id: 'c-1', nombre: 'Grupo Alfa', capacidad: 12, estado: 'activo' },
    ]
    render(<GruposSection cohorteId="c-1" />)
    await screen.findByText('Grupo Alfa')

    // Default rol is 'lider'. Open the picker for the grupo…
    fireEvent.click(screen.getByRole('button', { name: /asignar/i }))
    // …the stubbed modal selects usuario-9.
    fireEvent.click(await screen.findByText('stub-pick-persona'))

    expect(await screen.findByText(/asignaci[oó]n creada/i)).toBeInTheDocument()

    const post = fetchCalls.find(
      (c) => /\/asignaciones$/.test(c.url) && (c.init?.method ?? '').toUpperCase() === 'POST',
    )
    expect(post).toBeDefined()
    expect(post!.url).toBe('/api/talleres/grupos/g-1/asignaciones')
    expect(JSON.parse(post!.init!.body as string)).toMatchObject({
      persona_id: 'usuario-9',
      rol: 'lider',
    })
  })
})

describe('GruposSection — edit grupo (Slice 2)', () => {
  it('PATCHes nombre/capacidad and confirms the update', async () => {
    state.grupos = [
      { id: 'g-1', cohorte_id: 'c-1', nombre: 'Grupo Alfa', capacidad: 12, estado: 'activo' },
    ]
    render(<GruposSection cohorteId="c-1" />)
    await screen.findByText('Grupo Alfa')

    fireEvent.click(screen.getByRole('button', { name: /editar/i }))
    fireEvent.change(screen.getByLabelText('Editar nombre'), {
      target: { value: 'Grupo Renombrado' },
    })
    fireEvent.change(screen.getByLabelText('Editar capacidad'), { target: { value: '20' } })
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }))

    expect(await screen.findByText(/grupo actualizado/i)).toBeInTheDocument()

    const patch = fetchCalls.find(
      (c) =>
        /\/api\/talleres\/grupos\/g-1$/.test(c.url) &&
        (c.init?.method ?? '').toUpperCase() === 'PATCH',
    )
    expect(patch).toBeDefined()
    expect(JSON.parse(patch!.init!.body as string)).toMatchObject({
      nombre: 'Grupo Renombrado',
      capacidad: 20,
    })
  })
})

describe('GruposSection — cancel grupo (Slice 3)', () => {
  it('soft-cancels the grupo after confirmation via DELETE', async () => {
    state.grupos = [
      { id: 'g-1', cohorte_id: 'c-1', nombre: 'Grupo Alfa', capacidad: 12, estado: 'activo' },
    ]
    render(<GruposSection cohorteId="c-1" />)
    await screen.findByText('Grupo Alfa')

    fireEvent.click(screen.getByRole('button', { name: /cancelar grupo/i }))
    fireEvent.click(screen.getByRole('button', { name: /s[ií], cancelar/i }))

    expect(await screen.findByText(/grupo cancelado/i)).toBeInTheDocument()

    const del = fetchCalls.find(
      (c) =>
        /\/api\/talleres\/grupos\/g-1$/.test(c.url) &&
        (c.init?.method ?? '').toUpperCase() === 'DELETE',
    )
    expect(del).toBeDefined()
  })
})

describe('GruposSection — list & remove líderes (Slice 4)', () => {
  it("lists a grupo's active asignaciones on mount", async () => {
    state.grupos = [
      { id: 'g-1', cohorte_id: 'c-1', nombre: 'Grupo Alfa', capacidad: 12, estado: 'activo' },
    ]
    state.asignaciones = {
      'g-1': [
        { id: 'a-1', grupo_id: 'g-1', persona_id: 'p-1', rol: 'lider', activo: true },
      ],
    }
    render(<GruposSection cohorteId="c-1" />)

    expect(await screen.findByRole('button', { name: /quitar/i })).toBeInTheDocument()

    const get = fetchCalls.find(
      (c) =>
        /\/api\/talleres\/grupos\/g-1\/asignaciones$/.test(c.url) &&
        (c.init?.method ?? 'GET').toUpperCase() === 'GET',
    )
    expect(get).toBeDefined()
  })

  it('soft-removes a líder with a required motivo via DELETE', async () => {
    state.grupos = [
      { id: 'g-1', cohorte_id: 'c-1', nombre: 'Grupo Alfa', capacidad: 12, estado: 'activo' },
    ]
    state.asignaciones = {
      'g-1': [
        { id: 'a-1', grupo_id: 'g-1', persona_id: 'p-1', rol: 'lider', activo: true },
      ],
    }
    render(<GruposSection cohorteId="c-1" />)

    fireEvent.click(await screen.findByRole('button', { name: /quitar/i }))
    fireEvent.change(screen.getByLabelText(/motivo/i), { target: { value: 'rotación' } })
    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }))

    expect(await screen.findByText(/l[ií]der (quitado|retirado)/i)).toBeInTheDocument()

    const del = fetchCalls.find(
      (c) =>
        /\/asignaciones\/a-1$/.test(c.url) &&
        (c.init?.method ?? '').toUpperCase() === 'DELETE',
    )
    expect(del).toBeDefined()
    expect(JSON.parse(del!.init!.body as string)).toMatchObject({ motivo: 'rotación' })
  })
})
