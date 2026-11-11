/**
 * @jest-environment jsdom
 *
 * T4 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) — "Crear
 * edición" rewritten as one question, driven by `regimen`: régimen=
 * temporada asks only the temporada (or shows an empty state + link when
 * there is none open), régimen=cadencia asks only the primera clase, plus
 * an optional "crear también las próximas" when the taller adelanta. The
 * page precomputes `temporadasDisponibles` (already excluding this
 * taller's used temporadas — see page.test.tsx for that exclusion); this
 * suite covers the form's own rendering, preview math, submit shape and
 * error mapping.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const crearEdicionMock = jest.fn()
const pushMock = jest.fn()

jest.mock('@/app/(auth)/talleres/[taller]/actions', () => ({
  crearEdicion: (...args: unknown[]) => crearEdicionMock(...args),
}))

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

import { OpenEdicionForm } from '@/components/talleres/open-edicion-form'
import { rutaEdicion, rutaTaller } from '@/lib/platform/talleres/rutas'

/** Same UTC-anchored formatting the component itself uses, so date assertions never depend on the test runner's local timezone. */
function fmt(dateOnly: string): string {
  const [y, m, d] = dateOnly.split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString('es', { timeZone: 'UTC' })
}

function baseProps(overrides: Partial<Parameters<typeof OpenEdicionForm>[0]> = {}) {
  return {
    tallerId: 't-1',
    tallerSlug: 'proximo-paso',
    tallerNombre: 'Próximo Paso',
    regimen: 'cadencia' as const,
    temporadasDisponibles: [],
    intervaloEdicionesDias: null,
    cadenciaDias: 7,
    cierreInscripcionOffsetDias: 0,
    clasesPorGrupo: 4,
    gruposPlantillaActivos: 2,
    facilitadoresOmitidosPreview: [],
    ...overrides,
  }
}

beforeEach(() => {
  crearEdicionMock.mockReset()
  pushMock.mockReset()
})

function openForm() {
  fireEvent.click(screen.getByRole('button', { name: /^abrir edición$/i }))
}

describe('OpenEdicionForm — trigger and dialog', () => {
  it('does not render any field before the trigger is clicked', () => {
    render(<OpenEdicionForm {...baseProps()} />)
    expect(screen.queryByLabelText(/primera clase/i)).not.toBeInTheDocument()
  })

  it('opens the form inside a panel titled «Abrir edición» that names the taller', () => {
    render(<OpenEdicionForm {...baseProps()} />)
    openForm()
    const panel = screen.getByRole('dialog')
    expect(panel).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^abrir edición$/i })).toBeInTheDocument()
    expect(panel).toHaveTextContent(/Próximo Paso · se copian la plantilla de clases y los grupos/)
  })

  it('is controlled by abierto/onCambioAbierto without its own trigger, and Cancelar asks to close', () => {
    const onCambioAbierto = jest.fn()
    const { rerender } = render(<OpenEdicionForm {...baseProps()} abierto={false} onCambioAbierto={onCambioAbierto} />)
    expect(screen.queryByRole('button', { name: /^abrir edición$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    rerender(<OpenEdicionForm {...baseProps()} abierto onCambioAbierto={onCambioAbierto} />)
    expect(screen.getByLabelText(/primera clase/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^cancelar$/i }))
    expect(onCambioAbierto).toHaveBeenCalledWith(false)
  })

  it('uses neutral Spanish copy (no voseo)', () => {
    render(<OpenEdicionForm {...baseProps()} />)
    openForm()
    expect(screen.queryByText(/podés/i)).not.toBeInTheDocument()
    expect(screen.getByText(/puedes abrirla/i)).toBeInTheDocument()
  })
})

