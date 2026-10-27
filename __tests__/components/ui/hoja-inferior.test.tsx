/**
 * HojaInferior: the phone bottom sheet (vaul). Tested through the rendered
 * dialog: role and accessible name, description, body, footer slot, and the
 * close paths (Escape and the close button).
 */
import { fireEvent, render, screen } from '@testing-library/react'

import { HojaInferior } from '@/components/ui/hoja-inferior'

function renderHoja(props: Partial<React.ComponentProps<typeof HojaInferior>> = {}) {
  const onCambioAbierta = jest.fn()
  render(
    <HojaInferior
      abierta
      onCambioAbierta={onCambioAbierta}
      titulo="Ana Pérez"
      descripcion="Servidora en Niños"
      pie={<button type="button">Ver 12 personas</button>}
      {...props}
    >
      <p>Contenido de la hoja</p>
    </HojaInferior>
  )
  return { onCambioAbierta }
}

describe('HojaInferior', () => {
  it('renders a dialog named by its title and described by its description', () => {
    renderHoja()
    const hoja = screen.getByRole('dialog', { name: 'Ana Pérez' })
    expect(hoja).toHaveAccessibleDescription('Servidora en Niños')
    expect(screen.getByText('Contenido de la hoja')).toBeInTheDocument()
  })

  it('renders the footer slot', () => {
    renderHoja()
    const pie = screen.getByRole('button', { name: 'Ver 12 personas' })
    expect(pie.closest('[data-slot="hoja-pie"]')).not.toBeNull()
  })

  it('omits the footer when there is no pie', () => {
    renderHoja({ pie: undefined })
    expect(document.querySelector('[data-slot="hoja-pie"]')).toBeNull()
  })

  it('has the sheet look: 90vh max height, 26px top radius, card surface, sheet shadow', () => {
    renderHoja()
    const hoja = screen.getByRole('dialog', { name: 'Ana Pérez' })
    expect(hoja.className).toContain('data-[vaul-drawer-direction=bottom]:max-h-[90vh]')
    expect(hoja.className).toContain('data-[vaul-drawer-direction=bottom]:rounded-t-[26px]')
    expect(hoja).toHaveClass('bg-card', 'shadow-sheet')
    expect(hoja.className).not.toContain('data-[vaul-drawer-direction=bottom]:max-h-[80vh]')
    // Own 38x5 grab handle, hidden from assistive tech.
    expect(hoja.querySelector('[data-slot="hoja-agarre"]')).toHaveAttribute('aria-hidden', 'true')
  })

  it('pads the bottom safe area on the footer, or on the body without a footer', () => {
    renderHoja()
    expect(document.querySelector('[data-slot="hoja-pie"]')).toHaveClass('safe-area-pb-md')
  })

  it('pads the body bottom safe area when there is no footer', () => {
    renderHoja({ pie: undefined })
    expect(document.querySelector('[data-slot="hoja-cuerpo"]')).toHaveClass('safe-area-pb-md')
  })

  it('works without a description', () => {
    renderHoja({ descripcion: undefined })
    const hoja = screen.getByRole('dialog', { name: 'Ana Pérez' })
    expect(hoja).not.toHaveAttribute('aria-describedby')
  })

  it('asks to close on Escape', () => {
    const { onCambioAbierta } = renderHoja()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onCambioAbierta).toHaveBeenCalledWith(false)
  })

  it('asks to close from its 44px close button', () => {
    const { onCambioAbierta } = renderHoja()
    const cerrar = screen.getByRole('button', { name: 'Cerrar' })
    expect(cerrar).toHaveClass('size-11', 'focus-ring')
    fireEvent.click(cerrar)
    expect(onCambioAbierta).toHaveBeenCalledWith(false)
  })

  it('renders nothing while closed', () => {
    renderHoja({ abierta: false })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
