/**
 * @jest-environment jsdom
 *
 * T3 (odd/tasks/talleres-configuracion-del-taller.md) — OpenEdicionForm
 * asks for "sesiones estimadas" ONLY when the taller has no active
 * plantilla clases (acceptance criterion 8: a taller with no plantilla
 * keeps behaving exactly as before). The page passes `sesionesEstimadas`
 * as `null` in that case — the form then shows its own original
 * "Duración (semanas)" field (label, min=1, default=1, the "1 semana = 1
 * sesión" helper text) and sends whatever the user types. When the
 * taller DOES have an active plantilla, the page passes the derived
 * count as a number, the field is hidden, and that number is sent
 * as-is — never a user-typed value.
 *
 * After a successful open, the form shows the instantiation summary
 * open_edicion now returns (T2, migration 20260927100000_talleres_
 * instanciar_edicion.sql): grupos creados, clases por grupo, and a
 * warning naming any facilitadores_omitidos (a paused Dream Team servicio
 * skipped at instantiation time).
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const openEdicionMock = jest.fn()
const refreshMock = jest.fn()

jest.mock('@/app/(auth)/admin/talleres/abstracto/[slug]/actions', () => ({
  openEdicion: (...args: unknown[]) => openEdicionMock(...args),
}))

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}))

import { OpenEdicionForm } from '@/components/talleres/open-edicion-form'

function baseProps(overrides: Partial<Parameters<typeof OpenEdicionForm>[0]> = {}) {
  return {
    tallerId: 't-1',
    tallerNombre: 'Próximo Paso',
    defaultModalidad: 'periodo_general' as const,
    temporadasAbiertas: [],
    sesionesEstimadas: 4,
    ...overrides,
  }
}

beforeEach(() => {
  openEdicionMock.mockReset()
  refreshMock.mockReset()
})

function openForm() {
  fireEvent.click(screen.getByRole('button', { name: /abrir nueva edición/i }))
}

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
    fireEvent.click(screen.getByRole('button', { name: /^abrir edición$/i }))
    await waitFor(() =>
      expect(openEdicionMock).toHaveBeenCalledWith(expect.objectContaining({ sesiones_estimadas: 4 })),
    )
    await screen.findByText(/0 grupos/i)
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
    fireEvent.click(screen.getByRole('button', { name: /^abrir edición$/i }))
    await waitFor(() =>
      expect(openEdicionMock).toHaveBeenCalledWith(expect.objectContaining({ sesiones_estimadas: 8 })),
    )
  })
})

describe('OpenEdicionForm — instantiation summary', () => {
  function submitValidForm() {
    openForm()
    fireEvent.change(screen.getByPlaceholderText(/Otoño 2026/i), { target: { value: 'Primavera 2027' } })
    fireEvent.change(screen.getByLabelText(/fecha inicio/i), { target: { value: '2027-03-01' } })
    fireEvent.click(screen.getByRole('button', { name: /^abrir edición$/i }))
  }

  it('shows grupos creados and clases por grupo on success', async () => {
    openEdicionMock.mockResolvedValue({
      ok: true,
      edicionId: 'e-1',
      periodoId: null,
      temporadaId: null,
      gruposCreados: [
        { grupoId: 'g-1', nombre: 'Grupo Alfa', facilitadoresAsignados: 1 },
        { grupoId: 'g-2', nombre: 'Grupo Beta', facilitadoresAsignados: 2 },
      ],
      facilitadoresOmitidos: [],
      clasesPorGrupo: 4,
    })
    render(<OpenEdicionForm {...baseProps()} />)
    submitValidForm()

    expect(await screen.findByText(/2 grupos/i)).toBeInTheDocument()
    expect(screen.getByText(/4 clases por grupo/i)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows a warning listing omitted facilitadores by name when non-empty', async () => {
    openEdicionMock.mockResolvedValue({
      ok: true,
      edicionId: 'e-1',
      periodoId: null,
      temporadaId: null,
      gruposCreados: [{ grupoId: 'g-1', nombre: 'Grupo Alfa', facilitadoresAsignados: 0 }],
      facilitadoresOmitidos: [
        { personaId: 'p-9', nombre: 'Marta', apellido: 'Díaz', plantillaGrupo: 'Grupo Alfa' },
      ],
      clasesPorGrupo: 4,
    })
    render(<OpenEdicionForm {...baseProps()} />)
    submitValidForm()

    const warning = await screen.findByRole('alert')
    expect(warning).toHaveTextContent(/Marta Díaz/)
    expect(warning).toHaveTextContent(/Grupo Alfa/)
  })

  it('shows no warning when facilitadoresOmitidos is empty', async () => {
    openEdicionMock.mockResolvedValue({
      ok: true,
      edicionId: 'e-1',
      periodoId: null,
      temporadaId: null,
      gruposCreados: [],
      facilitadoresOmitidos: [],
      clasesPorGrupo: 0,
    })
    render(<OpenEdicionForm {...baseProps()} />)
    submitValidForm()

    await screen.findByText(/0 grupos/i)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
