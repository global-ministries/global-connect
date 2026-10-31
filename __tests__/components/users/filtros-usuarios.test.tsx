/**
 * The /users filters sheet (S13 of odd/tasks/sistema-diseno-v2.md; prototype
 * 01-lista-escritorio.html, `openFilters`): the canonical HojaFiltros with
 * Rol (several at once), Teléfono, Email, Grupo de Vida, Cuenta, Registro
 * (Nuevos · 7 días) and Ordenar por, plus "Seleccionar personas" for the
 * admin on phones. Filters apply live (no apply step), pressed pills expose
 * aria-pressed, a second tap removes a filter, every change goes back to
 * page 1, "Limpiar" empties the sheet and "Ver N personas" only closes.
 */
import React from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { HojaFiltrosUsuarios, type HojaFiltrosUsuariosProps } from '@/components/ui/filtros-usuarios'
import { FILTROS_INICIALES, LIMPIAR_FILTROS, type FiltrosUsuarios } from '@/lib/platform/usuarios/lista-vista'

const f = (cambios: Partial<FiltrosUsuarios> = {}): FiltrosUsuarios => ({ ...FILTROS_INICIALES, ...cambios })

function abrir(props: Partial<HojaFiltrosUsuariosProps> = {}) {
  const onCambio = jest.fn()
  const onCambioAbierta = jest.fn()
  render(
    <HojaFiltrosUsuarios
      filtros={f()}
      abierta
      onCambioAbierta={onCambioAbierta}
      resultados={41}
      nuevos={8}
      onCambio={onCambio}
      {...props}
    />,
  )
  return { onCambio, onCambioAbierta, hoja: screen.getByRole('dialog', { name: 'Filtros' }) }
}

describe('HojaFiltrosUsuarios', () => {
  it('roles toggle one by one and several can be on', async () => {
    const user = userEvent.setup()
    const { onCambio } = abrir({ filtros: f({ roles: ['pastor'], pagina: 3 }) })

    const rol = within(screen.getByRole('group', { name: 'Rol' }))
    expect(rol.getByRole('button', { name: 'Pastor' })).toHaveAttribute('aria-pressed', 'true')
    expect(rol.getByRole('button', { name: 'Líder' })).toHaveAttribute('aria-pressed', 'false')

    await user.click(rol.getByRole('button', { name: 'Líder' }))
    expect(onCambio).toHaveBeenLastCalledWith({ roles: ['pastor', 'lider'], pagina: 1 })
    await user.click(rol.getByRole('button', { name: 'Pastor' }))
    expect(onCambio).toHaveBeenLastCalledWith({ roles: [], pagina: 1 })
  })

  it('each yes/no pair sets its filter and a second tap removes it', async () => {
    const user = userEvent.setup()
    const { onCambio } = abrir({ filtros: f({ conEmail: true }) })

    expect(screen.getByRole('button', { name: 'Con email' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'Con email' }))
    expect(onCambio).toHaveBeenLastCalledWith({ conEmail: null, pagina: 1 })

    await user.click(screen.getByRole('button', { name: 'Sin teléfono' }))
    expect(onCambio).toHaveBeenLastCalledWith({ conTelefono: false, pagina: 1 })
    await user.click(screen.getByRole('button', { name: 'Sin grupo' }))
    expect(onCambio).toHaveBeenLastCalledWith({ enGrupo: false, pagina: 1 })
    await user.click(screen.getByRole('button', { name: 'Con cuenta' }))
    expect(onCambio).toHaveBeenLastCalledWith({ conCuenta: true, pagina: 1 })
  })

  it('"Nuevos · 7 días" carries the count and toggles', async () => {
    const user = userEvent.setup()
    const { onCambio } = abrir()

    await user.click(screen.getByRole('button', { name: 'Nuevos · 7 días 8' }))
    expect(onCambio).toHaveBeenLastCalledWith({ nuevos: true, pagina: 1 })
  })

  it('Ordenar por: name by default; registration date starts with the newest', async () => {
    const user = userEvent.setup()
    const { onCambio } = abrir()

    const orden = within(screen.getByRole('group', { name: 'Ordenar por' }))
    expect(orden.getByRole('button', { name: /Nombre/ })).toHaveAttribute('aria-pressed', 'true')
    await user.click(orden.getByRole('button', { name: 'Fecha de registro' }))
    expect(onCambio).toHaveBeenLastCalledWith({ orden: 'registro_desc', pagina: 1 })
  })

  it('shows the direction of the active sort', () => {
    abrir({ filtros: f({ orden: 'registro_asc' }) })
    expect(screen.getByRole('button', { name: 'Fecha de registro ↑' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('"Limpiar" empties the sheet filters; "Ver N personas" only closes', async () => {
    const user = userEvent.setup()
    const { onCambio, onCambioAbierta } = abrir({ filtros: f({ roles: ['lider'], conEmail: true }) })

    await user.click(screen.getByRole('button', { name: 'Limpiar' }))
    expect(onCambio).toHaveBeenLastCalledWith(LIMPIAR_FILTROS)
    await user.click(screen.getByRole('button', { name: 'Ver 41 personas' }))
    expect(onCambioAbierta).toHaveBeenLastCalledWith(false)
  })

  it('"Seleccionar personas" only when the screen offers the selection mode', async () => {
    const user = userEvent.setup()
    const onAlternar = jest.fn()
    abrir({ seleccion: { activa: false, onAlternar } })

    await user.click(screen.getByRole('button', { name: 'Seleccionar personas' }))
    expect(onAlternar).toHaveBeenCalledTimes(1)
  })

  it('no selection group without the mode', () => {
    abrir()
    expect(screen.queryByRole('button', { name: 'Seleccionar personas' })).toBeNull()
  })
})
