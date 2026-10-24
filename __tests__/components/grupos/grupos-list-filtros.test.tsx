/**
 * The Grupos list opens its filters in the system side panel
 * (PanelLateralSistema, docs/design-system.md) and names the filter button
 * even on phones, where its text is hidden.
 */
import { fireEvent, render, screen } from '@testing-library/react'

let params = new URLSearchParams()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
  usePathname: () => '/grupos-vida',
  useSearchParams: () => params,
}))
jest.mock('@/hooks/use-notificaciones', () => ({
  useNotificaciones: () => ({ success: jest.fn(), error: jest.fn(), info: jest.fn() }),
}))
jest.mock('@/components/ui/FiltrosGrupos', () => ({
  __esModule: true,
  default: () => <form aria-label="Filtros de búsqueda" />,
}))

import GruposListClient from '@/components/grupos/GruposList.client'

function montar() {
  return render(<GruposListClient grupos={[]} segmentos={[]} temporadas={[]} totalCount={0} pageSize={100} />)
}

describe('GruposListClient — filters panel', () => {
  beforeEach(() => {
    params = new URLSearchParams()
  })

  it('opens the filters in the side panel', async () => {
    montar()
    const boton = screen.getByRole('button', { name: 'Filtros' })
    expect(boton).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.click(boton)

    const panel = await screen.findByRole('dialog', { name: 'Filtros de grupos' })
    expect(panel).toContainElement(screen.getByRole('form', { name: 'Filtros de búsqueda' }))
    expect(panel.className).toContain('sm:max-w-[480px]')
  })

  it('counts the active filters in the button name', () => {
    params = new URLSearchParams('segmentoId=s1&temporadaId=t1')
    montar()
    expect(screen.getByRole('button', { name: /^Filtros \(\d+ activos\)$/ })).toBeInTheDocument()
  })
})
