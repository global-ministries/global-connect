/**
 * @jest-environment jsdom
 *
 * T3 (odd/tasks/talleres-configuracion-del-taller.md) — the taller
 * screen's "Clases (plantilla)" section: list, add (next numero), edit
 * tema in place, deactivate/reactivate, reorder by swapping numero with
 * up/down buttons, plus cadencia_dias/duracion_minutos as two editable
 * fields. Edit controls only render when puedeEditar (permisos.editarTaller
 * — the page decides, this component never re-derives a capability).
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const crearPlantillaClaseMock = jest.fn()
const editarPlantillaClaseTemaMock = jest.fn()
const toggleActivoPlantillaClaseMock = jest.fn()
const moverPlantillaClaseMock = jest.fn()
const updateCadenciaYDuracionMock = jest.fn()
const refreshMock = jest.fn()

jest.mock('@/app/(auth)/talleres/[taller]/actions', () => ({
  crearPlantillaClase: (...args: unknown[]) => crearPlantillaClaseMock(...args),
  editarPlantillaClaseTema: (...args: unknown[]) => editarPlantillaClaseTemaMock(...args),
  toggleActivoPlantillaClase: (...args: unknown[]) => toggleActivoPlantillaClaseMock(...args),
  moverPlantillaClase: (...args: unknown[]) => moverPlantillaClaseMock(...args),
  updateCadenciaYDuracion: (...args: unknown[]) => updateCadenciaYDuracionMock(...args),
}))

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}))

import { PlantillaClasesSection } from '@/components/talleres/plantilla-clases-section'

const CLASES = [
  { id: 'c-1', numero: 1, tema: 'Sígueme', activo: true },
  { id: 'c-2', numero: 2, tema: 'Intimidad con Dios', activo: true },
  { id: 'c-3', numero: 3, tema: 'Compañerismo', activo: false },
]

function baseProps(overrides: Partial<Parameters<typeof PlantillaClasesSection>[0]> = {}) {
  return {
    tallerId: 't-1',
    tallerSlug: 'proximo-paso',
    clases: CLASES,
    cadenciaDias: 7,
    duracionMinutos: 90,
    puedeEditar: false,
    ...overrides,
  }
}

beforeEach(() => {
  crearPlantillaClaseMock.mockReset()
  editarPlantillaClaseTemaMock.mockReset()
  toggleActivoPlantillaClaseMock.mockReset()
  moverPlantillaClaseMock.mockReset()
  updateCadenciaYDuracionMock.mockReset()
  refreshMock.mockReset()
})

describe('PlantillaClasesSection — rendering', () => {
  it('renders "Clase 2 · Intimidad con Dios"', () => {
    render(<PlantillaClasesSection {...baseProps()} />)
    expect(screen.getByText(/Clase 2 · Intimidad con Dios/)).toBeInTheDocument()
  })

  it('shows an empty state when there are no clases yet', () => {
    render(<PlantillaClasesSection {...baseProps({ clases: [] })} />)
    expect(screen.getByText(/todavía no tiene clases/i)).toBeInTheDocument()
  })

  // T11 (odd/tasks/talleres-configuracion-del-taller.md, flow audit) — one
  // vocabulary: "Clases" (plantilla) is ambiguous with the edición's own
  // "Clase n · tema" list, so the section is titled "Plantilla de clases"
  // with a hint naming what it is for.
  it('titles the section "Plantilla de clases" with its hint', () => {
    render(<PlantillaClasesSection {...baseProps()} />)
    expect(screen.getByRole('heading', { name: /^plantilla de clases$/i })).toBeInTheDocument()
    expect(screen.getByText(/nombre y orden de las clases de cada edición/i)).toBeInTheDocument()
  })
})

describe('PlantillaClasesSection — read-only viewer', () => {
  it('shows no Agregar button, edit pencils, or reorder buttons', () => {
    render(<PlantillaClasesSection {...baseProps({ puedeEditar: false })} />)
    expect(screen.queryByRole('button', { name: /agregar clase/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /editar tema/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /subir/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /bajar/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /desactivar|activar/i })).not.toBeInTheDocument()
  })

  it('shows cadencia and duracion as plain text', () => {
    render(<PlantillaClasesSection {...baseProps({ puedeEditar: false })} />)
    expect(screen.getByText(/Cada 7 días/)).toBeInTheDocument()
    expect(screen.getByText(/90/)).toBeInTheDocument()
  })
})

describe('PlantillaClasesSection — editor: add clase', () => {
  it('opens a dialog from the heading action and adds a clase', async () => {
    crearPlantillaClaseMock.mockResolvedValue({ ok: true })
    render(<PlantillaClasesSection {...baseProps({ puedeEditar: true })} />)
    fireEvent.click(screen.getByRole('button', { name: /^agregar clase$/i }))
    fireEvent.change(screen.getByLabelText(/tema de la nueva clase/i), { target: { value: 'Influencia' } })
    fireEvent.click(screen.getByRole('button', { name: /crear clase/i }))
    expect(crearPlantillaClaseMock).toHaveBeenCalledWith({
      tallerId: 't-1',
      tallerSlug: 'proximo-paso',
      tema: 'Influencia',
    })
    await waitFor(() => expect(refreshMock).toHaveBeenCalled())
  })
})

describe('PlantillaClasesSection — editor: edit tema in place', () => {
  it('opens an input pre-filled with the current tema and saves it', async () => {
    editarPlantillaClaseTemaMock.mockResolvedValue({ ok: true })
    render(<PlantillaClasesSection {...baseProps({ puedeEditar: true })} />)
    const editButtons = screen.getAllByRole('button', { name: /editar tema/i })
    fireEvent.click(editButtons[1]!) // clase c-2
    const input = screen.getByDisplayValue('Intimidad con Dios')
    fireEvent.change(input, { target: { value: 'Intimidad con Dios (nuevo)' } })
    fireEvent.click(screen.getByRole('button', { name: /guardar tema/i }))
    expect(editarPlantillaClaseTemaMock).toHaveBeenCalledWith({
      tallerSlug: 'proximo-paso',
      claseId: 'c-2',
      tema: 'Intimidad con Dios (nuevo)',
    })
    await waitFor(() => expect(refreshMock).toHaveBeenCalled())
  })
})

describe('PlantillaClasesSection — editor: activar/desactivar', () => {
  it('deactivates an active clase', async () => {
    toggleActivoPlantillaClaseMock.mockResolvedValue({ ok: true })
    render(<PlantillaClasesSection {...baseProps({ puedeEditar: true })} />)
    const toggles = screen.getAllByRole('button', { name: /desactivar|activar/i })
    fireEvent.click(toggles[0]!) // clase c-1, activo=true
    expect(toggleActivoPlantillaClaseMock).toHaveBeenCalledWith({
      tallerSlug: 'proximo-paso',
      claseId: 'c-1',
      activo: false,
    })
    await waitFor(() => expect(refreshMock).toHaveBeenCalled())
  })

  it('reactivates an inactive clase', async () => {
    toggleActivoPlantillaClaseMock.mockResolvedValue({ ok: true })
    render(<PlantillaClasesSection {...baseProps({ puedeEditar: true })} />)
    const toggles = screen.getAllByRole('button', { name: /desactivar|activar/i })
    fireEvent.click(toggles[2]!) // clase c-3, activo=false
    expect(toggleActivoPlantillaClaseMock).toHaveBeenCalledWith({
      tallerSlug: 'proximo-paso',
      claseId: 'c-3',
      activo: true,
    })
    await waitFor(() => expect(refreshMock).toHaveBeenCalled())
  })
})

describe('PlantillaClasesSection — editor: reorder', () => {
  it('disables Subir on the first clase and Bajar on the last, each naming its clase', () => {
    render(<PlantillaClasesSection {...baseProps({ puedeEditar: true })} />)
    const subir = screen.getAllByRole('button', { name: /^subir clase/i })
    const bajar = screen.getAllByRole('button', { name: /^bajar clase/i })
    expect(subir[0]).toHaveAccessibleName('Subir clase 1')
    expect(subir[0]).toBeDisabled()
    expect(bajar[bajar.length - 1]).toHaveAccessibleName('Bajar clase 3')
    expect(bajar[bajar.length - 1]).toBeDisabled()
  })

  it('moves a middle clase up', async () => {
    moverPlantillaClaseMock.mockResolvedValue({ ok: true })
    render(<PlantillaClasesSection {...baseProps({ puedeEditar: true })} />)
    const subir = screen.getAllByRole('button', { name: /^subir clase/i })
    fireEvent.click(subir[1]!) // clase c-2
    expect(moverPlantillaClaseMock).toHaveBeenCalledWith({
      tallerId: 't-1',
      tallerSlug: 'proximo-paso',
      claseId: 'c-2',
      direccion: 'subir',
    })
    await waitFor(() => expect(refreshMock).toHaveBeenCalled())
  })
})

describe('PlantillaClasesSection — editor: cadencia y duración', () => {
  it('shows the current values as editable fields and saves them', async () => {
    updateCadenciaYDuracionMock.mockResolvedValue({ ok: true })
    render(<PlantillaClasesSection {...baseProps({ puedeEditar: true })} />)
    const cadenciaInput = screen.getByLabelText(/cada n días/i)
    expect(cadenciaInput).toHaveValue(7)
    fireEvent.change(cadenciaInput, { target: { value: '14' } })
    fireEvent.click(screen.getByRole('button', { name: /guardar cadencia/i }))
    expect(updateCadenciaYDuracionMock).toHaveBeenCalledWith({
      tallerId: 't-1',
      tallerSlug: 'proximo-paso',
      cadenciaDias: 14,
      duracionMinutos: 90,
    })
    await waitFor(() => expect(refreshMock).toHaveBeenCalled())
  })
})

describe('PlantillaClasesSection — error display', () => {
  it('shows the error message from a failed action', async () => {
    crearPlantillaClaseMock.mockResolvedValue({
      ok: false,
      error: 'forbidden',
      message: 'No tienes permisos para hacer este cambio.',
    })
    render(<PlantillaClasesSection {...baseProps({ puedeEditar: true })} />)
    fireEvent.click(screen.getByRole('button', { name: /^agregar clase$/i }))
    fireEvent.change(screen.getByLabelText(/tema de la nueva clase/i), { target: { value: 'Influencia' } })
    fireEvent.click(screen.getByRole('button', { name: /crear clase/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No tienes permisos para hacer este cambio.')
  })
})
