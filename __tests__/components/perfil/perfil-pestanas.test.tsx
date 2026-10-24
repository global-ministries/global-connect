import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { PerfilPestanas } from '@/components/perfil/perfil-pestanas'

// Mi Perfil splits "Mis datos" and "Mis hijos" into two tabs (odd/tasks/ninos-roles-ui.md F3, D3).
const DATOS = <form aria-label="Formulario de perfil"><input aria-label="Nombre" defaultValue="Ana" /></form>
const HIJOS = <section aria-label="Mis hijos">Lista de hijos</section>

afterEach(() => {
  window.history.replaceState(null, '', '/perfil')
})

describe('PerfilPestanas', () => {
  it('opens on Mis datos and keeps Mis hijos hidden', () => {
    render(<PerfilPestanas datos={DATOS} hijos={HIJOS} />)
    expect(screen.getByRole('tab', { name: 'Mis datos' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Mis hijos' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('form', { name: 'Formulario de perfil' })).toBeVisible()
    expect(screen.queryByRole('region', { name: 'Mis hijos' })).not.toBeInTheDocument()
  })

  it('opens on Mis hijos when the link ends in #mis-hijos (dashboard card, emails)', () => {
    window.history.replaceState(null, '', '/perfil#mis-hijos')
    render(<PerfilPestanas datos={DATOS} hijos={HIJOS} />)
    expect(screen.getByRole('tab', { name: 'Mis hijos' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('region', { name: 'Mis hijos' })).toBeVisible()
  })

  it('switching tabs keeps the unsaved form and updates the address', async () => {
    render(<PerfilPestanas datos={DATOS} hijos={HIJOS} />)
    await userEvent.clear(screen.getByLabelText('Nombre'))
    await userEvent.type(screen.getByLabelText('Nombre'), 'Ana María')
    await userEvent.click(screen.getByRole('tab', { name: 'Mis hijos' }))
    expect(screen.getByRole('region', { name: 'Mis hijos' })).toBeVisible()
    expect(window.location.hash).toBe('#mis-hijos')
    await userEvent.click(screen.getByRole('tab', { name: 'Mis datos' }))
    expect(screen.getByLabelText('Nombre')).toHaveValue('Ana María')
    expect(window.location.hash).toBe('')
  })

  it('shows only the profile, without tabs, for an account with no Mis hijos (a minor)', () => {
    render(<PerfilPestanas datos={DATOS} hijos={null} />)
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(screen.getByRole('form', { name: 'Formulario de perfil' })).toBeVisible()
  })
})
