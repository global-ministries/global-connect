/**
 * @jest-environment jsdom
 *
 * T3 (odd/tasks/talleres-configuracion-del-taller.md) — the taller
 * screen's "Grupos (plantilla)" section: list grupos with nombre,
 * capacidad and facilitadores; add/edit/deactivate a grupo; add a
 * facilitador through a BOUNDED picker — a plain <select> filtered
 * client-side from `servidores` (talleres_servidores_del_taller), never
 * a free-text search and never talleres_buscar_personas (that RPC stays
 * for Dream Team's own servidor assignment, out of scope here).
 */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

const crearPlantillaGrupoMock = jest.fn()
const editarPlantillaGrupoMock = jest.fn()
const toggleActivoPlantillaGrupoMock = jest.fn()
const agregarFacilitadorMock = jest.fn()
const quitarFacilitadorMock = jest.fn()
const refreshMock = jest.fn()

jest.mock('@/app/(auth)/talleres/[taller]/actions', () => ({
  crearPlantillaGrupo: (...args: unknown[]) => crearPlantillaGrupoMock(...args),
  editarPlantillaGrupo: (...args: unknown[]) => editarPlantillaGrupoMock(...args),
  toggleActivoPlantillaGrupo: (...args: unknown[]) => toggleActivoPlantillaGrupoMock(...args),
  agregarFacilitador: (...args: unknown[]) => agregarFacilitadorMock(...args),
  quitarFacilitador: (...args: unknown[]) => quitarFacilitadorMock(...args),
}))

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}))

import { PlantillaGruposSection } from '@/components/talleres/plantilla-grupos-section'

const GRUPOS = [
  {
    id: 'g-1',
    nombre: 'Grupo Alfa',
    capacidad: 12,
    activo: true,
    facilitadores: [
      { id: 'f-1', personaId: 'p-1', rol: 'lider', nombre: 'Ana', apellido: 'Gómez' },
    ],
  },
  {
    id: 'g-2',
    nombre: 'Grupo Beta',
    capacidad: 10,
    activo: true,
    facilitadores: [],
  },
]

const SERVIDORES = [
  { personaId: 'p-1', nombre: 'Ana', apellido: 'Gómez' },
  { personaId: 'p-2', nombre: 'Carlos', apellido: 'Ruiz' },
]

function baseProps(overrides: Partial<Parameters<typeof PlantillaGruposSection>[0]> = {}) {
  return {
    tallerId: 't-1',
    tallerSlug: 'proximo-paso',
    grupos: GRUPOS,
    servidores: SERVIDORES,
    puedeEditar: false,
    ...overrides,
  }
}

beforeEach(() => {
  crearPlantillaGrupoMock.mockReset()
  editarPlantillaGrupoMock.mockReset()
  toggleActivoPlantillaGrupoMock.mockReset()
  agregarFacilitadorMock.mockReset()
  quitarFacilitadorMock.mockReset()
  refreshMock.mockReset()
})

describe('PlantillaGruposSection — rendering', () => {
  it('lists grupos with nombre, capacidad and facilitadores', () => {
    render(<PlantillaGruposSection {...baseProps()} />)
    expect(screen.getByText('Grupo Alfa')).toBeInTheDocument()
    expect(screen.getByText(/12/)).toBeInTheDocument()
    expect(screen.getByText(/Ana Gómez/)).toBeInTheDocument()
    expect(screen.getByText(/Líder|lider/i)).toBeInTheDocument()
  })

  it('shows an empty state when there are no grupos yet', () => {
    render(<PlantillaGruposSection {...baseProps({ grupos: [] })} />)
    expect(screen.getByText(/todavía no tiene grupos/i)).toBeInTheDocument()
  })

  // T11 (odd/tasks/talleres-configuracion-del-taller.md, flow audit) — one
  // vocabulary: "Grupos" (plantilla) is ambiguous with the edición's own
  // "Grupos de esta edición" list, so the section is titled "Plantilla de
  // grupos" with a hint naming what it is for.
  it('titles the section "Plantilla de grupos" with its hint', () => {
    render(<PlantillaGruposSection {...baseProps()} />)
    expect(screen.getByRole('heading', { name: /^plantilla de grupos$/i })).toBeInTheDocument()
    expect(screen.getByText(/se copian a cada edición nueva/i)).toBeInTheDocument()
  })
})

