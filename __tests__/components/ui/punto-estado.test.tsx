/**
 * PuntoEstado — the status dot plus an optional label (docs/design-system/
 * components.md, "Status dot"). A status is never color alone: the label is
 * always in the accessible name, even when it is hidden on phones.
 */
import { render, screen } from '@testing-library/react'

import { PuntoEstado } from '@/components/ui/punto-estado'

describe('PuntoEstado', () => {
  it('shows the dot and the label, and the dot stays out of the accessibility tree', () => {
    const { container } = render(<PuntoEstado tono="success" etiqueta="Activo" />)
    const etiqueta = screen.getByText('Activo')
    expect(etiqueta).toBeVisible()
    expect(etiqueta).not.toHaveClass('sr-only')
    const punto = container.querySelector('[data-punto]')
    expect(punto).toHaveAttribute('aria-hidden', 'true')
  })

  it.each([
    ['success', 'bg-success', 'ring-success/20'],
    ['warning', 'bg-warning', 'ring-warning/20'],
    ['info', 'bg-info', 'ring-info/20'],
    ['danger', 'bg-danger', 'ring-danger/20'],
    ['muted', 'bg-muted-foreground', 'ring-muted-foreground/20'],
  ] as const)('%s paints an 8px dot with its token color and a soft ring', (tono, fondo, anillo) => {
    const { container } = render(<PuntoEstado tono={tono} etiqueta="Etapa" />)
    const punto = container.querySelector('[data-punto]')
    expect(punto).toHaveClass('size-2', 'rounded-full', fondo, 'ring-4', anillo)
  })

  it('hides the label on phones only, keeping it for screen readers', () => {
    render(<PuntoEstado tono="warning" etiqueta="Postulado" ocultarEtiquetaEnMovil />)
    const etiqueta = screen.getByText('Postulado')
    expect(etiqueta).toHaveClass('sr-only', 'md:not-sr-only')
  })

  it('without a label is a purely decorative dot', () => {
    const { container } = render(<PuntoEstado tono="info" />)
    expect(container.querySelector('[data-punto]')).toHaveAttribute('aria-hidden', 'true')
    expect(container).toHaveTextContent(/^$/)
  })

  it('uses only design tokens, never raw palette colors', () => {
    const { container } = render(<PuntoEstado tono="danger" etiqueta="Retirado" />)
    expect(container.innerHTML).not.toMatch(/\b(?:bg|text|ring)-(?:red|green|amber|yellow|blue|gray|slate|zinc)-\d/)
  })
})
