/**
 * Control size scale (docs/design-system.md): sm 36px (dense toolbars, 44px on
 * touch), md 44px (default), lg 48px. BotonSistema and ui/button map to the
 * same heights so both look identical while screens migrate, and the form
 * controls match md.
 */
import { render, screen } from '@testing-library/react'
import { Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  BotonSistema,
  InputSistema,
  SelectSistema,
  coloresMarca,
} from '@/components/ui/sistema-diseno'

describe('BotonSistema size scale', () => {
  it.each([
    ['sm', 'h-9', 'pointer-coarse:h-11'],
    ['md', 'h-11', null],
    ['lg', 'h-12', null],
  ] as const)('%s maps to %s', (tamaño, alto, altoTactil) => {
    render(<BotonSistema tamaño={tamaño}>Guardar</BotonSistema>)
    const boton = screen.getByRole('button', { name: 'Guardar' })
    expect(boton).toHaveClass(alto)
    if (altoTactil) expect(boton).toHaveClass(altoTactil)
    // The old min-h-[44px] floor made every size at least 44px tall.
    expect(boton.className).not.toContain('min-h-[44px]')
  })

  it('defaults to md and uses the control radius', () => {
    render(<BotonSistema>Guardar</BotonSistema>)
    const boton = screen.getByRole('button', { name: 'Guardar' })
    expect(boton).toHaveClass('h-11', 'rounded-xl')
  })

  it('renders an icon-only button as a square with its accessible label', () => {
    render(<BotonSistema soloIcono icono={Plus} aria-label="Agregar" tamaño="md" />)
    const boton = screen.getByRole('button', { name: 'Agregar' })
    expect(boton).toHaveClass('h-11', 'w-11', 'px-0')
    expect(boton.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('requires aria-label on icon-only buttons at the type level', () => {
    // @ts-expect-error an icon-only button without aria-label must not compile
    const sinEtiqueta = <BotonSistema soloIcono icono={Plus} />
    // @ts-expect-error an icon-only button takes no visible children
    const conHijos = <BotonSistema soloIcono icono={Plus} aria-label="Agregar">Agregar</BotonSistema>
    expect(sinEtiqueta).toBeTruthy()
    expect(conHijos).toBeTruthy()
  })
})

describe('ui/button maps to the same heights', () => {
  it.each([
    ['sm', 'h-9'],
    ['default', 'h-11'],
    ['lg', 'h-12'],
    ['icon', 'size-11'],
  ] as const)('size %s maps to %s', (size, alto) => {
    render(<Button size={size} aria-label="Acción">{size === 'icon' ? null : 'Acción'}</Button>)
    const boton = screen.getByRole('button', { name: 'Acción' })
    expect(boton).toHaveClass(alto, 'rounded-xl')
  })
})

describe('form controls match md', () => {
  it('InputSistema is 44px tall', () => {
    render(<InputSistema label="Nombre" />)
    expect(screen.getByLabelText('Nombre')).toHaveClass('h-11')
  })

  it('SelectSistema is 44px tall', () => {
    render(<SelectSistema label="Rol" opciones={[{ valor: 'a', etiqueta: 'A' }]} />)
    expect(screen.getByLabelText('Rol')).toHaveClass('h-11')
  })

  it('ui/input is 44px tall with the control radius', () => {
    render(<Input aria-label="Correo" />)
    expect(screen.getByLabelText('Correo')).toHaveClass('h-11', 'rounded-xl')
  })
})

describe('brand colors', () => {
  it('point at CSS variables instead of duplicating hex values', () => {
    for (const valor of Object.values(coloresMarca)) {
      expect(valor).toMatch(/^var\(--[a-z-]+\)$/)
    }
  })
})
