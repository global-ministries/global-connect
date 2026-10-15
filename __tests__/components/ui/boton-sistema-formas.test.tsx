/**
 * BotonSistema danger variant and link form (docs/design-system.md).
 * Areas used to fake the danger look with class overrides on top of the
 * primary gradient, and wrapped buttons in `Link` with `tabIndex={-1}`.
 */
import { render, screen } from '@testing-library/react'
import Link from 'next/link'
import { ArrowRight, Trash2 } from 'lucide-react'

import { BotonSistema } from '@/components/ui/sistema-diseno'

describe('BotonSistema peligro', () => {
  it('uses the danger tokens instead of the primary gradient', () => {
    render(<BotonSistema variante="peligro">Eliminar</BotonSistema>)
    const boton = screen.getByRole('button', { name: 'Eliminar' })
    expect(boton).toHaveClass('bg-danger', 'text-danger-foreground', 'focus:ring-danger')
    expect(boton.className).not.toContain('bg-gradient')
    expect(boton.className).not.toContain('orange')
  })

  it('works as an icon-only button', () => {
    render(<BotonSistema variante="peligro" soloIcono icono={Trash2} aria-label="Eliminar" />)
    expect(screen.getByRole('button', { name: 'Eliminar' })).toHaveClass('bg-danger', 'w-11')
  })
})

describe('BotonSistema asChild', () => {
  it('renders the link with the button styles as a single tab stop', () => {
    const { container } = render(
      <BotonSistema asChild variante="outline" icono={ArrowRight} iconoPosicion="derecha">
        <Link href="/grupos-vida">Ver grupos</Link>
      </BotonSistema>
    )
    const enlace = screen.getByRole('link', { name: 'Ver grupos' })
    expect(enlace).toHaveAttribute('href', '/grupos-vida')
    expect(enlace).toHaveClass('h-11', 'rounded-xl', 'border-2')
    expect(screen.queryByRole('button')).toBeNull()
    expect(container.querySelectorAll('a, button')).toHaveLength(1)
    expect(enlace).not.toHaveAttribute('tabindex')
    // The icon stays inside the link, after the text.
    expect(enlace.lastElementChild?.tagName.toLowerCase()).toBe('svg')
  })

  it('supports icon-only links', () => {
    render(
      <BotonSistema asChild soloIcono icono={ArrowRight} aria-label="Abrir">
        <Link href="/x" />
      </BotonSistema>
    )
    const enlace = screen.getByRole('link', { name: 'Abrir' })
    expect(enlace).toHaveClass('w-11', 'px-0')
    expect(enlace.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('marks a disabled link with aria-disabled instead of the button attribute', () => {
    render(
      <BotonSistema asChild disabled>
        <Link href="/x">Continuar</Link>
      </BotonSistema>
    )
    const enlace = screen.getByRole('link', { name: 'Continuar' })
    expect(enlace).toHaveAttribute('aria-disabled', 'true')
    expect(enlace).not.toHaveAttribute('disabled')
    expect(enlace).toHaveClass('pointer-events-none', 'opacity-50')
  })

  it('keeps the plain button behavior when asChild is not set', () => {
    render(<BotonSistema disabled>Guardar</BotonSistema>)
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled()
  })
})
