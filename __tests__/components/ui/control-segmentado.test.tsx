/**
 * ControlSegmentado — the segmented switch (docs/design-system/components.md,
 * "Segmented control"; prototype `.seg`). Decided 2026-10-26: plain buttons
 * with `aria-pressed` inside `role="group"`; the pressed segment inverts.
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ControlSegmentado } from '@/components/ui/control-segmentado'

type Vista = 'personas' | 'servicios'

const OPCIONES = [
  { valor: 'personas', etiqueta: 'Por persona' },
  { valor: 'servicios', etiqueta: 'Por servicio' },
] as const satisfies readonly { valor: Vista; etiqueta: string }[]

describe('ControlSegmentado', () => {
  it('is a named group of buttons, one per option', () => {
    render(<ControlSegmentado opciones={OPCIONES} valor="personas" onCambio={() => {}} etiqueta="Vista" />)
    const grupo = screen.getByRole('group', { name: 'Vista' })
    const botones = within(grupo).getAllByRole('button')
    expect(botones.map((b) => b.textContent)).toEqual(['Por persona', 'Por servicio'])
    botones.forEach((b) => expect(b).toHaveAttribute('type', 'button'))
  })

  it('presses only the selected option, inverted', () => {
    render(<ControlSegmentado opciones={OPCIONES} valor="servicios" onCambio={() => {}} etiqueta="Vista" />)
    const pulsado = screen.getByRole('button', { name: 'Por servicio' })
    const libre = screen.getByRole('button', { name: 'Por persona' })
    expect(pulsado).toHaveAttribute('aria-pressed', 'true')
    expect(pulsado).toHaveClass('bg-foreground', 'text-background')
    expect(libre).toHaveAttribute('aria-pressed', 'false')
    expect(libre).not.toHaveClass('bg-foreground')
    expect(libre).toHaveClass('text-muted-foreground')
  })

  it('calls onCambio with the typed value of the clicked option', async () => {
    const onCambio = jest.fn<void, [Vista]>()
    render(<ControlSegmentado opciones={OPCIONES} valor="personas" onCambio={onCambio} etiqueta="Vista" />)
    await userEvent.click(screen.getByRole('button', { name: 'Por servicio' }))
    expect(onCambio).toHaveBeenCalledTimes(1)
    expect(onCambio).toHaveBeenCalledWith('servicios')
  })

  it('follows the controlled valor when it changes', () => {
    const { rerender } = render(
      <ControlSegmentado opciones={OPCIONES} valor="personas" onCambio={() => {}} etiqueta="Vista" />,
    )
    rerender(<ControlSegmentado opciones={OPCIONES} valor="servicios" onCambio={() => {}} etiqueta="Vista" />)
    expect(screen.getByRole('button', { name: 'Por servicio' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Por persona' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('uses the sm control height with a 44px touch target and the focus ring', () => {
    render(<ControlSegmentado opciones={OPCIONES} valor="personas" onCambio={() => {}} etiqueta="Vista" />)
    const boton = screen.getByRole('button', { name: 'Por persona' })
    expect(boton).toHaveClass('min-h-9', 'pointer-coarse:min-h-11', 'focus-ring')
    expect(screen.getByRole('group', { name: 'Vista' })).toHaveClass('rounded-xl', 'border-border', 'bg-card')
  })
})
