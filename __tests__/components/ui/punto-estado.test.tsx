/**
 * PuntoEstado — the status dot plus an optional label (docs/design-system/
 * components.md, "Status dot"). A status is never color alone: the label is
 * always in the accessible name, even when it is hidden on phones.
 */
import { render, screen } from '@testing-library/react'

import { PuntoEstado } from '@/components/ui/punto-estado'
import { MetricasAtencion } from '@/components/ui/metricas-atencion'

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

describe('PuntoEstado halo', () => {
  // The dot's halo is a 4px ring drawn outside the dot: any ancestor inside the
  // component that clips (overflow hidden / truncate) cuts it in half.
  it('never clips the dot halo; long labels truncate on the label itself', () => {
    const { container } = render(<PuntoEstado tono="success" etiqueta="Sirviendo" className="min-w-0" />)
    const raiz = container.firstElementChild as HTMLElement
    expect(raiz.className).not.toMatch(/\b(truncate|overflow-hidden)\b/)
    expect(screen.getByText('Sirviendo').className).toMatch(/\btruncate\b/)
  })

  it('MetricasAtencion does not clip the halo of its dots', () => {
    const { container } = render(
      <MetricasAtencion
        etiqueta="Necesitan atención"
        onAlternar={() => {}}
        metricas={[{ id: 's', etiqueta: 'Sirviendo', valor: 345, total: 345, tono: 'success', activa: false }]}
      />,
    )
    const punto = container.querySelector('[data-punto]') as HTMLElement
    for (let nodo = punto.parentElement; nodo && nodo.tagName !== 'BUTTON'; nodo = nodo.parentElement) {
      expect(nodo.className).not.toMatch(/\b(truncate|overflow-hidden)\b/)
    }
  })
})
