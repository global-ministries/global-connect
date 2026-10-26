/**
 * The design system gallery (app/(auth)/design-system): every v2 piece on one
 * page for local and preview review, and a 404 in production.
 */
import type { ReactElement } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'

jest.mock('@/components/ui/desktop-header', () => ({
  DesktopHeader: ({ titulo }: { titulo?: string }) => (
    <header>
      <h1>{titulo}</h1>
    </header>
  ),
}))

const notFound = jest.fn(() => {
  throw new Error('NEXT_NOT_FOUND')
})
jest.mock('next/navigation', () => ({ notFound: () => notFound() }))

import DesignSystemPage from '@/app/(auth)/design-system/page'

const SECCIONES = [
  'Botones',
  'Tarjetas',
  'Insignias y estados',
  'Métricas de atención',
  'Tarjetas y pastillas de filtro',
  'Barra de herramientas',
  'Lista responsiva',
  'Vacío y carga',
  'Navegación móvil',
  'Hoja inferior',
]

describe('Design system gallery page', () => {
  const entornoOriginal = process.env.VERCEL_ENV

  afterEach(() => {
    if (entornoOriginal === undefined) delete process.env.VERCEL_ENV
    else process.env.VERCEL_ENV = entornoOriginal
    notFound.mockClear()
  })

  it.each(['preview', undefined])('renders every section when VERCEL_ENV is %s', async (entorno) => {
    if (entorno === undefined) delete process.env.VERCEL_ENV
    else process.env.VERCEL_ENV = entorno

    render(DesignSystemPage() as ReactElement)

    expect(await screen.findByRole('heading', { level: 1, name: 'Sistema de diseño' })).toBeInTheDocument()
    for (const seccion of SECCIONES) {
      expect(screen.getByRole('region', { name: seccion })).toBeInTheDocument()
    }
    expect(screen.getByRole('group', { name: 'Necesitan atención' })).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Servidores' })).toBeInTheDocument()
    expect(notFound).not.toHaveBeenCalled()
  })

  it('wires the sample interactions: metric toggle, sorting and the row detail', async () => {
    delete process.env.VERCEL_ENV
    render(DesignSystemPage() as ReactElement)

    const metrica = await screen.findByRole('button', { name: /Sin cuenta/ })
    expect(metrica).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(metrica)
    expect(metrica).toHaveAttribute('aria-pressed', 'true')

    const tabla = screen.getByRole('table', { name: 'Servidores' })
    const persona = within(tabla).getByRole('button', { name: 'Persona' })
    expect(persona.closest('[role="columnheader"]')).toHaveAttribute('aria-sort', 'ascending')
    fireEvent.click(persona)
    expect(persona.closest('[role="columnheader"]')).toHaveAttribute('aria-sort', 'descending')

    fireEvent.click(within(tabla).getByRole('button', { name: 'Abrir Ana Pérez' }))
    expect(await screen.findByRole('dialog', { name: 'Ana Pérez' })).toBeInTheDocument()
  })

  it('does not exist in production', () => {
    process.env.VERCEL_ENV = 'production'
    expect(() => DesignSystemPage()).toThrow('NEXT_NOT_FOUND')
    expect(notFound).toHaveBeenCalledTimes(1)
  })
})
