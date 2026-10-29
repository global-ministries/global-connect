import { fireEvent, render, screen, within } from '@testing-library/react'
import Link from 'next/link'
import { useRef, useState } from 'react'

import { PanelFlotante, PanelFlotanteRiel } from '@/components/navegacion/panel-flotante-riel'

/**
 * The floating panel of the shell (rail flyouts, account menu, notifications):
 * focus moves in on open; Escape closes and returns focus to the anchor; a
 * press outside or focus leaving closes it.
 */

function Demo({ riel = false }: { riel?: boolean }) {
  const [abierto, setAbierto] = useState(false)
  const ancla = useRef<HTMLButtonElement>(null)
  const contenido = (
    <ul>
      <li><Link href="/grupos-vida">Grupos de Vida</Link></li>
      <li><Link href="/grupos-vida/mapa">Mapa</Link></li>
    </ul>
  )
  return (
    <div>
      <button ref={ancla} type="button" aria-expanded={abierto} onClick={() => setAbierto((v) => !v)}>
        Abrir
      </button>
      {riel ? (
        <PanelFlotanteRiel abierto={abierto} onCerrar={() => setAbierto(false)} ancla={ancla} id="panel" titulo="Grupos de Vida">
          {contenido}
        </PanelFlotanteRiel>
      ) : (
        <PanelFlotante abierto={abierto} onCerrar={() => setAbierto(false)} ancla={ancla} id="panel" etiqueta="Panel">
          {contenido}
        </PanelFlotante>
      )}
      <Link href="/afuera">Afuera</Link>
    </div>
  )
}

describe('PanelFlotante', () => {
  it('renders nothing while closed', () => {
    render(<Demo />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('moves focus to the first link on open', () => {
    render(<Demo />)
    fireEvent.click(screen.getByRole('button', { name: 'Abrir' }))

    const panel = screen.getByRole('dialog', { name: 'Panel' })
    expect(panel).toHaveAttribute('id', 'panel')
    expect(within(panel).getByRole('link', { name: 'Grupos de Vida' })).toHaveFocus()
  })

  it('closes on Escape and returns focus to the anchor', () => {
    render(<Demo />)
    const abrir = screen.getByRole('button', { name: 'Abrir' })
    fireEvent.click(abrir)

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(abrir).toHaveFocus()
    expect(abrir).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes on a press outside but not on a press inside', () => {
    render(<Demo />)
    fireEvent.click(screen.getByRole('button', { name: 'Abrir' }))

    fireEvent.mouseDown(screen.getByRole('link', { name: 'Mapa' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes when focus leaves it for the rest of the page', () => {
    render(<Demo />)
    fireEvent.click(screen.getByRole('button', { name: 'Abrir' }))
    const mapa = screen.getByRole('link', { name: 'Mapa' })

    fireEvent.blur(mapa, { relatedTarget: screen.getByRole('link', { name: 'Grupos de Vida' }) })
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.blur(mapa, { relatedTarget: screen.getByRole('link', { name: 'Afuera' }) })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('the toggle on the anchor closes it again', () => {
    render(<Demo />)
    const abrir = screen.getByRole('button', { name: 'Abrir' })
    fireEvent.click(abrir)
    fireEvent.mouseDown(abrir)
    fireEvent.click(abrir)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('PanelFlotanteRiel', () => {
  it('is a fixed layer named "Submenú de <grupo>" with the group title', () => {
    render(<Demo riel />)
    fireEvent.click(screen.getByRole('button', { name: 'Abrir' }))

    const panel = screen.getByRole('dialog', { name: 'Submenú de Grupos de Vida' })
    expect(panel).toHaveClass('fixed', 'bg-card', 'border-border', 'shadow-sheet')
    expect(panel.className).not.toMatch(/glass/)
    expect(within(panel).getByRole('heading', { level: 2, name: 'Grupos de Vida' })).toBeInTheDocument()
    expect(panel.style.left).not.toBe('')
  })
})
