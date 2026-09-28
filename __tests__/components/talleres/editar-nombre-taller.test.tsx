/**
 * @jest-environment jsdom
 *
 * T3 (odd/tasks/talleres-configuracion-del-taller.md) — the cabecera's
 * inline "editar nombre" control. Only rendered by the page when
 * permisos.editarTaller is granted (same gating pattern as
 * OpenEdicionForm/AssignServicioForm — the PAGE decides whether the
 * component exists at all, this component never re-derives a capability),
 * so it has no `puedeEditar` prop of its own: it always shows the pencil
 * action, a 44px touch target (docs/talleres-de-punta-a-punta.md §9).
 */

import { fireEvent, render, screen } from '@testing-library/react'

const updateTallerNombreMock = jest.fn()
const refreshMock = jest.fn()

jest.mock('@/app/(auth)/talleres/[taller]/actions', () => ({
  updateTallerNombre: (...args: unknown[]) => updateTallerNombreMock(...args),
}))

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}))

import { EditarNombreTaller } from '@/components/talleres/editar-nombre-taller'

beforeEach(() => {
  updateTallerNombreMock.mockReset()
  refreshMock.mockReset()
})

describe('EditarNombreTaller', () => {
  it('shows the current nombre and an Editar action', () => {
    render(<EditarNombreTaller tallerId="t-1" tallerSlug="proximo-paso" nombre="Próximo Paso" />)
    expect(screen.getByText('Próximo Paso')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /editar/i })).toBeInTheDocument()
  })

  it('opens an input pre-filled with the current nombre on Editar', () => {
    render(<EditarNombreTaller tallerId="t-1" tallerSlug="proximo-paso" nombre="Próximo Paso" />)
    fireEvent.click(screen.getByRole('button', { name: /editar/i }))
    expect(screen.getByRole('textbox')).toHaveValue('Próximo Paso')
    expect(screen.getByRole('button', { name: /guardar/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cancelar/i })).toBeInTheDocument()
  })

  it('cancelling discards the edit without calling the action', () => {
    render(<EditarNombreTaller tallerId="t-1" tallerSlug="proximo-paso" nombre="Próximo Paso" />)
    fireEvent.click(screen.getByRole('button', { name: /editar/i }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Otro nombre' } })
    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }))
    expect(screen.getByText('Próximo Paso')).toBeInTheDocument()
    expect(updateTallerNombreMock).not.toHaveBeenCalled()
  })

  it('saves the trimmed nombre and refreshes on success', async () => {
    updateTallerNombreMock.mockResolvedValue({ ok: true, nombre: 'Nombre nuevo' })
    render(<EditarNombreTaller tallerId="t-1" tallerSlug="proximo-paso" nombre="Próximo Paso" />)
    fireEvent.click(screen.getByRole('button', { name: /editar/i }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '  Nombre nuevo  ' } })
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }))

    expect(await screen.findByText('Nombre nuevo')).toBeInTheDocument()
    expect(updateTallerNombreMock).toHaveBeenCalledWith({
      tallerId: 't-1',
      tallerSlug: 'proximo-paso',
      nombre: 'Nombre nuevo',
    })
    expect(refreshMock).toHaveBeenCalledTimes(1)
  })

  it('shows the error message and stays in edit mode on failure', async () => {
    updateTallerNombreMock.mockResolvedValue({
      ok: false,
      error: 'forbidden',
      message: 'No tienes permisos para hacer este cambio.',
    })
    render(<EditarNombreTaller tallerId="t-1" tallerSlug="proximo-paso" nombre="Próximo Paso" />)
    fireEvent.click(screen.getByRole('button', { name: /editar/i }))
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No tienes permisos para hacer este cambio.')
    expect(screen.getByRole('textbox')).toBeInTheDocument()
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('gives the edit action a 44px touch target', () => {
    render(<EditarNombreTaller tallerId="t-1" tallerSlug="proximo-paso" nombre="Próximo Paso" />)
    expect(screen.getByRole('button', { name: /editar/i })).toHaveClass('min-h-[44px]')
  })

  // T10 (odd/tasks/talleres-configuracion-del-taller.md, design audit) — the
  // page's own ContenedorDashboard already renders the taller's nombre as
  // the page's single <h1> (DesktopHeader); this in-card nombre used to
  // repeat it as a SECOND <h1>. It is now a level-2 heading, so the page
  // keeps exactly one <h1>.
  it('renders the nombre as a level-2 heading, never a duplicate h1', () => {
    render(<EditarNombreTaller tallerId="t-1" tallerSlug="proximo-paso" nombre="Próximo Paso" />)
    expect(screen.getByRole('heading', { level: 2, name: 'Próximo Paso' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
  })
})
