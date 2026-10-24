import { render, screen } from '@testing-library/react'

import DashboardMiembro from '@/components/dashboard/roles/DashboardMiembro'

// The member dashboard receives no data yet (obtener_datos_dashboard answers widgets: {}), so it
// must not show cards that promise data it never has (odd/tasks/ninos-roles-ui.md F7).
describe('DashboardMiembro', () => {
  it('shows no empty placeholder cards', () => {
    render(<DashboardMiembro data={{}} />)
    expect(screen.queryByText(/Próximos Cumpleaños/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Mi Historial de Asistencia/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Aquí verás información de tu grupo/i)).not.toBeInTheDocument()
  })

  it('offers keeping the profile up to date', () => {
    render(<DashboardMiembro data={{}} />)
    expect(screen.getByRole('heading', { name: 'Mantén tus datos al día' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Ir a Mi Perfil/ })).toHaveAttribute('href', '/perfil')
  })
})
