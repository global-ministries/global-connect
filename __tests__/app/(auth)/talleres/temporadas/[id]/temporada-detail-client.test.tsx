/**
 * @jest-environment jsdom
 *
 * T5 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) — the temporada
 * detail's client controls: estado transitions (Abrir/Cerrar immediate,
 * Cancelar behind a confirm dialog — same shape as CancelarEdicionButton,
 * __tests__/components/talleres/open-edicion-button.test.tsx), the
 * "Talleres y ediciones" list (edición state/dates/inscritos, a "Quitar"
 * icon per row behind its own confirm dialog, surfacing EDICION_CON_
 * INSCRITOS verbatim), and "Agregar taller" (select + button).
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const transitionTemporadaMock = jest.fn()
const agregarTallerATemporadaMock = jest.fn()
const quitarTallerDeTemporadaMock = jest.fn()
const refreshMock = jest.fn()

jest.mock('@/app/(auth)/talleres/temporadas/actions', () => ({
  transitionTemporada: (...args: unknown[]) => transitionTemporadaMock(...args),
  agregarTallerATemporada: (...args: unknown[]) => agregarTallerATemporadaMock(...args),
  quitarTallerDeTemporada: (...args: unknown[]) => quitarTallerDeTemporadaMock(...args),
}))

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}))

import { TemporadaDetailClient } from '@/app/(auth)/talleres/temporadas/[id]/temporada-detail-client'
import type { TallerConEdicionDeTemporada, TallerOption } from '@/lib/platform/talleres/temporadas'

function tallerEnTemporada(overrides: Partial<TallerConEdicionDeTemporada> = {}): TallerConEdicionDeTemporada {
  return {
    id: 't-1',
    nombre: 'Matrimonio',
    slug: 'matrimonio',
    edicion: {
      id: 'ed-1',
      nombre_snapshot: 'Otoño 2026',
      estado: 'abierto',
      fecha_inicio: '2026-09-01',
      fecha_fin: '2026-10-15',
      total_inscripciones: 0,
    },
    ...overrides,
  }
}

function disponible(overrides: Partial<TallerOption> = {}): TallerOption {
  return { id: 't-2', nombre: 'Parejas', slug: 'parejas', ...overrides }
}

function baseProps(overrides: Partial<Parameters<typeof TemporadaDetailClient>[0]> = {}) {
  return {
    temporadaId: 'temp-1',
    estado: 'borrador' as const,
    canWrite: true,
    talleresEnTemporada: [tallerEnTemporada()],
    talleresDisponibles: [disponible()],
    ...overrides,
  }
}

beforeEach(() => {
  transitionTemporadaMock.mockReset()
  agregarTallerATemporadaMock.mockReset()
  quitarTallerDeTemporadaMock.mockReset()
  refreshMock.mockReset()
})

describe('TemporadaDetailClient — estado transitions', () => {
  it('runs Abrir immediately (no confirm dialog)', async () => {
    transitionTemporadaMock.mockResolvedValue({ ok: true })
    render(<TemporadaDetailClient {...baseProps({ estado: 'borrador' })} />)
    fireEvent.click(screen.getByRole('button', { name: /abrir temporada/i }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() =>
      expect(transitionTemporadaMock).toHaveBeenCalledWith({ temporadaId: 'temp-1', next: 'abierto' }),
    )
    await waitFor(() => expect(refreshMock).toHaveBeenCalled())
  })

  it('opens a confirm dialog for Cancelar and does not call the action before confirming', () => {
    render(<TemporadaDetailClient {...baseProps({ estado: 'borrador' })} />)
    fireEvent.click(screen.getByRole('button', { name: /^cancelar$/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(transitionTemporadaMock).not.toHaveBeenCalled()
  })

  it('calls transitionTemporada with next=cancelado on confirm', async () => {
    transitionTemporadaMock.mockResolvedValue({ ok: true })
    render(<TemporadaDetailClient {...baseProps({ estado: 'abierto' })} />)
    fireEvent.click(screen.getByRole('button', { name: /^cancelar$/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirmar cancelación/i }))
    await waitFor(() =>
      expect(transitionTemporadaMock).toHaveBeenCalledWith({ temporadaId: 'temp-1', next: 'cancelado' }),
    )
  })

  it('hides the estado card entirely when canWrite is false', () => {
    render(<TemporadaDetailClient {...baseProps({ canWrite: false, estado: 'borrador' })} />)
    expect(screen.queryByRole('button', { name: /abrir temporada/i })).not.toBeInTheDocument()
  })
})

describe('TemporadaDetailClient — talleres y ediciones', () => {
  it('shows the edición nombre, effective state badge, dates and inscritos', () => {
    render(
      <TemporadaDetailClient
        {...baseProps({
          talleresEnTemporada: [
            tallerEnTemporada({
              edicion: {
                id: 'ed-1',
                nombre_snapshot: 'Otoño 2026',
                estado: 'en_curso',
                fecha_inicio: '2026-09-01',
                fecha_fin: '2026-10-15',
                total_inscripciones: 2,
              },
            }),
          ],
        })}
      />,
    )
    expect(screen.getByRole('link', { name: /otoño 2026/i })).toHaveAttribute(
      'href',
      '/talleres/matrimonio/ed-1',
    )
    expect(screen.getByText(/en curso/i)).toBeInTheDocument()
    expect(screen.getByText(/2 inscritos/i)).toBeInTheDocument()
  })

  it('shows an empty-state message when there are no talleres yet', () => {
    render(<TemporadaDetailClient {...baseProps({ talleresEnTemporada: [] })} />)
    expect(screen.getByText(/todavía no hay talleres en esta temporada/i)).toBeInTheDocument()
  })

  it('the "Quitar" icon carries an aria-label with the taller name and opens a confirm dialog', () => {
    render(<TemporadaDetailClient {...baseProps()} />)
    const boton = screen.getByRole('button', { name: /quitar matrimonio de la temporada/i })
    fireEvent.click(boton)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(quitarTallerDeTemporadaMock).not.toHaveBeenCalled()
  })

  it('hides "Quitar" when canWrite is false', () => {
    render(<TemporadaDetailClient {...baseProps({ canWrite: false })} />)
    expect(screen.queryByRole('button', { name: /quitar matrimonio/i })).not.toBeInTheDocument()
  })

  it('calls quitarTallerDeTemporada on confirm and refreshes on success', async () => {
    quitarTallerDeTemporadaMock.mockResolvedValue({ ok: true })
    render(<TemporadaDetailClient {...baseProps()} />)
    fireEvent.click(screen.getByRole('button', { name: /quitar matrimonio de la temporada/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }))
    await waitFor(() =>
      expect(quitarTallerDeTemporadaMock).toHaveBeenCalledWith({ temporadaId: 'temp-1', tallerId: 't-1' }),
    )
    await waitFor(() => expect(refreshMock).toHaveBeenCalled())
  })

  it('shows the exact EDICION_CON_INSCRITOS message and keeps the dialog open on failure', async () => {
    quitarTallerDeTemporadaMock.mockResolvedValue({
      ok: false,
      error: 'invalid-input',
      message: 'No se puede quitar: la edición ya tiene inscritos. Cancela la edición desde su pantalla.',
    })
    render(<TemporadaDetailClient {...baseProps()} />)
    fireEvent.click(screen.getByRole('button', { name: /quitar matrimonio de la temporada/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }))
    expect(
      await screen.findByText('No se puede quitar: la edición ya tiene inscritos. Cancela la edición desde su pantalla.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

describe('TemporadaDetailClient — agregar taller', () => {
  it('shows a select of talleresDisponibles and an Agregar button, disabled until one is chosen', () => {
    render(<TemporadaDetailClient {...baseProps()} />)
    expect(screen.getByRole('button', { name: /^agregar$/i })).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/^taller$/i), { target: { value: 't-2' } })
    expect(screen.getByRole('button', { name: /^agregar$/i })).toBeEnabled()
  })

  it('calls agregarTallerATemporada with the chosen tallerId and refreshes on success', async () => {
    agregarTallerATemporadaMock.mockResolvedValue({ ok: true })
    render(<TemporadaDetailClient {...baseProps()} />)
    fireEvent.change(screen.getByLabelText(/^taller$/i), { target: { value: 't-2' } })
    fireEvent.click(screen.getByRole('button', { name: /^agregar$/i }))
    await waitFor(() =>
      expect(agregarTallerATemporadaMock).toHaveBeenCalledWith({ temporadaId: 'temp-1', tallerId: 't-2' }),
    )
    await waitFor(() => expect(refreshMock).toHaveBeenCalled())
  })

  it('shows a message when there are no talleres available to add', () => {
    render(<TemporadaDetailClient {...baseProps({ talleresDisponibles: [] })} />)
    expect(screen.getByText(/no hay talleres disponibles para agregar/i)).toBeInTheDocument()
  })

  it('hides "Agregar taller" entirely when canWrite is false', () => {
    render(<TemporadaDetailClient {...baseProps({ canWrite: false })} />)
    expect(screen.queryByText(/agregar taller/i)).not.toBeInTheDocument()
  })
})

describe('TemporadaDetailClient — neutral Spanish (no voseo)', () => {
  it('never uses voseo copy', () => {
    render(<TemporadaDetailClient {...baseProps()} />)
    expect(screen.queryByText(/tenés|podés|elegí\b/i)).not.toBeInTheDocument()
  })
})
