/**
 * MetricasAtencion — the attention metrics that ARE the filter (docs/
 * design-system/components.md, "Attention metrics"; prototype `.metric`).
 * Each card is a real `<button aria-pressed>`: dot, label, mono value,
 * proportion bar and hint. 4 columns on desktop, 2×2 on tablet and phone;
 * on phone (below md) the bar and the hint are hidden.
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { MetricasAtencion, type MetricaAtencion } from '@/components/ui/metricas-atencion'

const METRICAS: MetricaAtencion[] = [
  { id: 'activos', etiqueta: 'Sirviendo', valor: 30, total: 40, pista: '75% del equipo', tono: 'success', activa: false },
  { id: 'porActivar', etiqueta: 'Por activar', valor: 4, total: 40, pista: 'postulados y en orientación', tono: 'info', activa: true },
  { id: 'sinCuenta', etiqueta: 'Sin cuenta', valor: 0, total: 40, tono: 'warning', activa: false },
  { id: 'sinTurno', etiqueta: 'Sin turno', valor: 1234, tono: 'danger', activa: false },
]

function renderMetricas(onAlternar = jest.fn()) {
  render(<MetricasAtencion metricas={METRICAS} onAlternar={onAlternar} etiqueta="Necesitan atención" />)
  return onAlternar
}

describe('MetricasAtencion', () => {
  it('groups one toggle button per metric under the given name', () => {
    renderMetricas()
    const grupo = screen.getByRole('group', { name: 'Necesitan atención' })
    const botones = within(grupo).getAllByRole('button')
    expect(botones).toHaveLength(4)
    botones.forEach((boton) => expect(boton).toHaveAttribute('type', 'button'))
  })

  it('names each button by its label, value and hint, and reflects activa in aria-pressed', () => {
    renderMetricas()
    expect(screen.getByRole('button', { name: 'Sirviendo 30 75% del equipo' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Por activar 4 postulados y en orientación' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Sin cuenta 0' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('calls onAlternar with the metric id', async () => {
    const onAlternar = renderMetricas()
    await userEvent.click(screen.getByRole('button', { name: /^Sin turno/ }))
    await userEvent.click(screen.getByRole('button', { name: /^Por activar/ }))
    expect(onAlternar.mock.calls).toEqual([['sinTurno'], ['porActivar']])
  })

  it('renders the value as a mono tabular number, zero included', () => {
    renderMetricas()
    const cero = within(screen.getByRole('button', { name: /^Sin cuenta/ })).getByText('0')
    expect(cero).toHaveClass('font-mono', 'tabular-nums')
    expect(within(screen.getByRole('button', { name: /^Sin turno/ })).getByText('1234')).toHaveClass('font-mono')
  })

  it('draws the proportion bar from valor / total, hidden below md', () => {
    renderMetricas()
    const barra = screen.getByRole('button', { name: /^Sirviendo/ }).querySelector('[data-barra]')
    expect(barra).toHaveAttribute('aria-hidden', 'true')
    expect(barra).toHaveClass('hidden', 'md:block')
    expect(barra?.querySelector('[data-relleno]')).toHaveStyle({ width: '75%' })
    expect(barra?.querySelector('[data-relleno]')).toHaveClass('bg-success')
  })

  it('omits the bar without a total and the hint without a pista', () => {
    renderMetricas()
    expect(screen.getByRole('button', { name: /^Sin turno/ }).querySelector('[data-barra]')).toBeNull()
    expect(screen.getByRole('button', { name: /^Sin cuenta/ }).querySelector('[data-pista]')).toBeNull()
  })

  it('caps the bar at 100% and treats total 0 as empty', () => {
    render(
      <MetricasAtencion
        etiqueta="Métricas"
        onAlternar={() => {}}
        metricas={[
          { id: 'a', etiqueta: 'Más', valor: 12, total: 10, tono: 'info', activa: false },
          { id: 'b', etiqueta: 'Nada', valor: 3, total: 0, tono: 'muted', activa: false },
        ]}
      />,
    )
    expect(screen.getByRole('button', { name: /^Más/ }).querySelector('[data-relleno]')).toHaveStyle({ width: '100%' })
    expect(screen.getByRole('button', { name: /^Nada/ }).querySelector('[data-relleno]')).toHaveStyle({ width: '0%' })
  })

  it('hides the hint on phones', () => {
    renderMetricas()
    const pista = within(screen.getByRole('button', { name: /^Sirviendo/ })).getByText('75% del equipo')
    expect(pista).toHaveClass('hidden', 'md:block')
  })

  it('lays out 2 columns below lg and 4 from lg', () => {
    renderMetricas()
    expect(screen.getByRole('group', { name: 'Necesitan atención' })).toHaveClass('grid', 'grid-cols-2', 'lg:grid-cols-4')
  })

  it('marks the pressed card with the brand border and the single brand tint', () => {
    renderMetricas()
    const activa = screen.getByRole('button', { name: /^Por activar/ })
    expect(activa).toHaveClass('border-brand', 'bg-brand-tint')
    const inactiva = screen.getByRole('button', { name: /^Sirviendo/ })
    expect(inactiva).not.toHaveClass('bg-brand-tint')
    expect(inactiva).toHaveClass('bg-card')
    expect(activa).toHaveClass('focus-ring')
    expect(activa.className).not.toContain('brand-accent')
  })
})
