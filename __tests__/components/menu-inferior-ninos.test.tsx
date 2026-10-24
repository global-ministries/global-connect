import { render, screen } from '@testing-library/react'

import { MenuInferiorMovil } from '@/components/ui/menu-inferior-movil'
import { NinosAccesoProvider } from '@/hooks/useNinosAcceso'

/**
 * Niños in the mobile bottom bar (odd/tasks/ninos-roles-ui.md F5): whoever has Niños access
 * reaches their first Niños screen in one tap (the Sunday table no longer needs the drawer).
 */
let currentPathname = '/dashboard'

jest.mock('next/navigation', () => ({ usePathname: () => currentPathname }))
jest.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({
    usuario: null, roles: ['miembro'], supportCapabilities: [], platformSession: null, loading: false, error: null,
  }),
}))

function renderBarra(acceso: { puedeOperar?: boolean; puedeVerSalon?: boolean } | null) {
  return render(
    acceso ? (
      <NinosAccesoProvider puedeOperar={acceso.puedeOperar ?? false} puedeVerSalon={acceso.puedeVerSalon ?? false}
        puedeConfigurar={false} puedeMarcarVoluntarios={false}>
        <MenuInferiorMovil />
      </NinosAccesoProvider>
    ) : (
      <MenuInferiorMovil />
    ),
  )
}

beforeEach(() => {
  currentPathname = '/dashboard'
})

describe('MenuInferiorMovil — Niños', () => {
  it('offers Niños to the table (Check-in first), after Grupos de Vida', () => {
    renderBarra({ puedeOperar: true, puedeVerSalon: true })
    const ninos = screen.getByRole('link', { name: 'Navegar a Niños' })
    expect(ninos).toHaveAttribute('href', '/ninos/checkin')
    const nombres = screen.getAllByRole('link').map((l) => l.getAttribute('aria-label'))
    expect(nombres.indexOf('Navegar a Niños')).toBe(nombres.indexOf('Navegar a Grupos de Vida') + 1)
  })

  it('sends a room leader to Salones', () => {
    renderBarra({ puedeVerSalon: true })
    expect(screen.getByRole('link', { name: 'Navegar a Niños' })).toHaveAttribute('href', '/ninos/salon')
  })

  it('marks Niños active on any Niños screen', () => {
    currentPathname = '/ninos/familias'
    renderBarra({ puedeOperar: true })
    expect(screen.getByRole('link', { name: 'Navegar a Niños' })).toHaveAttribute('aria-current', 'page')
  })

  it('shows "Grupos" for Grupos de Vida so four entries fit, keeping the full accessible name', () => {
    renderBarra({ puedeOperar: true })
    const grupos = screen.getByRole('link', { name: 'Navegar a Grupos de Vida' })
    expect(grupos).toHaveTextContent(/^Grupos$/)
  })

  it('has no Niños without access, and keeps the other entries', () => {
    renderBarra(null)
    expect(screen.queryByRole('link', { name: 'Navegar a Niños' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Navegar a Dashboard' })).toBeInTheDocument()
  })
})
