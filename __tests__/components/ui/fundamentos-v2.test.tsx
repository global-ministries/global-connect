/**
 * Design system v2 global foundations (docs/design-system/foundations.md,
 * migration.md#decisions-2026-10-26): flat cards on the card surface, the
 * flat brand fill for the primary button, one brand tint for pressed filters
 * and the two shadow tokens for floating layers.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { render, screen } from '@testing-library/react'

import { BotonSistema, TarjetaSistema } from '@/components/ui/sistema-diseno'
import { PastillaFiltro } from '@/components/ui/PastillasFiltro'
import { TarjetasFiltro, type TarjetaFiltro } from '@/components/ui/TarjetasFiltro'

const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8')

function bloque(selector: string): string {
  const inicio = css.indexOf(`${selector} {`)
  expect(inicio).toBeGreaterThanOrEqual(0)
  return css.slice(inicio, css.indexOf('\n}', inicio))
}

describe('shadow tokens', () => {
  it('defines the sheet and FAB shadows in light and dark', () => {
    expect(bloque(':root')).toContain('--shadow-sheet: 0 24px 60px -24px rgba(20, 20, 40, 0.28);')
    expect(bloque(':root')).toContain('--shadow-fab: 0 16px 36px -10px rgba(233, 108, 32, 0.75);')
    expect(bloque('.dark')).toContain('--shadow-sheet: 0 24px 60px -20px rgba(0, 0, 0, 0.7);')
    expect(bloque('.dark')).toContain('--shadow-fab: 0 16px 36px -10px rgba(233, 108, 32, 0.75);')
  })

  it('exposes them to Tailwind as shadow-sheet and shadow-fab', () => {
    const tema = bloque('@theme inline')
    expect(tema).toContain('--shadow-sheet: var(--shadow-sheet);')
    expect(tema).toContain('--shadow-fab: var(--shadow-fab);')
  })
})

describe('TarjetaSistema', () => {
  it.each(['default', 'elevated'] as const)('%s uses the flat card surface, not glass', (variante) => {
    render(<TarjetaSistema variante={variante} data-testid="tarjeta" />)
    const tarjeta = screen.getByTestId('tarjeta')
    expect(tarjeta).toHaveClass('bg-card', 'border', 'border-border', 'rounded-2xl', 'p-6')
    expect(tarjeta.className).not.toContain('glass')
    expect(tarjeta.className).not.toMatch(/\bshadow-/)
  })

  it('defaults to the card surface', () => {
    render(<TarjetaSistema data-testid="tarjeta" />)
    expect(screen.getByTestId('tarjeta')).toHaveClass('bg-card', 'border-border')
  })

  it('keeps outlined as it was', () => {
    render(<TarjetaSistema variante="outlined" data-testid="tarjeta" />)
    expect(screen.getByTestId('tarjeta')).toHaveClass('bg-card', 'border', 'border-border', 'shadow-lg')
  })
})

describe('BotonSistema primario', () => {
  it('is the flat brand-strong fill, with no gradient', () => {
    render(<BotonSistema>Guardar</BotonSistema>)
    const boton = screen.getByRole('button', { name: 'Guardar' })
    expect(boton).toHaveClass('bg-brand-strong', 'text-white', 'focus:ring-brand', 'h-11', 'rounded-xl')
    expect(boton.className).not.toContain('gradient')
    expect(boton.className).not.toContain('orange')
  })
})

describe('pressed filters use the single brand tint', () => {
  it('a pressed pill uses bg-brand-tint', () => {
    render(<PastillaFiltro etiqueta="Activo" cantidad={2} activa onClick={() => {}} />)
    const boton = screen.getByRole('button', { name: 'Activo 2' })
    expect(boton).toHaveClass('bg-brand-tint', 'border-brand')
    expect(boton.className).not.toContain('--brand-accent')
  })

  it('an unpressed pill has no tint', () => {
    render(<PastillaFiltro etiqueta="Activo" cantidad={2} activa={false} onClick={() => {}} />)
    expect(screen.getByRole('button', { name: 'Activo 2' })).not.toHaveClass('bg-brand-tint')
  })

  const todas: TarjetaFiltro = { id: 'todas', label: 'Toda la dirección', subtitulo: null, total: 5, badge: null }
  const items: TarjetaFiltro[] = [{ id: 'e1', label: 'Equipo uno', subtitulo: null, total: 3, badge: null }]

  function renderTarjetas(modoCompacto: boolean) {
    render(
      <TarjetasFiltro
        todas={todas}
        items={items}
        modoCompacto={modoCompacto}
        seleccionadoId="e1"
        onSeleccionar={() => {}}
        unidad={{ singular: 'persona', plural: 'personas' }}
        etiqueta="Equipos"
        buscarEtiqueta="Buscar equipo"
      />,
    )
  }

  it.each([false, true])('a pressed KPI card uses bg-brand-tint (modoCompacto=%s)', (modoCompacto) => {
    renderTarjetas(modoCompacto)
    const presionado = screen.getByRole('button', { name: /Equipo uno/, pressed: true })
    expect(presionado).toHaveClass('bg-brand-tint')
    expect(presionado.className).not.toContain('--brand-accent')
    expect(screen.getByRole('button', { name: /Toda la dirección/, pressed: false })).not.toHaveClass('bg-brand-tint')
  })
})