describe('OpenEdicionForm — régimen=temporada', () => {
  const temporadas = [
    { id: 'temp-1', nombre: 'Otoño 2026', fecha_apertura: '2026-09-01' },
    { id: 'temp-2', nombre: 'Primavera 2027', fecha_apertura: '2027-03-01' },
  ]

  it('asks only the temporada, no fecha/adelantar fields', () => {
    render(<OpenEdicionForm {...baseProps({ regimen: 'temporada', temporadasDisponibles: temporadas })} />)
    openForm()
    expect(screen.getByLabelText(/^temporada$/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/primera clase/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/crear también las próximas/i)).not.toBeInTheDocument()
  })

  it('lists exactly the temporadas the page handed it', () => {
    render(<OpenEdicionForm {...baseProps({ regimen: 'temporada', temporadasDisponibles: temporadas })} />)
    openForm()
    expect(screen.getByText('Otoño 2026')).toBeInTheDocument()
    expect(screen.getByText('Primavera 2027')).toBeInTheDocument()
  })

  it('shows an empty state with a link to Temporadas when there is none open, and disables submit', () => {
    render(<OpenEdicionForm {...baseProps({ regimen: 'temporada', temporadasDisponibles: [] })} />)
    openForm()
    expect(screen.queryByLabelText(/^temporada$/i)).not.toBeInTheDocument()
    expect(screen.getByText(/tu dirección no tiene temporadas abiertas/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /ir a temporadas/i })).toHaveAttribute('href', '/talleres/temporadas/crear')
    expect(screen.getByRole('button', { name: /^crear edición$/i, hidden: false })).toBeDisabled()
  })

  it('sends p_temporada_id and no fecha/adelantar on submit', async () => {
    crearEdicionMock.mockResolvedValue({ ok: true, ediciones: [{ edicionId: 'e-1', nombre: 'Otoño 2026' }] })
    render(<OpenEdicionForm {...baseProps({ regimen: 'temporada', temporadasDisponibles: temporadas })} />)
    openForm()
    fireEvent.change(screen.getByLabelText(/^temporada$/i), { target: { value: 'temp-1' } })
    fireEvent.click(screen.getByRole('button', { name: /^crear edición$/i }))
    await waitFor(() =>
      expect(crearEdicionMock).toHaveBeenCalledWith({
        tallerId: 't-1',
        tallerSlug: 'proximo-paso',
        fechaInicio: null,
        temporadaId: 'temp-1',
        adelantar: 0,
      }),
    )
  })

  it('shows the preview using the selected temporada\'s own fecha_apertura', () => {
    render(
      <OpenEdicionForm
        {...baseProps({
          regimen: 'temporada',
          temporadasDisponibles: temporadas,
          clasesPorGrupo: 4,
          cadenciaDias: 7,
          cierreInscripcionOffsetDias: -3,
          gruposPlantillaActivos: 2,
        })}
      />,
    )
    openForm()
    fireEvent.change(screen.getByLabelText(/^temporada$/i), { target: { value: 'temp-1' } })
    const text = screen.getByText(/se crearán 2 grupos y 4 clases por grupo/i)
    expect(text).toHaveTextContent(`primera clase ${fmt('2026-09-01')}`)
    expect(text).toHaveTextContent(`última ${fmt('2026-09-22')}`) // + (4-1)*7 = 21 days
    expect(text).toHaveTextContent(`inscripción cierra ${fmt('2026-08-29')}`) // -3 days
  })
})

