/**
 * @jest-environment jsdom
 *
 * T6 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) — "Inscribir
 * persona" on the edición page: search a persona, try a normal insert
 * (agregarInscripcion), and — only when it comes back mapped to
 * `error: 'cupo-lleno'` (lib/platform/talleres/errores-api.ts's own
 * distinct code for CUPO_LLENO) — offer a second step, "Inscribir igual
 * (sobre el cupo)", that calls inscribirSobreCupo.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const buscarPersonasMock = jest.fn()
const agregarInscripcionMock = jest.fn()
const inscribirSobreCupoMock = jest.fn()
const refreshMock = jest.fn()

jest.mock('@/app/(auth)/talleres/[taller]/[edicion]/actions', () => ({
  buscarPersonasParaInscribir: (...args: unknown[]) => buscarPersonasMock(...args),
  agregarInscripcion: (...args: unknown[]) => agregarInscripcionMock(...args),
  inscribirSobreCupo: (...args: unknown[]) => inscribirSobreCupoMock(...args),
}))

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}))

import { InscribirPersonaForm } from '@/components/talleres/inscribir-persona-form'

function baseProps() {
  return { tallerSlug: 'matrimonio-sobre-la-roca', edicionId: 'e-1', cohorteId: 'c-1' }
}

beforeEach(() => {
  buscarPersonasMock.mockReset()
  agregarInscripcionMock.mockReset()
  inscribirSobreCupoMock.mockReset()
  refreshMock.mockReset()
})

async function buscarYSeleccionar(nombre = 'Juan Pérez') {
  buscarPersonasMock.mockResolvedValue({
    ok: true,
    personas: [{ id: 'p-1', nombre: 'Juan', apellido: 'Pérez', email: 'juan@example.com' }],
  })
  fireEvent.change(screen.getByLabelText(/buscar persona/i), { target: { value: 'juan' } })
  fireEvent.click(screen.getByRole('button', { name: /^buscar$/i }))
  await screen.findByText(new RegExp(nombre))
  fireEvent.click(screen.getByRole('radio'))
}

describe('InscribirPersonaForm — search', () => {
  it('calls buscarPersonasParaInscribir with the typed query and renders the results', async () => {
    render(<InscribirPersonaForm {...baseProps()} />)
    buscarPersonasMock.mockResolvedValue({
      ok: true,
      personas: [{ id: 'p-1', nombre: 'Juan', apellido: 'Pérez', email: 'juan@example.com' }],
    })
    fireEvent.change(screen.getByLabelText(/buscar persona/i), { target: { value: 'juan' } })
    fireEvent.click(screen.getByRole('button', { name: /^buscar$/i }))

    await waitFor(() => expect(buscarPersonasMock).toHaveBeenCalledWith('juan'))
    expect(await screen.findByText(/Juan Pérez/)).toBeInTheDocument()
  })

  it('shows the search error message when the search fails', async () => {
    render(<InscribirPersonaForm {...baseProps()} />)
    buscarPersonasMock.mockResolvedValue({ ok: false, personas: [], message: 'No se pudo buscar personas.' })
    fireEvent.change(screen.getByLabelText(/buscar persona/i), { target: { value: 'juan' } })
    fireEvent.click(screen.getByRole('button', { name: /^buscar$/i }))

    expect(await screen.findByText('No se pudo buscar personas.')).toBeInTheDocument()
  })

  it('does not show an "Inscribir" button until a persona is selected', async () => {
    render(<InscribirPersonaForm {...baseProps()} />)
    await buscarYSeleccionarNone()
    expect(screen.queryByRole('button', { name: /^inscribir$/i })).not.toBeInTheDocument()
  })
})

async function buscarYSeleccionarNone() {
  buscarPersonasMock.mockResolvedValue({
    ok: true,
    personas: [{ id: 'p-1', nombre: 'Juan', apellido: 'Pérez', email: null }],
  })
  fireEvent.change(screen.getByLabelText(/buscar persona/i), { target: { value: 'juan' } })
  fireEvent.click(screen.getByRole('button', { name: /^buscar$/i }))
  await screen.findByText(/Juan Pérez/)
}

describe('InscribirPersonaForm — normal enrol', () => {
  it('calls agregarInscripcion with the right shape and refreshes on success', async () => {
    render(<InscribirPersonaForm {...baseProps()} />)
    await buscarYSeleccionar()
    agregarInscripcionMock.mockResolvedValue({ ok: true, inscripcionId: 'i-1' })

    fireEvent.click(screen.getByRole('button', { name: /^inscribir$/i }))

    await waitFor(() =>
      expect(agregarInscripcionMock).toHaveBeenCalledWith({
        tallerSlug: 'matrimonio-sobre-la-roca',
        edicionId: 'e-1',
        cohorteId: 'c-1',
        personaId: 'p-1',
      }),
    )
    await waitFor(() => expect(refreshMock).toHaveBeenCalled())
  })

  it('shows the failure message and does NOT offer the sobre-cupo step for a non-cupo-lleno error', async () => {
    render(<InscribirPersonaForm {...baseProps()} />)
    await buscarYSeleccionar()
    agregarInscripcionMock.mockResolvedValue({
      ok: false,
      error: 'conflict',
      message: 'Esta persona ya está inscrita en esta edición.',
    })

    fireEvent.click(screen.getByRole('button', { name: /^inscribir$/i }))

    expect(await screen.findByText('Esta persona ya está inscrita en esta edición.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /inscribir igual/i })).not.toBeInTheDocument()
  })
})

describe('InscribirPersonaForm — cupo lleno second step', () => {
  it('offers "Inscribir igual (sobre el cupo)" only when agregarInscripcion fails with error: cupo-lleno', async () => {
    render(<InscribirPersonaForm {...baseProps()} />)
    await buscarYSeleccionar()
    agregarInscripcionMock.mockResolvedValue({
      ok: false,
      error: 'cupo-lleno',
      message: 'Este taller ya está en su cupo máximo.',
    })

    fireEvent.click(screen.getByRole('button', { name: /^inscribir$/i }))

    expect(await screen.findByText('Este taller ya está en su cupo máximo.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /inscribir igual \(sobre el cupo\)/i })).toBeInTheDocument()
  })

  it('the second step calls inscribirSobreCupo with the right shape and refreshes on success', async () => {
    render(<InscribirPersonaForm {...baseProps()} />)
    await buscarYSeleccionar()
    agregarInscripcionMock.mockResolvedValue({ ok: false, error: 'cupo-lleno', message: 'Cupo lleno.' })
    fireEvent.click(screen.getByRole('button', { name: /^inscribir$/i }))
    await screen.findByRole('button', { name: /inscribir igual/i })

    inscribirSobreCupoMock.mockResolvedValue({
      ok: true,
      inscripcionId: 'i-2',
      cupo: 2,
      ocupados: 3,
      sobreCupo: 1,
    })
    fireEvent.click(screen.getByRole('button', { name: /inscribir igual/i }))

    await waitFor(() =>
      expect(inscribirSobreCupoMock).toHaveBeenCalledWith({
        tallerSlug: 'matrimonio-sobre-la-roca',
        edicionId: 'e-1',
        personaId: 'p-1',
      }),
    )
    await waitFor(() => expect(refreshMock).toHaveBeenCalled())
  })

  it('a failed sobre-cupo attempt (e.g. YA_INSCRITO) shows its own message', async () => {
    render(<InscribirPersonaForm {...baseProps()} />)
    await buscarYSeleccionar()
    agregarInscripcionMock.mockResolvedValue({ ok: false, error: 'cupo-lleno', message: 'Cupo lleno.' })
    fireEvent.click(screen.getByRole('button', { name: /^inscribir$/i }))
    await screen.findByRole('button', { name: /inscribir igual/i })

    inscribirSobreCupoMock.mockResolvedValue({
      ok: false,
      error: 'conflict',
      message: 'Esta persona ya está inscrita en esta edición.',
    })
    fireEvent.click(screen.getByRole('button', { name: /inscribir igual/i }))

    expect(await screen.findByText('Esta persona ya está inscrita en esta edición.')).toBeInTheDocument()
  })
})
