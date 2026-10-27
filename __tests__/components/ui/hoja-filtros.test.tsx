/**
 * HojaFiltros, GrupoFiltro and SelectsFiltro — the filters sheet
 * (docs/design-system/patterns.md#toolbar-and-filters-sheet; prototype
 * `#fsheet`, `.group`, `.selects`, `.sheet-foot`). Side panel at md and up,
 * bottom sheet below md, through DetalleResponsivo.
 */
import { fireEvent, render, screen, within } from '@testing-library/react'

import { GrupoFiltro, HojaFiltros, SelectsFiltro } from '@/components/ui/hoja-filtros'

/** Mocks matchMedia so `(min-width: 768px)` matches when the viewport is desktop. */
function simularViewport(escritorio: boolean) {
  window.matchMedia = jest.fn((consulta: string) => ({
    matches: consulta === '(min-width: 768px)' ? escritorio : false,
    media: consulta,
    onchange: null,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    addListener: jest.fn(),
    removeListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })) as unknown as typeof window.matchMedia
}

const matchMediaOriginal = window.matchMedia
afterEach(() => {
  window.matchMedia = matchMediaOriginal
})

const UNIDAD = { singular: 'persona', plural: 'personas' }

function Hoja(props: Partial<React.ComponentProps<typeof HojaFiltros>>) {
  return (
    <HojaFiltros abierta onCambioAbierta={() => {}} resultados={12} unidad={UNIDAD} onLimpiar={() => {}} {...props}>
      <GrupoFiltro titulo="Etapa">
        <button type="button">Activo</button>
      </GrupoFiltro>
    </HojaFiltros>
  )
}

describe.each([
  ['desktop', true, 'sheet-content'],
  ['phone', false, 'drawer-content'],
])('HojaFiltros on %s', (_, escritorio, slot) => {
  beforeEach(() => simularViewport(escritorio))

  it('is a dialog named "Filtros" with its groups', () => {
    render(<Hoja />)
    const dialogo = screen.getByRole('dialog', { name: 'Filtros' })
    expect(dialogo).toHaveAttribute('data-slot', slot)
    expect(within(dialogo).getByRole('group', { name: 'Etapa' })).toBeInTheDocument()
    expect(within(dialogo).getByRole('button', { name: 'Activo' })).toBeInTheDocument()
  })

  // fireEvent: vaul's pointer handlers need setPointerCapture, which jsdom lacks.
  it('closes with "Ver N personas"', () => {
    const onCambioAbierta = jest.fn()
    render(<Hoja onCambioAbierta={onCambioAbierta} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ver 12 personas' }))
    expect(onCambioAbierta).toHaveBeenLastCalledWith(false)
  })

  it('clears with "Limpiar" and stays open', () => {
    const onLimpiar = jest.fn()
    const onCambioAbierta = jest.fn()
    render(<Hoja onLimpiar={onLimpiar} onCambioAbierta={onCambioAbierta} />)
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar' }))
    expect(onLimpiar).toHaveBeenCalledTimes(1)
    expect(onCambioAbierta).not.toHaveBeenCalled()
  })
})

describe('HojaFiltros', () => {
  beforeEach(() => simularViewport(true))

  it('uses the singular unit for one result', () => {
    render(<Hoja resultados={1} />)
    expect(screen.getByRole('button', { name: 'Ver 1 persona' })).toBeInTheDocument()
  })

  it('accepts another title', () => {
    render(<Hoja titulo="Filtrar grupos" />)
    expect(screen.getByRole('dialog', { name: 'Filtrar grupos' })).toBeInTheDocument()
  })

  it('renders nothing while closed', () => {
    render(<Hoja abierta={false} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('GrupoFiltro and SelectsFiltro', () => {
  it('labels the group with its uppercase title', () => {
    render(
      <GrupoFiltro titulo="Atención">
        <span>contenido</span>
      </GrupoFiltro>
    )
    const grupo = screen.getByRole('group', { name: 'Atención' })
    expect(within(grupo).getByText('Atención')).toHaveClass('uppercase')
    expect(within(grupo).getByText('contenido')).toBeInTheDocument()
  })

  it('lays selects out in 1 column on phone and 3 from md', () => {
    render(
      <SelectsFiltro>
        <span>Rol</span>
      </SelectsFiltro>
    )
    expect(screen.getByText('Rol').parentElement).toHaveClass('grid', 'grid-cols-1', 'md:grid-cols-3')
  })
})
