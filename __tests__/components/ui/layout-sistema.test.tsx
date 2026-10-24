/**
 * Layout primitives (docs/design-system.md): PaginaSistema with exactly two
 * widths, PieAccionesSistema (sticky action footer with safe area) and
 * PanelLateralSistema (side panel with two widths, scrollable @container body
 * and that footer).
 */
import { render, screen, within } from '@testing-library/react'

jest.mock('@/components/ui/desktop-header', () => ({
  DesktopHeader: ({ titulo, accionPrincipal }: { titulo?: string; accionPrincipal?: React.ReactNode }) => (
    <header data-testid="desktop-header">
      <h1>{titulo}</h1>
      {accionPrincipal}
    </header>
  ),
}))

import { PaginaSistema, PieAccionesSistema } from '@/components/ui/sistema-diseno'
import { PanelLateralSistema } from '@/components/ui/panel-lateral-sistema'

describe('PaginaSistema', () => {
  it.each([
    ['default', 'max-w-none'],
    ['form', 'max-w-3xl'],
  ] as const)('the %s width maps to %s', async (ancho, clase) => {
    render(<PaginaSistema titulo="Temporadas" ancho={ancho}>contenido</PaginaSistema>)
    const contenido = (await screen.findByText('contenido')).closest('[data-ancho]')
    expect(contenido).toHaveAttribute('data-ancho', ancho)
    expect(contenido).toHaveClass('w-full', clase)
  })

  it('defaults to the wide width', async () => {
    render(<PaginaSistema titulo="Temporadas">contenido</PaginaSistema>)
    const contenido = (await screen.findByText('contenido')).closest('[data-ancho]')
    expect(contenido).toHaveAttribute('data-ancho', 'default')
  })

  it('renders the title and actions in the header and the description above the content', async () => {
    render(
      <PaginaSistema titulo="Temporadas" descripcion="Administra los períodos" acciones={<button>Crear</button>}>
        contenido
      </PaginaSistema>
    )
    const header = await screen.findByTestId('desktop-header')
    expect(within(header).getByRole('heading', { name: 'Temporadas' })).toBeInTheDocument()
    expect(within(header).getByRole('button', { name: 'Crear' })).toBeInTheDocument()
    const descripcion = screen.getByText('Administra los períodos')
    expect(descripcion.closest('[data-ancho]')).not.toBeNull()
  })
})

describe('PieAccionesSistema', () => {
  it('is sticky with a top border, the page background and the safe-area bottom padding', () => {
    render(<PieAccionesSistema><button>Guardar</button></PieAccionesSistema>)
    const pie = screen.getByRole('button', { name: 'Guardar' }).parentElement
    expect(pie).toHaveClass('sticky', 'bottom-0', 'border-t', 'bg-[var(--surface-primary)]', 'safe-area-pb-md')
  })

  it('stacks full-width actions on mobile and right-aligns them from sm up', () => {
    render(<PieAccionesSistema><button>Guardar</button></PieAccionesSistema>)
    const pie = screen.getByRole('button', { name: 'Guardar' }).parentElement
    expect(pie).toHaveClass('flex-col-reverse', '*:w-full', 'sm:flex-row', 'sm:justify-end', 'sm:*:w-auto')
  })

  it('can sit at the end of a container without sticking', () => {
    render(<PieAccionesSistema fijo={false}><button>Guardar</button></PieAccionesSistema>)
    const pie = screen.getByRole('button', { name: 'Guardar' }).parentElement
    expect(pie).not.toHaveClass('sticky')
  })
})

describe('PanelLateralSistema', () => {
  it.each([
    ['md', 'sm:max-w-[480px]'],
    ['lg', 'sm:max-w-[640px]'],
  ] as const)('the %s size maps to %s', (tamaño, clase) => {
    render(
      <PanelLateralSistema abierto onAbiertoChange={() => {}} titulo="Agregar niño" tamaño={tamaño}>
        cuerpo
      </PanelLateralSistema>
    )
    expect(screen.getByRole('dialog', { name: 'Agregar niño' })).toHaveClass('w-full', clase)
  })

  it('scrolls a @container body and renders the footer outside it', () => {
    render(
      <PanelLateralSistema
        abierto
        onAbiertoChange={() => {}}
        titulo="Agregar niño"
        descripcion="Completa los datos"
        pie={<button>Guardar</button>}
      >
        cuerpo
      </PanelLateralSistema>
    )
    const cuerpo = screen.getByText('cuerpo')
    expect(cuerpo).toHaveClass('@container', 'overflow-y-auto', 'flex-1')
    const pie = screen.getByRole('button', { name: 'Guardar' }).parentElement
    expect(pie).toHaveClass('safe-area-pb-md', 'border-t')
    expect(pie).not.toHaveClass('sticky')
    expect(cuerpo).not.toContainElement(pie)
    expect(screen.getByText('Completa los datos')).toBeInTheDocument()
  })

  it('omits the footer when there are no actions', () => {
    render(
      <PanelLateralSistema abierto onAbiertoChange={() => {}} titulo="Detalle">
        cuerpo
      </PanelLateralSistema>
    )
    expect(screen.getByRole('dialog').querySelector('[data-slot="pie-acciones"]')).toBeNull()
  })
})