describe('OpenEdicionForm — régimen=cadencia', () => {
  it('asks only the primera clase, no temporada field', () => {
    render(<OpenEdicionForm {...baseProps({ regimen: 'cadencia' })} />)
    openForm()
    expect(screen.getByLabelText(/primera clase/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/^temporada$/i)).not.toBeInTheDocument()
  })

  it('shows "Crear también las próximas" only when intervaloEdicionesDias is set', () => {
    render(<OpenEdicionForm {...baseProps({ regimen: 'cadencia', intervaloEdicionesDias: null })} />)
    openForm()
    expect(screen.queryByLabelText(/crear también las próximas/i)).not.toBeInTheDocument()
  })

  it('shows the 0..6 adelantar select with its hint when intervaloEdicionesDias is set', () => {
    render(<OpenEdicionForm {...baseProps({ regimen: 'cadencia', intervaloEdicionesDias: 28 })} />)
    openForm()
    const select = screen.getByLabelText(/crear también las próximas/i)
    expect(select).toBeInTheDocument()
    expect(screen.getByText(/una cada 28 días/i)).toBeInTheDocument()
  })

  it('sends p_fecha_inicio and p_adelantar on submit', async () => {
    crearEdicionMock.mockResolvedValue({
      ok: true,
      ediciones: [
        { edicionId: 'e-1', nombre: 'Marzo 2027' },
        { edicionId: 'e-2', nombre: 'Abril 2027' },
      ],
    })
    render(<OpenEdicionForm {...baseProps({ regimen: 'cadencia', intervaloEdicionesDias: 28 })} />)
    openForm()
    fireEvent.change(screen.getByLabelText(/primera clase/i), { target: { value: '2027-03-01' } })
    fireEvent.change(screen.getByLabelText(/crear también las próximas/i), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: /^crear edición$/i }))
    await waitFor(() =>
      expect(crearEdicionMock).toHaveBeenCalledWith({
        tallerId: 't-1',
        tallerSlug: 'proximo-paso',
        fechaInicio: '2027-03-01',
        temporadaId: null,
        adelantar: 1,
      }),
    )
  })

  it('shows the preview using the chosen fecha as the primera clase', () => {
    render(
      <OpenEdicionForm
        {...baseProps({ regimen: 'cadencia', clasesPorGrupo: 1, cadenciaDias: 7, cierreInscripcionOffsetDias: 0 })}
      />,
    )
    openForm()
    fireEvent.change(screen.getByLabelText(/primera clase/i), { target: { value: '2027-03-01' } })
    const text = screen.getByText(/se crearán 2 grupos y 1 clases por grupo/i)
    expect(text).toHaveTextContent(`primera clase ${fmt('2027-03-01')}`)
    expect(text).toHaveTextContent(`última ${fmt('2027-03-01')}`) // clasesPorGrupo=1 -> 0 days added
    expect(text).toHaveTextContent(`inscripción cierra ${fmt('2027-03-01')}`)
  })

  it('shows no preview before a fecha is chosen', () => {
    render(<OpenEdicionForm {...baseProps({ regimen: 'cadencia' })} />)
    openForm()
    expect(screen.queryByText(/se crearán/i)).not.toBeInTheDocument()
  })
})

