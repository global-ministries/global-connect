/**
 * @jest-environment jsdom
 *
 * T5 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) — the "Crear
 * temporada" form now picks a dirección (root Dream Team node) first, then
 * offers a checklist of that dirección's own talleres — régimen=temporada
 * ones checked by default and toggleable, régimen=cadencia ones shown
 * disabled with a hint ("abre por su propia cadencia") since they never
 * join a temporada. This suite covers the form's own rendering, dirección
 * switching, preview math, submit shape and redirect/notice.
 */

import { fireEvent, render, screen } from '@testing-library/react'

const createTemporadaMock = jest.fn()
const pushMock = jest.fn()

jest.mock('@/app/(auth)/talleres/temporadas/actions', () => ({
  createTemporada: (...args: unknown[]) => createTemporadaMock(...args),
}))

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

import { TallerTemporadaForm } from '@/app/(auth)/talleres/temporadas/crear/temporada-form'
import type { TallerParaTemporada } from '@/lib/platform/talleres/temporadas'

function taller(overrides: Partial<TallerParaTemporada> = {}): TallerParaTemporada {
  return { id: 't-1', nombre: 'Matrimonio', nodoLabel: 'Dirección de Conexión', regimen: 'temporada', ...overrides }
}

beforeEach(() => {
  createTemporadaMock.mockReset()
  pushMock.mockReset()
})

describe('TallerTemporadaForm — dirección picker', () => {
  it('preselects the only dirección when there is exactly one', () => {
    render(
      <TallerTemporadaForm
        direcciones={[{ id: 'root-1', label: 'Dirección de Conexión', talleres: [taller()] }]}
      />,
    )
    expect(screen.getByLabelText(/^dirección$/i)).toHaveValue('root-1')
    expect(screen.getByText('Matrimonio')).toBeInTheDocument()
  })

  it('shows no checklist until a dirección is picked, when there is more than one', () => {
    render(
      <TallerTemporadaForm
        direcciones={[
          { id: 'root-1', label: 'Dirección de Conexión', talleres: [taller()] },
          { id: 'root-2', label: 'Dirección de Experiencia', talleres: [taller({ id: 't-2', nombre: 'Otro' })] },
        ]}
      />,
    )
    expect(screen.getByLabelText(/^dirección$/i)).toHaveValue('')
    expect(screen.queryByText('Matrimonio')).not.toBeInTheDocument()
    expect(screen.queryByText('Otro')).not.toBeInTheDocument()
  })

  it('swaps the checklist and resets selection when the dirección changes', () => {
    render(
      <TallerTemporadaForm
        direcciones={[
          { id: 'root-1', label: 'Dirección de Conexión', talleres: [taller({ id: 't-1', nombre: 'Matrimonio' })] },
          { id: 'root-2', label: 'Dirección de Experiencia', talleres: [taller({ id: 't-2', nombre: 'Parejas' })] },
        ]}
      />,
    )
    fireEvent.change(screen.getByLabelText(/^dirección$/i), { target: { value: 'root-1' } })
    expect(screen.getByText('Matrimonio')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/^dirección$/i), { target: { value: 'root-2' } })
    expect(screen.queryByText('Matrimonio')).not.toBeInTheDocument()
    expect(screen.getByText('Parejas')).toBeInTheDocument()
  })
})

describe('TallerTemporadaForm — checklist by régimen', () => {
  const direcciones = [
    {
      id: 'root-1',
      label: 'Dirección de Conexión',
      talleres: [
        taller({ id: 't-temporada', nombre: 'Matrimonio', regimen: 'temporada' }),
        taller({ id: 't-cadencia', nombre: 'Próximo Paso', regimen: 'cadencia' }),
      ],
    },
  ]

  it('checks every régimen=temporada taller by default', () => {
    render(<TallerTemporadaForm direcciones={direcciones} />)
    expect(screen.getByRole('checkbox', { name: /matrimonio/i })).toBeChecked()
  })

  it('shows a régimen=cadencia taller disabled and unchecked, with its hint', () => {
    render(<TallerTemporadaForm direcciones={direcciones} />)
    const cadenciaCheckbox = screen.getByRole('checkbox', { name: /próximo paso/i })
    expect(cadenciaCheckbox).toBeDisabled()
    expect(cadenciaCheckbox).not.toBeChecked()
    expect(screen.getByText(/abre por su propia cadencia/i)).toBeInTheDocument()
  })

  it('unchecking a régimen=temporada taller excludes it from the count', () => {
    render(<TallerTemporadaForm direcciones={direcciones} />)
    fireEvent.change(screen.getByLabelText(/fecha de apertura/i), { target: { value: '2027-01-04' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /matrimonio/i }))
    expect(screen.getByText(/se crearán 0 ediciones/i)).toBeInTheDocument()
  })
})

