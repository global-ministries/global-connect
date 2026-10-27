/**
 * BarraHerramientas, BotonFiltrosMovil and ChipsFiltrosActivos — the list
 * toolbar (docs/design-system/patterns.md#toolbar-and-filters-sheet;
 * prototype `.toolbar`, `.search`, `.chips`).
 */
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { BarraHerramientas, BotonFiltrosMovil, ChipsFiltrosActivos } from '@/components/ui/barra-herramientas'

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

function Barra(props: Partial<React.ComponentProps<typeof BarraHerramientas>>) {
  return (
    <BarraHerramientas
      busqueda={{ valor: '', onCambio: () => {}, placeholder: 'Buscar por nombre o teléfono', etiqueta: 'Buscar servidores' }}
      filtrosActivos={0}
      onAbrirFiltros={() => {}}
      {...props}
    />
  )
}

describe('BarraHerramientas', () => {
  it('renders a named search box that reports each change', async () => {
    const onCambio = jest.fn()
    render(<Barra busqueda={{ valor: '', onCambio, placeholder: 'Buscar por nombre o teléfono', etiqueta: 'Buscar servidores' }} />)
    const busqueda = screen.getByRole('searchbox', { name: 'Buscar servidores' })
    expect(busqueda).toHaveAttribute('placeholder', 'Buscar por nombre o teléfono')
    await userEvent.type(busqueda, 'a')
    expect(onCambio).toHaveBeenLastCalledWith('a')
  })

  it('shows the current search value', () => {
    render(<Barra busqueda={{ valor: 'Ana', onCambio: () => {}, placeholder: 'Buscar', etiqueta: 'Buscar servidores' }} />)
    expect(screen.getByRole('searchbox', { name: 'Buscar servidores' })).toHaveValue('Ana')
  })

  it('focuses the search when "/" is pressed on desktop', () => {
    simularViewport(true)
    render(<Barra />)
    const evento = fireEvent.keyDown(document.body, { key: '/' })
    expect(screen.getByRole('searchbox', { name: 'Buscar servidores' })).toHaveFocus()
    // The "/" is consumed, so it is not typed into the search.
    expect(evento).toBe(false)
  })

  it('ignores "/" while typing in another field', () => {
    simularViewport(true)
    render(
      <>
        <input aria-label="Otro campo" />
        <Barra />
      </>
    )
    const otro = screen.getByRole('textbox', { name: 'Otro campo' })
    otro.focus()
    const evento = fireEvent.keyDown(otro, { key: '/' })
    expect(otro).toHaveFocus()
    expect(evento).toBe(true)
  })

  it('ignores "/" on phone', () => {
    simularViewport(false)
    render(<Barra />)
    fireEvent.keyDown(document.body, { key: '/' })
    expect(screen.getByRole('searchbox', { name: 'Buscar servidores' })).not.toHaveFocus()
  })

  it('ignores "/" with a modifier key', () => {
    simularViewport(true)
    render(<Barra />)
    fireEvent.keyDown(document.body, { key: '/', metaKey: true })
    expect(screen.getByRole('searchbox', { name: 'Buscar servidores' })).not.toHaveFocus()
  })

  it('shows the "/" hint only from md up', () => {
    render(<Barra />)
    expect(screen.getByText('/', { selector: 'kbd' })).toHaveClass('hidden', 'md:inline-flex')
  })

  it('names the Filtros button with the active count and shows a badge', async () => {
    const onAbrirFiltros = jest.fn()
    render(<Barra filtrosActivos={3} onAbrirFiltros={onAbrirFiltros} />)
    const boton = screen.getByRole('button', { name: 'Filtros, 3 activos' })
    expect(within(boton).getByText('3')).toBeInTheDocument()
    await userEvent.click(boton)
    expect(onAbrirFiltros).toHaveBeenCalledTimes(1)
  })

  it('uses the singular for one active filter', () => {
    render(<Barra filtrosActivos={1} />)
    expect(screen.getByRole('button', { name: 'Filtros, 1 activo' })).toBeInTheDocument()
  })

  it('shows a plain Filtros button without a badge when nothing is active', () => {
    render(<Barra filtrosActivos={0} />)
    const boton = screen.getByRole('button', { name: 'Filtros' })
    expect(within(boton).queryByText('0')).toBeNull()
  })

  it('renders the view slot and hides it and the Filtros button below md', () => {
    render(<Barra vista={<div role="group" aria-label="Vista" />} />)
    const vista = screen.getByRole('group', { name: 'Vista' })
    expect(vista.parentElement).toHaveClass('hidden', 'md:flex')
    expect(screen.getByRole('button', { name: 'Filtros' })).toHaveClass('hidden', 'md:inline-flex')
  })
})

describe('BotonFiltrosMovil', () => {
  it('is a 44px icon button named with the active count', async () => {
    const onClick = jest.fn()
    render(<BotonFiltrosMovil filtrosActivos={2} onClick={onClick} />)
    const boton = screen.getByRole('button', { name: 'Filtros, 2 activos' })
    expect(boton).toHaveClass('size-11')
    expect(within(boton).getByText('2')).toBeInTheDocument()
    await userEvent.click(boton)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('has no badge when nothing is active', () => {
    render(<BotonFiltrosMovil filtrosActivos={0} onClick={() => {}} />)
    const boton = screen.getByRole('button', { name: 'Filtros' })
    expect(boton.textContent).toBe('')
  })
})

describe('ChipsFiltrosActivos', () => {
  const CHIPS = [
    { id: 'etapa', etiqueta: 'Activo' },
    { id: 'rol', etiqueta: 'Líder' },
  ]

  it('renders one chip per active filter with a remove button', async () => {
    const onQuitar = jest.fn()
    render(<ChipsFiltrosActivos chips={CHIPS} onQuitar={onQuitar} onLimpiarTodo={() => {}} />)
    const grupo = screen.getByRole('group', { name: 'Filtros activos' })
    expect(within(grupo).getByText('Activo')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Quitar Líder' }))
    expect(onQuitar).toHaveBeenCalledWith('rol')
  })

  it('offers "Limpiar todo" from two chips up', async () => {
    const onLimpiarTodo = jest.fn()
    render(<ChipsFiltrosActivos chips={CHIPS} onQuitar={() => {}} onLimpiarTodo={onLimpiarTodo} />)
    await userEvent.click(screen.getByRole('button', { name: 'Limpiar todo' }))
    expect(onLimpiarTodo).toHaveBeenCalledTimes(1)
  })

  it('has no "Limpiar todo" with a single chip', () => {
    render(<ChipsFiltrosActivos chips={CHIPS.slice(0, 1)} onQuitar={() => {}} onLimpiarTodo={() => {}} />)
    expect(screen.getByRole('button', { name: 'Quitar Activo' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Limpiar todo' })).toBeNull()
  })

  it('renders nothing without chips', () => {
    const { container } = render(<ChipsFiltrosActivos chips={[]} onQuitar={() => {}} onLimpiarTodo={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('scrolls horizontally on phone and wraps from md', () => {
    render(<ChipsFiltrosActivos chips={CHIPS} onQuitar={() => {}} onLimpiarTodo={() => {}} />)
    expect(screen.getByRole('group', { name: 'Filtros activos' })).toHaveClass('overflow-x-auto', 'md:flex-wrap')
  })
})
