/**
 * EstadoVacioSistema and SkeletonLista — the canonical empty state and loading
 * rows (docs/design-system/patterns.md, "Empty and loading states"; prototype
 * `.empty`, `.skel`). The module must stay server-safe: server pages hand it a
 * lucide icon component, and a `'use client'` directive turns that into
 * React #441 in production (see components/dream-team/estado-vacio.tsx).
 */
import fs from 'node:fs'
import path from 'node:path'

import { render, screen, within } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Inbox } from 'lucide-react'

import { EstadoVacioSistema, SkeletonLista } from '@/components/ui/estado-vacio-sistema'

describe('EstadoVacioSistema', () => {
  it('shows the title and the guidance line', () => {
    render(<EstadoVacioSistema titulo="Nadie coincide con estos filtros" subtitulo="Quitá alguno o usá «Limpiar todo»." />)
    expect(screen.getByText('Nadie coincide con estos filtros')).toHaveClass('text-foreground')
    expect(screen.getByText('Quitá alguno o usá «Limpiar todo».')).toHaveClass('text-muted-foreground')
  })

  it('renders an icon passed as a component, hidden from screen readers', () => {
    const { container } = render(<EstadoVacioSistema icono={Inbox} titulo="Todavía no hay servidores acá" />)
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg).toHaveAttribute('aria-hidden', 'true')
  })

  it('renders an icon passed as an element', () => {
    render(<EstadoVacioSistema icono={<span data-testid="icono">*</span>} titulo="Vacío" />)
    expect(screen.getByTestId('icono').parentElement).toHaveAttribute('aria-hidden', 'true')
  })

  it('renders the optional action', () => {
    render(<EstadoVacioSistema titulo="Vacío" accion={<button type="button">Limpiar todo</button>} />)
    expect(screen.getByRole('button', { name: 'Limpiar todo' })).toBeInTheDocument()
  })

  it('renders only what it is given', () => {
    const { container } = render(<EstadoVacioSistema titulo="Solo título" />)
    expect(container).toHaveTextContent(/^Solo título$/)
    expect(container.querySelector('svg')).toBeNull()
  })

  it('renders on the server without client hooks', () => {
    const html = renderToStaticMarkup(<EstadoVacioSistema icono={Inbox} titulo="Servidor" subtitulo="Sin hooks" />)
    expect(html).toContain('Servidor')
    expect(html).toContain('<svg')
  })

  it('is not a client module', () => {
    const fuente = fs.readFileSync(path.resolve(__dirname, '../../../components/ui/estado-vacio-sistema.tsx'), 'utf8')
    expect(fuente).not.toMatch(/^\s*(['"])use client\1/)
  })
})

describe('SkeletonLista', () => {
  it('announces loading with aria-busy and an sr-only "Cargando"', () => {
    render(<SkeletonLista />)
    const estado = screen.getByRole('status')
    expect(estado).toHaveAttribute('aria-busy', 'true')
    expect(within(estado).getByText('Cargando')).toHaveClass('sr-only')
  })

  it('renders 6 decorative rows by default, or the given number', () => {
    const { container, rerender } = render(<SkeletonLista />)
    expect(container.querySelectorAll('[data-fila-skeleton]')).toHaveLength(6)
    rerender(<SkeletonLista filas={3} />)
    const filas = container.querySelectorAll('[data-fila-skeleton]')
    expect(filas).toHaveLength(3)
    filas.forEach((fila) => {
      expect(fila).toHaveAttribute('aria-hidden', 'true')
      expect(fila.querySelector('.animate-pulse')).not.toBeNull()
    })
  })

  it('renders on the server', () => {
    expect(renderToStaticMarkup(<SkeletonLista filas={2} />)).toContain('aria-busy="true"')
  })
})
