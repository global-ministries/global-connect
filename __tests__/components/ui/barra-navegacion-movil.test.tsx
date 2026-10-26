/**
 * BarraNavegacionMovil + TituloGrande: the phone nav bar. Back is a link or a
 * button named "Volver a {etiqueta}"; the compact title appears only once the
 * large title's sentinel scrolls out; the actions slot renders.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react'

import {
  BarraNavegacionMovil,
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
  it('renders the 34px phone title and the summary line', () => {
    render(<Pantalla />)
    const titulo = screen.getByRole('heading', { level: 1, name: 'Servidores' })
    expect(titulo).toHaveClass('text-[34px]', 'font-bold')
    expect(titulo.closest('[data-slot="titulo-grande"]')).toHaveClass('md:hidden')
    expect(screen.getByText('48').tagName).toBe('STRONG')
    expect(screen.getByText(/personas/)).toBeInTheDocument()
  })
})
