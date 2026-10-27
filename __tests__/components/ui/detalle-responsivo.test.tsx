/**
 * DetalleResponsivo: one API for detail overlays. At md (768px) and up it is
 * the side panel; below md it is the bottom sheet. Only one overlay mounts.
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { renderToString } from 'react-dom/server'

import { DetalleResponsivo } from '@/components/ui/detalle-responsivo'

type Oyente = (evento: MediaQueryListEvent) => void

/** Mocks matchMedia so `(min-width: 768px)` matches when the viewport is desktop. */
function simularViewport(escritorio: boolean) {
  let coincide = escritorio
  const oyentes = new Set<Oyente>()
  const consultas: string[] = []
  window.matchMedia = jest.fn((consulta: string) => {
    consultas.push(consulta)
    return {
      get matches() {
        return consulta === '(min-width: 768px)' ? coincide : false
      },
      media: consulta,
      onchange: null,
      addEventListener: (_: string, oyente: Oyente) => oyentes.add(oyente),
      removeEventListener: (_: string, oyente: Oyente) => oyentes.delete(oyente),
      addListener: jest.fn(),
      removeListener: jest.fn(),
      dispatchEvent: jest.fn(),
    } as unknown as MediaQueryList
  })
  return {
    consultas,
    cambiar(siguiente: boolean) {
      coincide = siguiente
      act(() => oyentes.forEach((oyente) => oyente({ matches: siguiente } as MediaQueryListEvent)))
    },
  }
}

const matchMediaOriginal = window.matchMedia
afterEach(() => {
  window.matchMedia = matchMediaOriginal
})

function Detalle(props: Partial<React.ComponentProps<typeof DetalleResponsivo>>) {
  return (
    <DetalleResponsivo
      abierto
      onCambioAbierto={() => {}}
      titulo="Ana Pérez"
      descripcion="Servidora en Niños"
      pie={<button type="button">Guardar</button>}
      {...props}
    >
      <p>Detalle</p>
    </DetalleResponsivo>
  )
}

describe('DetalleResponsivo', () => {
  it('uses the 768px cut', () => {
    const viewport = simularViewport(true)
    render(<Detalle />)
    expect(viewport.consultas).toContain('(min-width: 768px)')
  })

  it('renders the side panel at md and up, and only that overlay', () => {
    simularViewport(true)
    render(<Detalle />)
    const dialogos = screen.getAllByRole('dialog')
    expect(dialogos).toHaveLength(1)
    expect(dialogos[0]).toHaveAccessibleName('Ana Pérez')
    expect(dialogos[0]).toHaveAttribute('data-slot', 'sheet-content')
    expect(dialogos[0]).toHaveClass('sm:max-w-[480px]')
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeInTheDocument()
    expect(document.querySelector('[data-slot="drawer-content"]')).toBeNull()
  })

  it('passes the width to the side panel', () => {
    simularViewport(true)
    render(<Detalle ancho="lg" />)
    expect(screen.getByRole('dialog')).toHaveClass('sm:max-w-[640px]')
  })

  it('renders the bottom sheet below md, and only that overlay', () => {
    simularViewport(false)
    render(<Detalle />)
    const dialogos = screen.getAllByRole('dialog')
    expect(dialogos).toHaveLength(1)
    expect(dialogos[0]).toHaveAccessibleName('Ana Pérez')
    expect(dialogos[0]).toHaveAttribute('data-slot', 'drawer-content')
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeInTheDocument()
    expect(document.querySelector('[data-slot="sheet-content"]')).toBeNull()
  })

  it('switches overlay when the viewport crosses the breakpoint', () => {
    const viewport = simularViewport(true)
    render(<Detalle />)
    expect(screen.getByRole('dialog')).toHaveAttribute('data-slot', 'sheet-content')
    viewport.cambiar(false)
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.getByRole('dialog')).toHaveAttribute('data-slot', 'drawer-content')
  })

  it('forwards close requests from either overlay', () => {
    simularViewport(true)
    const onCambioAbierto = jest.fn()
    const { unmount } = render(<Detalle onCambioAbierto={onCambioAbierto} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(onCambioAbierto).toHaveBeenLastCalledWith(false)
    unmount()

    simularViewport(false)
    onCambioAbierto.mockClear()
    render(<Detalle onCambioAbierto={onCambioAbierto} />)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onCambioAbierto).toHaveBeenLastCalledWith(false)
  })

  it('renders nothing on the server, so hydration cannot mismatch', () => {
    simularViewport(false)
    expect(renderToString(<Detalle />)).toBe('')
  })
})