describe('PlantillaGruposSection — read-only viewer', () => {
  it('shows no Agregar grupo, edit, or facilitador picker controls', () => {
    render(<PlantillaGruposSection {...baseProps({ puedeEditar: false })} />)
    expect(screen.queryByRole('button', { name: /agregar grupo/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /editar grupo/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: /^servidor$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /quitar/i })).not.toBeInTheDocument()
  })
})

describe('PlantillaGruposSection — editor: facilitador picker is bounded', () => {
  it('offers an empty placeholder plus the servidores prop as options, never a free-text search', () => {
    render(<PlantillaGruposSection {...baseProps({ puedeEditar: true })} />)
    const pickers = screen.getAllByRole('combobox', { name: /^servidor$/i })
    // g-2 has no facilitadores yet, so nobody is excluded from its picker.
    const options = within(pickers[1]!).getAllByRole('option').map((o) => o.textContent)
    expect(options).toEqual(['Elige un servidor…', 'Ana Gómez', 'Carlos Ruiz'])
    expect(screen.queryByRole('textbox', { name: /buscar/i })).not.toBeInTheDocument()
  })

  it('excludes a grupo\'s own facilitadores from its picker options', () => {
    render(<PlantillaGruposSection {...baseProps({ puedeEditar: true })} />)
    const pickers = screen.getAllByRole('combobox', { name: /^servidor$/i })
    // g-1 already has Ana Gómez (p-1) as a facilitador.
    const options = within(pickers[0]!).getAllByRole('option').map((o) => o.textContent)
    expect(options).toEqual(['Elige un servidor…', 'Carlos Ruiz'])
  })

  it('shows the "Sin servidores activos" empty state with a link to Servidores when there are none', () => {
    render(<PlantillaGruposSection {...baseProps({ puedeEditar: true, servidores: [] })} />)
    expect(screen.getByText(/Sin servidores activos en este equipo/i)).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /servidores/i })
    expect(link).toHaveAttribute('href', '/admin/dream-team/servidores')
    expect(screen.queryByRole('combobox', { name: /^servidor$/i })).not.toBeInTheDocument()
  })

  it('adds a facilitador with the picked persona and rol', async () => {
    agregarFacilitadorMock.mockResolvedValue({ ok: true })
    render(<PlantillaGruposSection {...baseProps({ puedeEditar: true })} />)
    const pickers = screen.getAllByRole('combobox', { name: /^servidor$/i })
    fireEvent.change(pickers[1]!, { target: { value: 'p-2' } }) // grupo g-2's picker
    const rolSelects = screen.getAllByRole('combobox', { name: /^rol$/i })
    fireEvent.change(rolSelects[1]!, { target: { value: 'voluntario' } })
    fireEvent.click(screen.getAllByRole('button', { name: /agregar facilitador/i })[1]!)

    expect(agregarFacilitadorMock).toHaveBeenCalledWith({
      tallerSlug: 'proximo-paso',
      plantillaGrupoId: 'g-2',
      personaId: 'p-2',
      rol: 'voluntario',
    })
    await waitFor(() => expect(refreshMock).toHaveBeenCalled())
  })

  it('maps NO_ES_SERVIDOR_ACTIVO_DEL_TALLER to the friendly Spanish message returned by the action', async () => {
    agregarFacilitadorMock.mockResolvedValue({
      ok: false,
      error: 'conflict',
      message: 'Esa persona no es un servidor activo de este taller. Asígnala primero en Dream Team → Servidores.',
    })
    render(<PlantillaGruposSection {...baseProps({ puedeEditar: true })} />)
    fireEvent.change(screen.getAllByRole('combobox', { name: /^servidor$/i })[0]!, { target: { value: 'p-2' } })
    fireEvent.click(screen.getAllByRole('button', { name: /agregar facilitador/i })[0]!)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Esa persona no es un servidor activo de este taller. Asígnala primero en Dream Team → Servidores.',
    )
  })
})

