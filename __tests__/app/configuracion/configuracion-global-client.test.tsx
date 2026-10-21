/**
 * The global settings follow the system controls (docs/design-system.md):
 * actions sit in the shared action footer, module toggles are labelled
 * switches and the logo remove action is a labelled icon button that is not
 * nested inside the upload button.
 */
import { fireEvent, render, screen, within } from '@testing-library/react'

jest.mock('@/hooks/use-notificaciones', () => ({
  useNotificaciones: () => ({ success: jest.fn(), error: jest.fn(), info: jest.fn() }),
}))
jest.mock('@/lib/actions/branding.actions', () => ({
  guardarConfiguracionBranding: jest.fn(),
  guardarDatosOrganizacion: jest.fn(),
}))
jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} />,
}))

import { ConfiguracionGlobalClient } from '@/app/(auth)/configuracion/ConfiguracionGlobalClient'

const branding = {
  logoLightUrl: 'https://cdn.example/claro.png',
  logoDarkUrl: null,
  faviconUrl: null,
  colorPrimario: '#E96C20',
  colorSecundario: '#F59E0B',
}

describe('ConfiguracionGlobalClient', () => {
  it('puts the save action in the shared action footer', () => {
    render(<ConfiguracionGlobalClient />)
    const guardar = screen.getByRole('button', { name: 'Guardar cambios' })
    expect(guardar.closest('[data-slot="pie-acciones"]')).not.toBeNull()
  })

  it('renders each module toggle as a labelled switch', () => {
    render(<ConfiguracionGlobalClient />)
    fireEvent.click(screen.getByRole('button', { name: /Módulos del Sistema/ }))
    const mapa = screen.getByRole('switch', { name: 'Mapa de Grupos' })
    expect(mapa).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(mapa)
    expect(mapa).toHaveAttribute('aria-checked', 'false')
  })

  it('offers a labelled remove button beside, not inside, the logo upload button', () => {
    render(<ConfiguracionGlobalClient datosBranding={branding} />)
    fireEvent.click(screen.getByRole('button', { name: /Logo y Branding/ }))
    const cambiar = screen.getByRole('button', { name: 'Cambiar logo modo claro' })
    const quitar = screen.getByRole('button', { name: 'Quitar logo modo claro' })
    expect(within(cambiar).queryByRole('button')).toBeNull()

    fireEvent.click(quitar)
    expect(screen.getByRole('button', { name: 'Subir logo modo claro' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Quitar logo modo claro' })).toBeNull()
  })

  it('lays the settings sections out with SeccionesSistema and the organization fields with CamposSistema', () => {
    const { container } = render(<ConfiguracionGlobalClient />)
    const secciones = container.querySelector('[data-slot="secciones"]')
    expect(secciones).not.toBeNull()
    expect(secciones).toContainElement(screen.getByRole('button', { name: /Módulos del Sistema/ }))
    for (const etiqueta of ['Nombre de la organización', 'Email de contacto', 'Dirección', 'Teléfono']) {
      expect(screen.getByLabelText(etiqueta).closest('[data-slot="campos"]')).not.toBeNull()
    }
  })
})