// T1 (odd/tasks/proximo-paso.md, S1) — a taller anchored to the first
// Sunday of each month (Próximo Paso).
describe('OpenEdicionForm — régimen=cadencia anclado al primer domingo', () => {
  const anclado = { regimen: 'cadencia' as const, anclaEdiciones: 'primer_domingo_mes' as const, intervaloEdicionesDias: null }

  it('asks for a first Sunday and offers adelantar without an intervalo', () => {
    render(<OpenEdicionForm {...baseProps(anclado)} />)
    openForm()
    expect(screen.getByText('Elige el primer domingo del mes.')).toBeInTheDocument()
    expect(screen.getByLabelText(/crear también las próximas/i)).toBeInTheDocument()
    expect(screen.getByText('una por mes, el primer domingo')).toBeInTheDocument()
  })

  it('previews every edición on the first Sunday of its month', () => {
    render(<OpenEdicionForm {...baseProps({ ...anclado, clasesPorGrupo: 4, cadenciaDias: 7 })} />)
    openForm()
    fireEvent.change(screen.getByLabelText(/primera clase/i), { target: { value: '2026-10-04' } })
    fireEvent.change(screen.getByLabelText(/crear también las próximas/i), { target: { value: '3' } })
    expect(screen.getByText(/se crearán 2 grupos y 4 clases por grupo/i)).toHaveTextContent(
      `primera clase ${fmt('2026-10-04')}; última ${fmt('2026-10-25')}`,
    )
    expect(
      screen.getByText(
        `Se crearán 4 ediciones, una el primer domingo de cada mes: ${fmt('2026-10-04')}, ${fmt('2026-11-01')}, ${fmt('2026-12-06')}, ${fmt('2027-01-03')}.`,
      ),
    ).toBeInTheDocument()
  })

  it('refuses a date that is not a first Sunday before sending anything', () => {
    render(<OpenEdicionForm {...baseProps(anclado)} />)
    openForm()
    fireEvent.change(screen.getByLabelText(/primera clase/i), { target: { value: '2026-10-11' } })
    expect(screen.getByRole('alert')).toHaveTextContent('La primera clase debe ser el primer domingo del mes.')
    expect(screen.queryByText(/se crearán/i)).not.toBeInTheDocument()
    const submit = screen.getByRole('button', { name: /^crear edición$/i })
    expect(submit).toBeDisabled()
    fireEvent.click(submit)
    expect(crearEdicionMock).not.toHaveBeenCalled()
  })

  it('sends p_fecha_inicio and p_adelantar on submit', async () => {
    crearEdicionMock.mockResolvedValue({
      ok: true,
      ediciones: [
        { edicionId: 'e-1', nombre: 'Octubre 2026' },
        { edicionId: 'e-2', nombre: 'Noviembre 2026' },
      ],
    })
    render(<OpenEdicionForm {...baseProps(anclado)} />)
    openForm()
    fireEvent.change(screen.getByLabelText(/primera clase/i), { target: { value: '2026-10-04' } })
    fireEvent.change(screen.getByLabelText(/crear también las próximas/i), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: /^crear edición$/i }))
    await waitFor(() =>
      expect(crearEdicionMock).toHaveBeenCalledWith({
        tallerId: 't-1',
        tallerSlug: 'proximo-paso',
        fechaInicio: '2026-10-04',
        temporadaId: null,
        adelantar: 1,
      }),
    )
  })

  it('unanchored: keeps any date and shows no per-month list', () => {
    render(<OpenEdicionForm {...baseProps({ regimen: 'cadencia', intervaloEdicionesDias: 28 })} />)
    openForm()
    fireEvent.change(screen.getByLabelText(/primera clase/i), { target: { value: '2026-10-11' } })
    fireEvent.change(screen.getByLabelText(/crear también las próximas/i), { target: { value: '2' } })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText(/primer domingo/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^crear edición$/i })).toBeEnabled()
  })
})

describe('OpenEdicionForm — omitted-facilitadores preview', () => {
  it('shows the warning with its exact copy when non-empty', () => {
    render(
      <OpenEdicionForm
        {...baseProps({
          regimen: 'cadencia',
          facilitadoresOmitidosPreview: [{ personaId: 'p-9', nombre: 'Marta Díaz', plantillaGrupo: 'Grupo Alfa' }],
        })}
      />,
    )
    openForm()
    fireEvent.change(screen.getByLabelText(/primera clase/i), { target: { value: '2027-03-01' } })
    const warning = screen.getByRole('alert')
    expect(warning).toHaveTextContent(/no se asignarán porque ya no sirven en este equipo/i)
    expect(warning).toHaveTextContent(/Marta Díaz/)
    expect(warning).toHaveTextContent(/Grupo Alfa/)
  })
})

