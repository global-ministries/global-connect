/**
 * @jest-environment jsdom
 *
 * T11 (odd/tasks/talleres-configuracion-del-taller.md) — "Crear edición"
 * (renamed from "Abrir nueva edición"/"Abrir edición"): before submitting,
 * the dialog shows a PREVIEW computed from props the taller page already
 * has — "Se crearán N grupos y M clases por grupo" (or, when the taller has
 * no active plantilla clases, a notice asking how many classes it will
 * have) and the list of plantilla facilitadores that will be omitted
 * because they are no longer active servidores of this equipo. On a
 * successful create, the form redirects to the new edición's page
 * (rutaEdicion) instead of showing a success card on the taller page.
 *
 * T3's earlier behaviour (no "sesiones estimadas" field when the taller has
 * an active plantilla; the old field as a fallback otherwise) is preserved
 * — only the copy, the preview, and the post-submit behaviour changed.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const openEdicionMock = jest.fn()
const pushMock = jest.fn()

jest.mock('@/app/(auth)/admin/talleres/abstracto/[slug]/actions', () => ({
  openEdicion: (...args: unknown[]) => openEdicionMock(...args),
}))

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

import { OpenEdicionForm } from '@/components/talleres/open-edicion-form'
import { rutaEdicion } from '@/lib/platform/talleres/rutas'

function baseProps(overrides: Partial<Parameters<typeof OpenEdicionForm>[0]> = {}) {
  return {
    tallerId: 't-1',
    tallerSlug: 'proximo-paso',
    tallerNombre: 'Próximo Paso',
    defaultModalidad: 'periodo_general' as const,
    temporadasAbiertas: [],
    sesionesEstimadas: 4,
    gruposPlantillaActivos: 2,
    facilitadoresOmitidosPreview: [],
    ...overrides,
  }
}

beforeEach(() => {
  openEdicionMock.mockReset()
  pushMock.mockReset()
})

function openForm() {
  fireEvent.click(screen.getByRole('button', { name: /crear edición/i }))
}

describe('OpenEdicionForm — T10: trigger opens a Dialog, neutral copy', () => {
  it('does not render the form fields before the trigger is clicked', () => {
    render(<OpenEdicionForm {...baseProps()} />)
    expect(screen.queryByLabelText(/fecha inicio/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^crear edición$/i })).toBeInTheDocument()
  })

  it('opens the form inside a dialog when the trigger is clicked', () => {
    render(<OpenEdicionForm {...baseProps()} />)
    openForm()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByLabelText(/fecha inicio/i)).toBeInTheDocument()
  })

  it('uses neutral Spanish copy (no voseo) in the dialog description', () => {
    render(<OpenEdicionForm {...baseProps()} />)
    openForm()
    expect(screen.queryByText(/podés/i)).not.toBeInTheDocument()
    expect(screen.getByText(/puedes abrirla/i)).toBeInTheDocument()
  })

  it('uses neutral Spanish copy (no voseo) in the temporada helper text', () => {
    render(
      <OpenEdicionForm
        {...baseProps({ temporadasAbiertas: [{ id: 'temp-1', nombre: 'Temporada 2026' }] })}
      />,
    )
    openForm()
    expect(screen.queryByText(/Vinculá/i)).not.toBeInTheDocument()
    expect(screen.getByText(/Vincula esta edición/i)).toBeInTheDocument()
  })
})

describe('OpenEdicionForm — T11: renamed to "Crear edición" everywhere', () => {
  it('names the trigger "Crear edición"', () => {
    render(<OpenEdicionForm {...baseProps()} />)
    expect(screen.getByRole('button', { name: /^crear edición$/i })).toBeInTheDocument()
  })

  it('names the dialog title "Crear edición de {taller}"', () => {
    render(<OpenEdicionForm {...baseProps()} />)
    openForm()
    expect(screen.getByRole('heading', { name: /crear edición de próximo paso/i })).toBeInTheDocument()
  })

  it('names the submit button "Crear edición" and its pending state "Creando…"', async () => {
    let resolveOpen: (value: unknown) => void = () => {}
    openEdicionMock.mockReturnValue(new Promise((resolve) => (resolveOpen = resolve)))
    render(<OpenEdicionForm {...baseProps()} />)
    openForm()
    fireEvent.change(screen.getByPlaceholderText(/Otoño 2026/i), { target: { value: 'Primavera 2027' } })
    fireEvent.change(screen.getByLabelText(/fecha inicio/i), { target: { value: '2027-03-01' } })
    fireEvent.click(screen.getByRole('button', { name: /^crear edición$/i }))
    await screen.findByText(/creando…/i)
    resolveOpen({
      ok: true,
      edicionId: 'e-1',
      periodoId: null,
      temporadaId: null,
      gruposCreados: [],
      facilitadoresOmitidos: [],
      clasesPorGrupo: 0,
    })
  })
})

describe('OpenEdicionForm — no "sesiones estimadas" field', () => {
  it('never shows a sesiones/duración (semanas) field', () => {
    render(<OpenEdicionForm {...baseProps()} />)
    openForm()
    expect(screen.queryByText(/sesiones estimadas/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/duración \(semanas\)/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/sesiones/i)).not.toBeInTheDocument()
  })

  it('still shows the unrelated "Duración por sesión (min)" field', () => {
    render(<OpenEdicionForm {...baseProps()} />)
    openForm()
    expect(screen.getByText(/duración por sesión \(min\)/i)).toBeInTheDocument()
  })

  it('sends the sesionesEstimadas prop (never a user-typed value) as sesiones_estimadas', async () => {
    openEdicionMock.mockResolvedValue({
      ok: true,
      edicionId: 'e-1',
      periodoId: null,
      temporadaId: null,
      gruposCreados: [],
      facilitadoresOmitidos: [],
      clasesPorGrupo: 0,
    })
    render(<OpenEdicionForm {...baseProps({ sesionesEstimadas: 4 })} />)
    openForm()
    fireEvent.change(screen.getByPlaceholderText(/Otoño 2026/i), { target: { value: 'Primavera 2027' } })
    fireEvent.change(screen.getByLabelText(/fecha inicio/i), { target: { value: '2027-03-01' } })
    fireEvent.click(screen.getByRole('button', { name: /^crear edición$/i }))
    await waitFor(() =>
      expect(openEdicionMock).toHaveBeenCalledWith(expect.objectContaining({ sesiones_estimadas: 4 })),
    )
  })
})

describe('OpenEdicionForm — no plantilla yet (sesionesEstimadas: null)', () => {
  it('shows the old sesiones field, defaulting to 1, with its helper text', () => {
    render(<OpenEdicionForm {...baseProps({ sesionesEstimadas: null })} />)
    openForm()
    const sesionesInput = screen.getByLabelText(/duración \(semanas\)/i)
    expect(sesionesInput).toHaveValue(1)
    expect(sesionesInput).toHaveAttribute('min', '1')
    expect(screen.getByText(/1 semana = 1 sesión/i)).toBeInTheDocument()
  })

  it('shows a notice asking how many clases the edición will have', () => {
    render(<OpenEdicionForm {...baseProps({ sesionesEstimadas: null })} />)
    openForm()
    expect(
      screen.getByText(/este taller no tiene clases en la plantilla: indica cuántas clases tendrá/i),
    ).toBeInTheDocument()
  })

  it('sends the user-entered value as sesiones_estimadas', async () => {
    openEdicionMock.mockResolvedValue({
      ok: true,
      edicionId: 'e-1',
      periodoId: null,
      temporadaId: null,
      gruposCreados: [],
      facilitadoresOmitidos: [],
      clasesPorGrupo: 0,
    })
    render(<OpenEdicionForm {...baseProps({ sesionesEstimadas: null })} />)
    openForm()
    fireEvent.change(screen.getByPlaceholderText(/Otoño 2026/i), { target: { value: 'Primavera 2027' } })
    fireEvent.change(screen.getByLabelText(/duración \(semanas\)/i), { target: { value: '8' } })
    fireEvent.change(screen.getByLabelText(/fecha inicio/i), { target: { value: '2027-03-01' } })
    fireEvent.click(screen.getByRole('button', { name: /^crear edición$/i }))
    await waitFor(() =>
      expect(openEdicionMock).toHaveBeenCalledWith(expect.objectContaining({ sesiones_estimadas: 8 })),
    )
  })
})

describe('OpenEdicionForm — T11: preview before confirming', () => {
  it('shows "Se crearán N grupos y M clases por grupo" when the taller has an active plantilla', () => {
    render(<OpenEdicionForm {...baseProps({ gruposPlantillaActivos: 2, sesionesEstimadas: 4 })} />)
    openForm()
    expect(screen.getByText(/se crearán 2 grupos y 4 clases por grupo/i)).toBeInTheDocument()
  })

  it('shows the omitted-facilitadores preview with its exact copy when non-empty', () => {
    render(
      <OpenEdicionForm
        {...baseProps({
          facilitadoresOmitidosPreview: [
            { personaId: 'p-9', nombre: 'Marta Díaz', plantillaGrupo: 'Grupo Alfa' },
          ],
        })}
      />,
    )
    openForm()
    const warning = screen.getByRole('alert')
    expect(warning).toHaveTextContent(/no se asignarán porque ya no sirven en este equipo/i)
    expect(warning).toHaveTextContent(/Marta Díaz/)
    expect(warning).toHaveTextContent(/Grupo Alfa/)
  })

  it('shows no omitted-facilitadores warning when the preview list is empty', () => {
    render(<OpenEdicionForm {...baseProps({ facilitadoresOmitidosPreview: [] })} />)
    openForm()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('OpenEdicionForm — T11: redirects to the new edición, no success card', () => {
  function submitValidForm() {
    openForm()
    fireEvent.change(screen.getByPlaceholderText(/Otoño 2026/i), { target: { value: 'Primavera 2027' } })
    fireEvent.change(screen.getByLabelText(/fecha inicio/i), { target: { value: '2027-03-01' } })
    fireEvent.click(screen.getByRole('button', { name: /^crear edición$/i }))
  }

  it('redirects to rutaEdicion(tallerSlug, edicionId) on success', async () => {
    openEdicionMock.mockResolvedValue({
      ok: true,
      edicionId: 'e-42',
      periodoId: null,
      temporadaId: null,
      gruposCreados: [{ grupoId: 'g-1', nombre: 'Grupo Alfa', facilitadoresAsignados: 1 }],
      facilitadoresOmitidos: [],
      clasesPorGrupo: 4,
    })
    render(<OpenEdicionForm {...baseProps({ tallerSlug: 'proximo-paso' })} />)
    submitValidForm()

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith(rutaEdicion('proximo-paso', 'e-42')))
  })

  it('never shows a post-success summary card on the taller page', async () => {
    openEdicionMock.mockResolvedValue({
      ok: true,
      edicionId: 'e-1',
      periodoId: null,
      temporadaId: null,
      gruposCreados: [{ grupoId: 'g-1', nombre: 'Grupo Alfa', facilitadoresAsignados: 1 }],
      facilitadoresOmitidos: [],
      clasesPorGrupo: 4,
    })
    render(<OpenEdicionForm {...baseProps()} />)
    submitValidForm()

    await waitFor(() => expect(pushMock).toHaveBeenCalled())
    expect(screen.queryByText(/edición abierta/i)).not.toBeInTheDocument()
  })

  it('shows the RPC error message and does not redirect when the create fails', async () => {
    openEdicionMock.mockResolvedValue({ ok: false, error: 'internal', message: 'Algo salió mal.' })
    render(<OpenEdicionForm {...baseProps()} />)
    submitValidForm()

    expect(await screen.findByText('Algo salió mal.')).toBeInTheDocument()
    expect(pushMock).not.toHaveBeenCalled()
  })
})
