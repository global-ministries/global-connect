/**
 * --brand-strong: filled brand surfaces that carry text or icons (primary
 * button, FAB, count badges) use the darker orange so white text reaches
 * 4.70:1 (docs/design-system/foundations.md#brand-color-decided).
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { render, screen, within } from '@testing-library/react'

import { BotonSistema } from '@/components/ui/sistema-diseno'
import { BotonFlotante } from '@/components/ui/BotonFlotante'
import { BarraHerramientas, BotonFiltrosMovil } from '@/components/ui/barra-herramientas'

const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8')

function bloque(selector: string): string {
  const inicio = css.indexOf(`${selector} {`)
  expect(inicio).toBeGreaterThanOrEqual(0)
  return css.slice(inicio, css.indexOf('\n}', inicio))
}

describe('brand-strong tokens', () => {
  it.each([':root', '.dark'])('%s defines the strong fill and its hover', (selector) => {
    expect(bloque(selector)).toContain('--brand-strong: #BE5413;')
    expect(bloque(selector)).toContain('--brand-strong-hover: #B04E11;')
  })

  it('exposes them to Tailwind as brand-strong and brand-strong-hover', () => {
    const tema = bloque('@theme inline')
    expect(tema).toContain('--color-brand-strong: var(--brand-strong);')
    expect(tema).toContain('--color-brand-strong-hover: var(--brand-strong-hover);')
  })
})

describe('BotonSistema primario', () => {
  it('fills with brand-strong and white text, no gradient', () => {
    render(<BotonSistema>Guardar</BotonSistema>)
    const boton = screen.getByRole('button', { name: 'Guardar' })
    expect(boton).toHaveClass('bg-brand-strong', 'hover:bg-brand-strong-hover', 'text-white', 'h-11', 'rounded-xl')
    expect(boton).not.toHaveClass('bg-brand')
    expect(boton.className).not.toContain('gradient')
  })
})

describe('BotonFlotante', () => {
  it.each([
    ['link', { href: '/nuevo' }],
    ['button', { onClick: () => {} }],
  ] as const)('as a %s is a flat brand-strong fill with the FAB shadow', (rol, props) => {
    render(<BotonFlotante label="Crear nuevo" {...props} />)
    const fab = screen.getByRole(rol, { name: 'Crear nuevo' })
    expect(fab).toHaveClass('bg-brand-strong', 'hover:bg-brand-strong-hover', 'text-white', 'shadow-fab')
    expect(fab).toHaveClass('fixed', 'w-14', 'h-14', 'rounded-full', 'md:hidden')
    expect(fab.className).not.toMatch(/gradient|orange|shadow-xl/)
  })
})

describe('count badges', () => {
  it('the Filtros badge in the toolbar uses brand-strong', () => {
    render(
      <BarraHerramientas
        busqueda={{ valor: '', onCambio: () => {}, placeholder: 'Buscar', etiqueta: 'Buscar' }}
        filtrosActivos={3}
        onAbrirFiltros={() => {}}
      />,
    )
    const insignia = within(screen.getByRole('button', { name: 'Filtros, 3 activos' })).getByText('3')
    expect(insignia).toHaveClass('bg-brand-strong', 'text-white')
    expect(insignia).not.toHaveClass('bg-brand')
  })

  it('the phone Filtros badge uses brand-strong', () => {
    render(<BotonFiltrosMovil filtrosActivos={2} onClick={() => {}} />)
    const insignia = within(screen.getByRole('button', { name: 'Filtros, 2 activos' })).getByText('2')
    expect(insignia).toHaveClass('bg-brand-strong', 'text-white')
    expect(insignia).not.toHaveClass('bg-brand')
  })
})