describe('PlantillaGruposSection — editor: quitar facilitador', () => {
  it('asks for confirmation, then removes the facilitador and refreshes', async () => {
    quitarFacilitadorMock.mockResolvedValue({ ok: true })
    render(<PlantillaGruposSection {...baseProps({ puedeEditar: true })} />)
    fireEvent.click(screen.getByRole('button', { name: /quitar a ana gómez del grupo/i }))

    // Not called yet — the confirm step comes first.
    expect(quitarFacilitadorMock).not.toHaveBeenCalled()
    expect(screen.getByText(/¿quitar a ana gómez/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }))
    expect(quitarFacilitadorMock).toHaveBeenCalledWith({ tallerSlug: 'proximo-paso', facilitadorId: 'f-1' })
    await waitFor(() => expect(refreshMock).toHaveBeenCalled())
  })
})

describe('PlantillaGruposSection — editor: agregar grupo', () => {
  it('opens a dialog from the heading action and adds a grupo', async () => {
    crearPlantillaGrupoMock.mockResolvedValue({ ok: true })
    render(<PlantillaGruposSection {...baseProps({ puedeEditar: true })} />)
    fireEvent.click(screen.getByRole('button', { name: /^agregar grupo$/i }))
    fireEvent.change(screen.getByLabelText(/nombre del nuevo grupo/i), { target: { value: 'Grupo Gamma' } })
    fireEvent.change(screen.getByLabelText(/capacidad del nuevo grupo/i), { target: { value: '8' } })
    fireEvent.click(screen.getByRole('button', { name: /crear grupo/i }))
    expect(crearPlantillaGrupoMock).toHaveBeenCalledWith({
      tallerId: 't-1',
      tallerSlug: 'proximo-paso',
      nombre: 'Grupo Gamma',
      capacidad: 8,
    })
    await waitFor(() => expect(refreshMock).toHaveBeenCalled())
  })

  it('shows the error message inside the dialog when the action fails', async () => {
    crearPlantillaGrupoMock.mockResolvedValue({
      ok: false,
      error: 'forbidden',
      message: 'No tienes permisos para hacer este cambio.',
    })
    render(<PlantillaGruposSection {...baseProps({ puedeEditar: true })} />)
    fireEvent.click(screen.getByRole('button', { name: /^agregar grupo$/i }))
    fireEvent.change(screen.getByLabelText(/nombre del nuevo grupo/i), { target: { value: 'Grupo Gamma' } })
    fireEvent.change(screen.getByLabelText(/capacidad del nuevo grupo/i), { target: { value: '8' } })
    fireEvent.click(screen.getByRole('button', { name: /crear grupo/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No tienes permisos para hacer este cambio.')
  })
})

describe('PlantillaGruposSection — editor: editar grupo en su lugar', () => {
  it('edits nombre and capacidad in place', async () => {
    editarPlantillaGrupoMock.mockResolvedValue({ ok: true })
    render(<PlantillaGruposSection {...baseProps({ puedeEditar: true })} />)
    fireEvent.click(screen.getAllByRole('button', { name: /editar grupo/i })[0]!)
    const nombreInput = screen.getByDisplayValue('Grupo Alfa')
    fireEvent.change(nombreInput, { target: { value: 'Grupo Alfa (renombrado)' } })
    fireEvent.click(screen.getByRole('button', { name: /guardar grupo/i }))
    expect(editarPlantillaGrupoMock).toHaveBeenCalledWith({
      tallerSlug: 'proximo-paso',
      grupoId: 'g-1',
      nombre: 'Grupo Alfa (renombrado)',
      capacidad: 12,
    })
    await waitFor(() => expect(refreshMock).toHaveBeenCalled())
  })
})

describe('PlantillaGruposSection — editor: activar/desactivar', () => {
  it('deactivates an active grupo', async () => {
    toggleActivoPlantillaGrupoMock.mockResolvedValue({ ok: true })
    render(<PlantillaGruposSection {...baseProps({ puedeEditar: true })} />)
    const toggles = screen.getAllByRole('button', { name: /desactivar|activar/i })
    fireEvent.click(toggles[0]!)
    expect(toggleActivoPlantillaGrupoMock).toHaveBeenCalledWith({
      tallerSlug: 'proximo-paso',
      grupoId: 'g-1',
      activo: false,
    })
    await waitFor(() => expect(refreshMock).toHaveBeenCalled())
  })
})