describe('OpenEdicionForm — submit outcomes', () => {
  it('redirects to rutaEdicion when exactly one edición was created', async () => {
    crearEdicionMock.mockResolvedValue({ ok: true, ediciones: [{ edicionId: 'e-42', nombre: 'Marzo 2027' }] })
    render(<OpenEdicionForm {...baseProps({ regimen: 'cadencia' })} />)
    openForm()
    fireEvent.change(screen.getByLabelText(/primera clase/i), { target: { value: '2027-03-01' } })
    fireEvent.click(screen.getByRole('button', { name: /^crear edición$/i }))
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith(rutaEdicion('proximo-paso', 'e-42')))
  })

  it('redirects to the taller page with ?creadas=N when more than one edición was created', async () => {
    crearEdicionMock.mockResolvedValue({
      ok: true,
      ediciones: [
        { edicionId: 'e-1', nombre: 'Marzo 2027' },
        { edicionId: 'e-2', nombre: 'Abril 2027' },
        { edicionId: 'e-3', nombre: 'Mayo 2027' },
      ],
    })
    render(<OpenEdicionForm {...baseProps({ regimen: 'cadencia', intervaloEdicionesDias: 28 })} />)
    openForm()
    fireEvent.change(screen.getByLabelText(/primera clase/i), { target: { value: '2027-03-01' } })
    fireEvent.change(screen.getByLabelText(/crear también las próximas/i), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: /^crear edición$/i }))
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith(`${rutaTaller('proximo-paso')}?creadas=3`))
  })

  it('shows the mapped error message and does not redirect when the RPC fails', async () => {
    crearEdicionMock.mockResolvedValue({ ok: false, error: 'conflict', message: 'Este taller ya tiene una edición en esa temporada.' })
    render(<OpenEdicionForm {...baseProps({ regimen: 'cadencia' })} />)
    openForm()
    fireEvent.change(screen.getByLabelText(/primera clase/i), { target: { value: '2027-03-01' } })
    fireEvent.click(screen.getByRole('button', { name: /^crear edición$/i }))
    expect(await screen.findByText('Este taller ya tiene una edición en esa temporada.')).toBeInTheDocument()
    expect(pushMock).not.toHaveBeenCalled()
  })
})

// T10 (odd/tasks/talleres-reserva-publica.md, S6) — «Lugar» and
// «Indicaciones para los participantes», optional, sent with the creation.
describe('OpenEdicionForm — lugar e indicaciones (T10)', () => {
  it('shows both optional fields with their limits and hint', () => {
    render(<OpenEdicionForm {...baseProps({ regimen: 'cadencia' })} />)
    openForm()
    expect(screen.getByLabelText('Lugar')).toHaveAttribute('maxLength', '200')
    expect(screen.getByLabelText('Indicaciones para los participantes')).toHaveAttribute('maxLength', '500')
    expect(screen.getByText(/Qué traer, por dónde entrar, estacionamiento…/)).toBeInTheDocument()
  })

  it('sends them with the creation when filled', async () => {
    crearEdicionMock.mockResolvedValue({ ok: true, ediciones: [{ edicionId: 'e-1', nombre: 'Marzo 2027' }] })
    render(<OpenEdicionForm {...baseProps({ regimen: 'cadencia' })} />)
    openForm()
    fireEvent.change(screen.getByLabelText(/primera clase/i), { target: { value: '2027-03-01' } })
    fireEvent.change(screen.getByLabelText('Lugar'), { target: { value: 'Salón 2' } })
    fireEvent.change(screen.getByLabelText('Indicaciones para los participantes'), { target: { value: 'Trae tu Biblia' } })
    fireEvent.click(screen.getByRole('button', { name: /^crear edición$/i }))
    await waitFor(() =>
      expect(crearEdicionMock).toHaveBeenCalledWith({
        tallerId: 't-1',
        tallerSlug: 'proximo-paso',
        fechaInicio: '2027-03-01',
        temporadaId: null,
        adelantar: 0,
        lugar: 'Salón 2',
        indicaciones: 'Trae tu Biblia',
      }),
    )
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith(rutaEdicion('proximo-paso', 'e-1')))
  })

  it('hides them when a temporada taller has no temporada to pick', () => {
    render(<OpenEdicionForm {...baseProps({ regimen: 'temporada', temporadasDisponibles: [] })} />)
    openForm()
    expect(screen.queryByLabelText('Lugar')).not.toBeInTheDocument()
  })
})
