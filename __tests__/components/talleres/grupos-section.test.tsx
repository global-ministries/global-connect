/**
 * @jest-environment jsdom
 *
 * T4 (odd/tasks/talleres-configuracion-del-taller.md) — the edición
 * screen's "Grupos" section: the grupos are already INSTANCIADOS (from
 * open_edicion), so this component now receives them as a prop (loaded
 * server-side by the page, lib/platform/talleres/grupo-detalle.ts's
 * loadGruposInstanciados) instead of fetching them itself. Facilitadores
 * are added/removed through the SAME bounded picker T3 built for the
 * plantilla (components/talleres/facilitador-picker.tsx) — never
 * SelectLeaderModal/talleres_buscar_personas. "Crear grupo" is the
 * explicit exception that keeps the old POST /api/talleres/grupos fetch
 * flow (generate_taller_sesiones), now moved below the list.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const editarGrupoInstanciadoMock = jest.fn()
const agregarFacilitadorGrupoMock = jest.fn()
const quitarFacilitadorGrupoMock = jest.fn()
const refreshMock = jest.fn()

jest.mock('@/app/(auth)/talleres/[taller]/[edicion]/actions', () => ({
  editarGrupoInstanciado: (...args: unknown[]) => editarGrupoInstanciadoMock(...args),
  agregarFacilitadorGrupo: (...args: unknown[]) => agregarFacilitadorGrupoMock(...args),
  quitarFacilitadorGrupo: (...args: unknown[]) => quitarFacilitadorGrupoMock(...args),
}))

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
  {
    id: 'g-2',
    nombre: 'Grupo Beta',
    capacidad: 10,
    estado: 'activo',
    ocupacion: 0,
    facilitadores: [],
  },
]

const SERVIDORES = [
  { personaId: 'p-1', nombre: 'Ana', apellido: 'Gómez' },
  { personaId: 'p-2', nombre: 'Carlos', apellido: 'Ruiz' },
]

function baseProps(overrides: Partial<Parameters<typeof GruposSection>[0]> = {}) {
  return {
    tallerSlug: 'matrimonio-sobre-la-roca',
    edicionId: 'e-1',
    cohorteId: 'c-1',
    grupos: GRUPOS,
    servidores: SERVIDORES,
    puedeEditar: false,
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
  editarGrupoInstanciadoMock.mockReset()
  agregarFacilitadorGrupoMock.mockReset()
  quitarFacilitadorGrupoMock.mockReset()
  refreshMock.mockReset()
  fetchCalls.length = 0
  ;(global as unknown as { fetch: jest.Mock }).fetch = jest.fn((url: string, init?: RequestInit) => {
    fetchCalls.push({ url, init })
    if (url === '/api/talleres/grupos' && (init?.method ?? '').toUpperCase() === 'POST') {
      const payload = JSON.parse(init!.body as string) as Record<string, unknown>
      return Promise.resolve(
        jsonResponse({ grupo: { id: 'g-new', estado: 'activo', ...payload }, sesiones: { total: 8 } }, 201),
      )
    }
    return Promise.resolve(jsonResponse({ error: 'unexpected' }, 500))
  })
})

describe('GruposSection — list (T4)', () => {
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

  it('never renders SelectLeaderModal (the free picker is gone)', () => {
    render(<GruposSection {...baseProps({ puedeEditar: true })} />)
    expect(screen.queryByRole('textbox', { name: /buscar/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/seleccionar l[ií]der/i)).not.toBeInTheDocument()
  })
})

describe('GruposSection — read-only viewer', () => {
  it('shows the data but no edit, facilitador or crear-grupo controls', () => {
    render(<GruposSection {...baseProps({ puedeEditar: false })} />)
    expect(screen.getByText('Grupo Alfa')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /editar grupo/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: /servidor a agregar/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /quitar/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /crear grupo/i })).not.toBeInTheDocument()
  })
})

describe('GruposSection — editar grupo en su lugar', () => {
  it('edits nombre and capacidad via editarGrupoInstanciado', async () => {
    editarGrupoInstanciadoMock.mockResolvedValue({ ok: true })
    render(<GruposSection {...baseProps({ puedeEditar: true })} />)
    fireEvent.click(screen.getAllByRole('button', { name: /editar grupo/i })[0]!)
    const nombreInput = screen.getByDisplayValue('Grupo Alfa')
    fireEvent.change(nombreInput, { target: { value: 'Grupo Alfa (renombrado)' } })
    fireEvent.click(screen.getByRole('button', { name: /guardar grupo/i }))

    expect(editarGrupoInstanciadoMock).toHaveBeenCalledWith({
      tallerSlug: 'matrimonio-sobre-la-roca',
      edicionId: 'e-1',
      grupoId: 'g-1',
      nombre: 'Grupo Alfa (renombrado)',
      capacidad: 12,
    })
    await waitFor(() => expect(refreshMock).toHaveBeenCalled())
  })

  it('maps a 42501 denial to a visible alert', async () => {
    editarGrupoInstanciadoMock.mockResolvedValue({
      ok: false,
      error: 'forbidden',
      message: 'No tenés permisos para hacer este cambio.',
    })
    render(<GruposSection {...baseProps({ puedeEditar: true })} />)
    fireEvent.click(screen.getAllByRole('button', { name: /editar grupo/i })[0]!)
    fireEvent.click(screen.getByRole('button', { name: /guardar grupo/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No tenés permisos para hacer este cambio.')
  })
})

describe('GruposSection — agregar facilitador (bounded picker)', () => {
  it('adds a facilitador through the bounded picker', async () => {
    agregarFacilitadorGrupoMock.mockResolvedValue({ ok: true })
    render(<GruposSection {...baseProps({ puedeEditar: true })} />)
    const pickers = screen.getAllByRole('combobox', { name: /servidor a agregar/i })
    fireEvent.change(pickers[1]!, { target: { value: 'p-2' } }) // g-2's picker
    const rolSelects = screen.getAllByRole('combobox', { name: /^rol$/i })
    fireEvent.change(rolSelects[1]!, { target: { value: 'voluntario' } })
    fireEvent.click(screen.getAllByRole('button', { name: /agregar facilitador/i })[1]!)

    expect(agregarFacilitadorGrupoMock).toHaveBeenCalledWith({
      tallerSlug: 'matrimonio-sobre-la-roca',
      edicionId: 'e-1',
      grupoId: 'g-2',
      personaId: 'p-2',
      rol: 'voluntario',
    })
    await waitFor(() => expect(refreshMock).toHaveBeenCalled())
  })

  it('maps NO_ES_SERVIDOR_ACTIVO_DEL_TALLER to the friendly Spanish message', async () => {
    agregarFacilitadorGrupoMock.mockResolvedValue({
      ok: false,
      error: 'conflict',
      message: 'Esa persona no es un servidor activo de este taller. Asignala primero en Dream Team → Servidores.',
    })
    render(<GruposSection {...baseProps({ puedeEditar: true })} />)
    fireEvent.click(screen.getAllByRole('button', { name: /agregar facilitador/i })[0]!)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Esa persona no es un servidor activo de este taller. Asignala primero en Dream Team → Servidores.',
    )
  })
})

describe('GruposSection — quitar facilitador', () => {
  it('removes a facilitador and refreshes', async () => {
    quitarFacilitadorGrupoMock.mockResolvedValue({ ok: true })
    render(<GruposSection {...baseProps({ puedeEditar: true })} />)
    fireEvent.click(screen.getByRole('button', { name: /quitar a ana gómez/i }))
    expect(quitarFacilitadorGrupoMock).toHaveBeenCalledWith({
      tallerSlug: 'matrimonio-sobre-la-roca',
      edicionId: 'e-1',
      facilitadorId: 'a-1',
    })
    await waitFor(() => expect(refreshMock).toHaveBeenCalled())
  })
})

describe('GruposSection — crear grupo (exception, keeps the fetch flow)', () => {
  it('POSTs the grupo, surfaces the generated-session count, and refreshes', async () => {
    render(<GruposSection {...baseProps({ puedeEditar: true })} />)
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Grupo Gamma' } })
    fireEvent.change(screen.getByLabelText('Capacidad'), { target: { value: '9' } })
    fireEvent.click(screen.getByRole('button', { name: /crear grupo/i }))

    expect(await screen.findByText(/8 sesiones/i)).toBeInTheDocument()
    const post = fetchCalls.find((c) => c.url === '/api/talleres/grupos')
    expect(post).toBeDefined()
    expect(JSON.parse(post!.init!.body as string)).toMatchObject({
      cohorte_id: 'c-1',
      nombre: 'Grupo Gamma',
      capacidad: 9,
    })
    await waitFor(() => expect(refreshMock).toHaveBeenCalled())
  })

  it('shows copy explaining it creates an extra grupo only for this edición', () => {
    render(<GruposSection {...baseProps({ puedeEditar: true })} />)
    expect(screen.getByText(/grupo adicional.*sólo para esta edición|extra.*esta edición/i)).toBeInTheDocument()
  })
})
