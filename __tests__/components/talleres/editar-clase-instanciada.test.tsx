/**
 * @jest-environment jsdom
 *
 * T4 (odd/tasks/talleres-configuracion-del-taller.md) — in-place edit of an
 * instantiated clase's tema and fecha_programada, from the grupo screen.
 * The page (server component) only renders this control when
 * permisos.editarEdicion is granted AND the clase isn't cerrada — this
 * component itself never re-derives either check, it only calls the
 * server action and surfaces its result.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const editarClaseInstanciadaMock = jest.fn()
const refreshMock = jest.fn()

jest.mock('@/app/(auth)/talleres/[taller]/[edicion]/[grupo]/actions', () => ({
  editarClaseInstanciada: (...args: unknown[]) => editarClaseInstanciadaMock(...args),
}))

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}))

import { EditarClaseInstanciada } from '@/components/talleres/editar-clase-instanciada'

function baseProps(overrides: Partial<Parameters<typeof EditarClaseInstanciada>[0]> = {}) {
  return {
    tallerSlug: 'proximo-paso',
    edicionId: 'e-1',
    grupoId: 'g-1',
    sesionId: 's-2',
    numero: 2,
    tema: null,
    fechaProgramada: '2026-10-13',
    ...overrides,
  }
}

beforeEach(() => {
  editarClaseInstanciadaMock.mockReset()
  refreshMock.mockReset()
})

describe('EditarClaseInstanciada — toggling', () => {
  it('shows an edit affordance and opens the tema/fecha form on click', () => {
    render(<EditarClaseInstanciada {...baseProps({ tema: 'Introducción' })} />)
    fireEvent.click(screen.getByRole('button', { name: /editar clase/i }))
    expect(screen.getByLabelText(/tema de la clase/i)).toHaveValue('Introducción')
    expect(screen.getByLabelText(/fecha programada/i)).toHaveValue('2026-10-13')
  })

  it('prefills an empty tema input when the clase has none yet', () => {
    render(<EditarClaseInstanciada {...baseProps({ tema: null })} />)
    fireEvent.click(screen.getByRole('button', { name: /editar clase/i }))
    expect(screen.getByLabelText(/tema de la clase/i)).toHaveValue('')
  })

  // T10 (odd/tasks/talleres-configuracion-del-taller.md, design audit) — the
  // aria-label used to be the generic "Editar clase"; it now names the
  // exact clase it edits, plus a title, matching the icon-only action
  // convention the rest of T10 gave plantilla-clases-section/
  // plantilla-grupos-section/grupos-section.
  it('names the exact clase in its aria-label and title', () => {
    render(<EditarClaseInstanciada {...baseProps({ numero: 3 })} />)
    const boton = screen.getByRole('button', { name: 'Editar clase 3' })
    expect(boton).toHaveAttribute('title', 'Editar clase')
  })
})

describe('EditarClaseInstanciada — guardar', () => {
  it('calls editarClaseInstanciada with the edited tema/fecha and refreshes on success', async () => {
    editarClaseInstanciadaMock.mockResolvedValue({ ok: true })
    render(<EditarClaseInstanciada {...baseProps({ tema: 'Vieja' })} />)
    fireEvent.click(screen.getByRole('button', { name: /editar clase/i }))
    fireEvent.change(screen.getByLabelText(/tema de la clase/i), { target: { value: 'Intimidad con Dios' } })
    fireEvent.change(screen.getByLabelText(/fecha programada/i), { target: { value: '2026-10-20' } })
    fireEvent.click(screen.getByRole('button', { name: /guardar clase/i }))

    expect(editarClaseInstanciadaMock).toHaveBeenCalledWith({
      tallerSlug: 'proximo-paso',
      edicionId: 'e-1',
      grupoId: 'g-1',
      sesionId: 's-2',
      tema: 'Intimidad con Dios',
      fechaProgramada: '2026-10-20',
    })
    await waitFor(() => expect(refreshMock).toHaveBeenCalled())
  })

  it('maps CLASE_CERRADA (or any other action error) to a visible alert', async () => {
    editarClaseInstanciadaMock.mockResolvedValue({
      ok: false,
      error: 'conflict',
      message: 'Esta clase ya está cerrada; no admite cambios.',
    })
    render(<EditarClaseInstanciada {...baseProps({ tema: 'Vieja' })} />)
    fireEvent.click(screen.getByRole('button', { name: /editar clase/i }))
    fireEvent.click(screen.getByRole('button', { name: /guardar clase/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Esta clase ya está cerrada; no admite cambios.',
    )
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('closes the form without saving on cancel', () => {
    render(<EditarClaseInstanciada {...baseProps({ tema: 'Vieja' })} />)
    fireEvent.click(screen.getByRole('button', { name: /editar clase/i }))
    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }))
    expect(screen.queryByLabelText(/tema de la clase/i)).not.toBeInTheDocument()
    expect(editarClaseInstanciadaMock).not.toHaveBeenCalled()
  })
})
