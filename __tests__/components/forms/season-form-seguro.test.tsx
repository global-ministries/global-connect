/**
 * @jest-environment jsdom
 *
 * The admin season form after T9a (odd/tasks/planner-gdv.md; S19, S20): no
 * "activa" switch when creating, a pointer to the planner, and the server's
 * refusals shown on the field they are about.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const createSeason = jest.fn()
const updateSeason = jest.fn()

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }))
jest.mock('@/lib/actions/season.actions', () => ({
  createSeason: (...args: unknown[]) => createSeason(...args),
  updateSeason: (...args: unknown[]) => updateSeason(...args),
}))

import SeasonForm from '@/components/forms/SeasonForm'

beforeAll(() => {
  global.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

beforeEach(() => {
  createSeason.mockReset().mockResolvedValue(undefined)
  updateSeason.mockReset().mockResolvedValue(undefined)
})

const temporada = { id: 't1', nombre: '2026-I', fecha_inicio: '2026-02-16', fecha_fin: '2027-02-05', activa: true }

function llenar(nombre: string, inicio: string, fin: string) {
  fireEvent.change(screen.getByLabelText('Nombre de la Temporada *'), { target: { value: nombre } })
  fireEvent.change(screen.getByLabelText('Fecha de Inicio *'), { target: { value: inicio } })
  fireEvent.change(screen.getByLabelText('Fecha de Fin *'), { target: { value: fin } })
}

describe('SeasonForm — create', () => {
  it('has no activa switch, says the season is born in planning and points to the planner', () => {
    render(<SeasonForm />)

    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    expect(screen.getByText(/se crea en planificación e inactiva/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Para planificar una nueva temporada usa el planificador' }))
      .toHaveAttribute('href', '/grupos-vida/planificar/nueva')
  })

  it('sends only name and dates', async () => {
    render(<SeasonForm />)
    llenar('2027-I', '2027-02-08', '2028-02-06')
    fireEvent.click(screen.getByRole('button', { name: 'Crear Temporada' }))

    await waitFor(() => expect(createSeason).toHaveBeenCalledWith({ nombre: '2027-I', fecha_inicio: '2027-02-08', fecha_fin: '2028-02-06' }))
  })

  it('shows the refusal on its field', async () => {
    createSeason.mockResolvedValue({ campo: 'fecha_inicio', error: 'La temporada debe empezar después del 2026-02-16, inicio de «2026-I», la última de la cohorte I.' })
    render(<SeasonForm />)
    llenar('2026b-I', '2026-01-05', '2027-01-03')
    fireEvent.click(screen.getByRole('button', { name: 'Crear Temporada' }))

    const campo = screen.getByLabelText('Fecha de Inicio *')
    await waitFor(() => expect(campo).toHaveAttribute('aria-invalid', 'true'))
    expect(screen.getByText('La temporada debe empezar después del 2026-02-16, inicio de «2026-I», la última de la cohorte I.')).toBeInTheDocument()
  })
})

describe('SeasonForm — edit', () => {
  it('keeps the activa switch and sends it', async () => {
    render(<SeasonForm initialData={temporada} />)

    expect(screen.getByRole('switch', { name: '¿Activa?' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Guardar Cambios' }))
    await waitFor(() => expect(updateSeason).toHaveBeenCalledWith('t1', { nombre: '2026-I', fecha_inicio: '2026-02-16', fecha_fin: '2027-02-05', activa: true }))
  })

  it('explains that the cohort and its order cannot change', () => {
    render(<SeasonForm initialData={temporada} />)
    expect(screen.getByText(/la cohorte \(I o II\) y el orden de inicio dentro de ella no cambian/i)).toBeInTheDocument()
  })

  it.each([
    ['nombre', 'Nombre de la Temporada *', '«2026-I» es de la cohorte I: el nombre debe seguir terminando en I.'],
    ['nombre', 'Nombre de la Temporada *', 'Ya existe una temporada llamada «2025 - I».'],
    ['fecha_inicio', 'Fecha de Inicio *', 'La temporada debe empezar antes del 2027-02-08, inicio de «2027-I», la siguiente de la cohorte I.'],
  ])('shows the refusal on %s', async (campo, etiqueta, error) => {
    updateSeason.mockResolvedValue({ campo, error })
    render(<SeasonForm initialData={temporada} />)
    fireEvent.click(screen.getByRole('button', { name: 'Guardar Cambios' }))

    const input = screen.getByLabelText(etiqueta)
    await waitFor(() => expect(input).toHaveAttribute('aria-invalid', 'true'))
    expect(screen.getByText(error)).toBeInTheDocument()
  })

  it('shows an error without field as a notice', async () => {
    updateSeason.mockResolvedValue({ error: 'Error al actualizar temporada: boom' })
    render(<SeasonForm initialData={temporada} />)
    fireEvent.click(screen.getByRole('button', { name: 'Guardar Cambios' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Error al actualizar temporada: boom')
  })
})
