/**
 * TabsSistema — Radix tabs with the segmented control look (T7c of
 * odd/tasks/sistema-diseno-v2.md): the active tab inverts like
 * `ControlSegmentado`, no orange fill and no blur; roles and keyboard stay
 * Radix's.
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { TabsContent, TabsList, TabsSistema, TabsTrigger } from '@/components/ui/TabsSistema'

function Pestanas() {
  return (
    <TabsSistema defaultValue="personas">
      <TabsList aria-label="Secciones">
        <TabsTrigger value="personas">Personas</TabsTrigger>
        <TabsTrigger value="calendario">Calendario</TabsTrigger>
      </TabsList>
      <TabsContent value="personas">Lista</TabsContent>
      <TabsContent value="calendario">Fechas</TabsContent>
    </TabsSistema>
  )
}

describe('TabsSistema', () => {
  it('uses the segmented look: card surface, inverted active tab, no orange or blur', () => {
    render(<Pestanas />)
    const lista = screen.getByRole('tablist', { name: 'Secciones' })
    expect(lista).toHaveClass('rounded-xl', 'border-border', 'bg-card', 'p-[3px]')
    expect(lista.className).not.toMatch(/backdrop-blur|orange/)

    const activa = screen.getByRole('tab', { name: 'Personas' })
    expect(activa).toHaveAttribute('aria-selected', 'true')
    expect(activa).toHaveClass(
      'focus-ring',
      'min-h-9',
      'pointer-coarse:min-h-11',
      'data-[state=active]:bg-foreground',
      'data-[state=active]:text-background',
      'text-muted-foreground',
    )
    expect(activa.className).not.toMatch(/orange|text-white/)
  })

  it('keeps the tab roles and arrow-key navigation', async () => {
    const user = userEvent.setup()
    render(<Pestanas />)
    await user.click(screen.getByRole('tab', { name: 'Personas' }))
    await user.keyboard('{ArrowRight}')
    const calendario = screen.getByRole('tab', { name: 'Calendario' })
    expect(calendario).toHaveFocus()
    expect(calendario).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Fechas')
  })
})