describe('TallerTemporadaForm — preview', () => {
  const direcciones = [
    {
      id: 'root-1',
      label: 'Dirección de Conexión',
      talleres: [
        taller({ id: 't-1', nombre: 'Matrimonio' }),
        taller({ id: 't-2', nombre: 'Parejas' }),
      ],
    },
  ]

  it('shows no preview before a fecha de apertura is entered', () => {
    render(<TallerTemporadaForm direcciones={direcciones} />)
    expect(screen.queryByText(/se crearán/i)).not.toBeInTheDocument()
  })

  it('previews "Se crearán N ediciones con primera clase el {fecha}" once a fecha is entered', () => {
    render(<TallerTemporadaForm direcciones={direcciones} />)
    fireEvent.change(screen.getByLabelText(/fecha de apertura/i), { target: { value: '2027-01-04' } })
    expect(screen.getByText(/se crearán 2 ediciones con primera clase el/i)).toBeInTheDocument()
  })
})

describe('TallerTemporadaForm — submit', () => {
  const direcciones = [
    {
      id: 'root-1',
      label: 'Dirección de Conexión',
      talleres: [
        taller({ id: 't-1', nombre: 'Matrimonio', regimen: 'temporada' }),
        taller({ id: 't-2', nombre: 'Próximo Paso', regimen: 'cadencia' }),
      ],
    },
  ]

  function fillValidForm(): void {
    fireEvent.change(screen.getByLabelText(/^nombre$/i), { target: { value: '2027 - I' } })
    fireEvent.change(screen.getByLabelText(/fecha de apertura/i), { target: { value: '2027-01-04' } })
    fireEvent.change(screen.getByLabelText(/fecha de cierre/i), { target: { value: '2027-02-28' } })
  }

  it('is disabled until dirección, nombre and both fechas are filled', () => {
    render(<TallerTemporadaForm direcciones={direcciones} />)
    expect(screen.getByRole('button', { name: /crear temporada/i })).toBeDisabled()
    fillValidForm()
    expect(screen.getByRole('button', { name: /crear temporada/i })).toBeEnabled()
  })

  it('calls createTemporada with equipoId, nombre, fechas and only the checked régimen=temporada tallerIds', async () => {
    createTemporadaMock.mockResolvedValue({ ok: true, temporadaId: 'temp-99', edicionesCreadas: 1 })
    render(<TallerTemporadaForm direcciones={direcciones} />)
    fillValidForm()
    fireEvent.click(screen.getByRole('button', { name: /crear temporada/i }))
    await screen.findByText(/crear temporada/i)
    expect(createTemporadaMock).toHaveBeenCalledWith({
      equipoId: 'root-1',
      nombre: '2027 - I',
      fecha_apertura: '2027-01-04',
      fecha_cierre: '2027-02-28',
      tallerIds: ['t-1'],
    })
  })

  it('redirects to the temporada detail with ?creadas=N on success', async () => {
    createTemporadaMock.mockResolvedValue({ ok: true, temporadaId: 'temp-99', edicionesCreadas: 3 })
    render(<TallerTemporadaForm direcciones={direcciones} />)
    fillValidForm()
    fireEvent.click(screen.getByRole('button', { name: /crear temporada/i }))
    await screen.findByText(/crear temporada/i)
    expect(pushMock).toHaveBeenCalledWith('/talleres/temporadas/temp-99?creadas=3')
  })

  it('shows the error message and does not redirect on failure', async () => {
    createTemporadaMock.mockResolvedValue({ ok: false, error: 'invalid-input', message: 'Ese taller no abre por temporada.' })
    render(<TallerTemporadaForm direcciones={direcciones} />)
    fillValidForm()
    fireEvent.click(screen.getByRole('button', { name: /crear temporada/i }))
    expect(await screen.findByText('Ese taller no abre por temporada.')).toBeInTheDocument()
    expect(pushMock).not.toHaveBeenCalled()
  })
})

describe('TallerTemporadaForm — neutral Spanish (no voseo)', () => {
  it('never uses voseo copy', () => {
    render(
      <TallerTemporadaForm
        direcciones={[{ id: 'root-1', label: 'Dirección de Conexión', talleres: [taller()] }]}
      />,
    )
    expect(screen.queryByText(/tenés|podés|creá\b|elegí\b/i)).not.toBeInTheDocument()
  })
})
