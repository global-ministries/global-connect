/**
 * The /users filters live in the system side panel. Toggling a chip reports
 * the new filters right away (no apply step), pressed chips expose
 * aria-pressed, and each active filter can be removed from its summary pill.
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { FiltrosUsuarios, type FiltrosUsuarios as Filtros } from '@/components/ui/filtros-usuarios'

const ROLES = [
  { nombre_interno: 'miembro', nombre_visible: 'Miembro' },
  { nombre_interno: 'lider', nombre_visible: 'Líder' },
]

const sinFiltros: Filtros = { roles: [], conEmail: null, conTelefono: null, enGrupo: null, estado: [] }

function renderFiltros(filtros: Filtros = sinFiltros) {
  const onFiltrosChange = jest.fn()
  const onLimpiarFiltros = jest.fn()
  render(
    <FiltrosUsuarios
      filtros={filtros}
      onFiltrosChange={onFiltrosChange}
      rolesDisponibles={ROLES}
      onLimpiarFiltros={onLimpiarFiltros}
    />,
  )
  return { onFiltrosChange, onLimpiarFiltros }
}

describe('FiltrosUsuarios', () => {
  it('opens a side panel and reports a role toggle immediately', async () => {
    const user = userEvent.setup()
    const { onFiltrosChange } = renderFiltros()

    await user.click(screen.getByRole('button', { name: 'Filtros' }))
    const panel = await screen.findByRole('dialog', { name: 'Filtros' })
    expect(panel).toBeInTheDocument()

    const lider = screen.getByRole('button', { name: 'Líder' })
    expect(lider).toHaveAttribute('aria-pressed', 'false')
    await user.click(lider)

    expect(onFiltrosChange).toHaveBeenCalledWith({ ...sinFiltros, roles: ['lider'] })
    // No "Limpiar" without active filters.
    expect(screen.queryByRole('button', { name: 'Limpiar' })).toBeNull()
  })

  it('shows the active count, pressed chips and removable summary pills', async () => {
    const user = userEvent.setup()
    const activos: Filtros = { ...sinFiltros, roles: ['lider'], conEmail: true }
    const { onFiltrosChange, onLimpiarFiltros } = renderFiltros(activos)

    await user.click(screen.getByRole('button', { name: /Filtros\s*2/ }))
    await screen.findByRole('dialog', { name: 'Filtros' })

    expect(screen.getByRole('button', { name: 'Con email' })).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByRole('button', { name: 'Quitar filtro: Con email' }))
    expect(onFiltrosChange).toHaveBeenLastCalledWith({ ...activos, conEmail: null })

    await user.click(screen.getByRole('button', { name: 'Limpiar' }))
    expect(onLimpiarFiltros).toHaveBeenCalledTimes(1)
  })

  it('closes from the "Ver resultados" footer action', async () => {
    const user = userEvent.setup()
    renderFiltros()

    await user.click(screen.getByRole('button', { name: 'Filtros' }))
    await screen.findByRole('dialog', { name: 'Filtros' })
    await user.click(screen.getByRole('button', { name: 'Ver resultados' }))

    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
