/**
 * BarraNavegacionMovil + TituloGrande: the phone nav bar. Back is a link or a
 * button named "Volver a {etiqueta}"; the compact title appears only once the
 * large title's sentinel scrolls out; the actions slot renders.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react'

import {
  BarraNavegacionMovil,
  BotonAtrasMovil,
  NavegacionMovilProvider,
  TituloGrande,
} from '@/components/ui/barra-navegacion-movil'

type Callback = (entradas: Array<Partial<IntersectionObserverEntry>>) => void

let callbacks: Callback[] = []
let observados: Element[] = []
const desconectar = jest.fn()

const ioOriginal = window.IntersectionObserver
beforeEach(() => {
  callbacks = []
  observados = []
  desconectar.mockClear()
  window.IntersectionObserver = jest.fn((callback: Callback) => {
    callbacks.push(callback)
    return {
      observe: (elemento: Element) => observados.push(elemento),
      unobserve: jest.fn(),
      disconnect: desconectar,
      takeRecords: () => [],
    }
  }) as unknown as typeof IntersectionObserver
})
afterEach(() => {
  window.IntersectionObserver = ioOriginal
})

function emitir(visible: boolean) {
  act(() => callbacks.forEach((callback) => callback([{ isIntersecting: visible }])))
}

function Pantalla(props: Partial<React.ComponentProps<typeof BarraNavegacionMovil>>) {
  return (
    <NavegacionMovilProvider>
      <BarraNavegacionMovil titulo="Servidores" {...props} />
      <TituloGrande
        titulo="Servidores"
        resumen={
          <>
            <strong>48</strong> personas
          </>
        }
      />
    </NavegacionMovilProvider>
  )
}

const barra = () => screen.getByRole('navigation', { name: 'Navegación de Servidores' })

describe('BarraNavegacionMovil', () => {
  it('is phone-only, sticky and translucent', () => {
    render(<Pantalla />)
    expect(barra()).toHaveClass('md:hidden', 'sticky', 'top-0', 'backdrop-blur-xl')
  })

  it('renders back as a link when it has href', () => {
    render(<Pantalla atras={{ etiqueta: 'Dirección de Niños', href: '/dream-team' }} />)
    const atras = within(barra()).getByRole('link', { name: 'Volver a Dirección de Niños' })
    expect(atras).toHaveAttribute('href', '/dream-team')
    expect(atras).toHaveClass('min-h-11', 'focus-ring')
    expect(atras).toHaveTextContent('Dirección de Niños')
  })

  it('renders back as a button when it has a callback', () => {
    const onClick = jest.fn()
    render(<Pantalla atras={{ etiqueta: 'Equipos', onClick }} />)
    const atras = within(barra()).getByRole('button', { name: 'Volver a Equipos' })
    expect(atras).toHaveAttribute('type', 'button')
    fireEvent.click(atras)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('has no back control without atras', () => {
    render(<Pantalla />)
    expect(within(barra()).queryByRole('link')).toBeNull()
    expect(within(barra()).queryByRole('button')).toBeNull()
  })

  it('renders the actions slot', () => {
    render(<Pantalla acciones={<button type="button" aria-label="Filtros" />} />)
    expect(within(barra()).getByRole('button', { name: 'Filtros' })).toBeInTheDocument()
  })

  it('hides the compact title while the large title is visible and shows it once the sentinel leaves', () => {
    render(<Pantalla />)
    expect(observados).toHaveLength(1)
    const compacto = within(barra()).getByText('Servidores')
    expect(compacto).toHaveAttribute('aria-hidden', 'true')
    expect(compacto).toHaveClass('opacity-0')

    emitir(true)
    expect(compacto).toHaveAttribute('aria-hidden', 'true')
    expect(barra()).not.toHaveAttribute('data-desplazada')

    emitir(false)
    expect(compacto).not.toHaveAttribute('aria-hidden')
    expect(compacto).toHaveClass('opacity-100')
    expect(barra()).toHaveAttribute('data-desplazada')

    emitir(true)
    expect(compacto).toHaveAttribute('aria-hidden', 'true')
  })

  it('shows the compact title when the screen has no large title', () => {
    render(<BarraNavegacionMovil titulo="Ficha" />)
    const compacto = within(screen.getByRole('navigation', { name: 'Navegación de Ficha' })).getByText('Ficha')
    expect(compacto).not.toHaveAttribute('aria-hidden')
  })

  it('disconnects the observer on unmount', () => {
    const { unmount } = render(<Pantalla />)
    unmount()
    expect(desconectar).toHaveBeenCalled()
  })
})

describe('TituloGrande', () => {
  it('renders the 28px phone title (decision 2026-10-28) and the summary line', () => {
    render(<Pantalla />)
    const titulo = screen.getByRole('heading', { level: 1, name: 'Servidores' })
    expect(titulo).toHaveClass('text-[28px]', 'font-bold', 'tracking-[-0.03em]')
    expect(titulo).not.toHaveClass('text-[34px]')
    expect(titulo.closest('[data-slot="titulo-grande"]')).toHaveClass('md:hidden')
    expect(screen.getByText('48').tagName).toBe('STRONG')
    expect(screen.getByText(/personas/)).toBeInTheDocument()
  })

  it('renders an h2 with nivel={2}, for screens whose shell header already holds the h1', () => {
    render(<TituloGrande titulo="Dirección de Niños" nivel={2} />)
    expect(screen.getByRole('heading', { level: 2, name: 'Dirección de Niños' })).toHaveClass('text-[28px]')
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
  })

  it('renders only the summary line without a titulo', () => {
    const { container } = render(<TituloGrande resumen={<><strong>48</strong> personas</>} />)
    expect(screen.queryByRole('heading')).toBeNull()
    expect(container.querySelector('[data-slot="titulo-grande"]')).toHaveClass('md:hidden')
    expect(screen.getByText('48').tagName).toBe('STRONG')
  })
})

describe('BotonAtrasMovil', () => {
  it('is the bar\'s back control on its own: a 44px button named "Volver a …" with the label visible', () => {
    const onClick = jest.fn()
    render(<BotonAtrasMovil atras={{ etiqueta: 'Dirección de Alabanza', onClick }} className="max-w-[70%]" />)
    const atras = screen.getByRole('button', { name: 'Volver a Dirección de Alabanza' })
    expect(atras).toHaveClass('min-h-11', 'focus-ring', 'text-brand-text', 'max-w-[70%]')
    expect(atras).not.toHaveClass('max-w-[120px]')
    expect(atras).toHaveTextContent('Dirección de Alabanza')
    fireEvent.click(atras)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('is a link with href', () => {
    render(<BotonAtrasMovil atras={{ etiqueta: 'Dream Team', href: '/dream-team' }} />)
    expect(screen.getByRole('link', { name: 'Volver a Dream Team' })).toHaveAttribute('href', '/dream-team')
  })
})
