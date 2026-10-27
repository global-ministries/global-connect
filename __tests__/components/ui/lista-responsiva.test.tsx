/**
 * ListaResponsiva — the list of a list screen (docs/design-system/patterns.md
 * #list-screen-anatomy; prototype `.list`, `.list-h`, `.row`). One ARIA table
 * for every width; CSS swaps the layout: header and grid cells from md up,
 * an inset grouped row (avatar, title, subtitle, chevron) below md. Both
 * structures are in the DOM, so these tests assert each one and the classes
 * that show it at its width.
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ListaResponsiva, type ColumnaLista } from '@/components/ui/lista-responsiva'

interface Persona {
  id: string
  nombre: string
  equipo: string
  turno: string
}

const PERSONAS: readonly Persona[] = [
  { id: 'p1', nombre: 'Ana Pérez', equipo: 'Bienvenida', turno: '9:00' },
  { id: 'p2', nombre: 'Luis Gómez', equipo: 'Alabanza', turno: '11:00' },
]

const COLUMNAS: readonly ColumnaLista[] = [
  { id: 'persona', titulo: 'Persona', ordenable: true, ancho: 'minmax(240px,1.1fr)' },
  { id: 'equipo', titulo: 'Equipo', ordenable: true },
  { id: 'turno', titulo: 'Turno', ancho: '150px', ocultarEnTablet: true },
]

function Lista(props: Partial<React.ComponentProps<typeof ListaResponsiva<Persona>>>) {
  return (
    <ListaResponsiva<Persona>
      etiqueta="Servidores"
      columnas={COLUMNAS}
      filas={PERSONAS}
      claveFila={(p) => p.id}
      renderCelda={(p, columna) => (columna === 'persona' ? p.nombre : columna === 'equipo' ? p.equipo : p.turno)}
      renderFilaMovil={(p) => ({
        titulo: p.nombre,
        subtitulo: p.equipo,
        avatar: <span data-testid={`avatar-${p.id}`} />,
        meta: <span>meta {p.id}</span>,
      })}
      onAbrirFila={() => {}}
      etiquetaFila={(p) => `Abrir ${p.nombre}`}
      {...props}
    />
  )
}

describe('ListaResponsiva', () => {
  it('is a named table with a header row and one row per item', () => {
    render(<Lista />)
    const tabla = screen.getByRole('table', { name: 'Servidores' })
    const filas = within(tabla).getAllByRole('row')
    expect(filas).toHaveLength(3)
    const cabeceras = within(filas[0]).getAllByRole('columnheader')
    expect(cabeceras.slice(0, 3).map((c) => c.textContent)).toEqual(['Persona', 'Equipo', 'Turno'])
    expect(within(filas[1]).getByText('Bienvenida', { selector: '[role="cell"]' })).toBeInTheDocument()
  })

  it('shows the header and grid cells from md up only', () => {
    render(<Lista />)
    const [cabecera, fila] = screen.getAllByRole('row')
    expect(cabecera).toHaveClass('hidden', 'md:grid')
    expect(fila).toHaveClass('md:grid')
    const celdaEquipo = within(fila).getByText('Bienvenida', { selector: '[role="cell"]' })
    expect(celdaEquipo).toHaveClass('hidden', 'md:flex')
  })

  it('hides tablet-hidden columns between md and lg', () => {
    render(<Lista />)
    const [cabecera, fila] = screen.getAllByRole('row')
    expect(within(cabecera).getByRole('columnheader', { name: 'Turno' })).toHaveClass('hidden', 'lg:flex')
    expect(within(fila).getByText('9:00').closest('[role="cell"]')).toHaveClass('hidden', 'lg:flex')
  })

  it('sets the grid tracks for tablet and desktop, never plain 1fr', () => {
    render(<Lista />)
    const tabla = screen.getByRole('table')
    expect(tabla.style.getPropertyValue('--columnas-escritorio')).toBe('minmax(240px,1.1fr) minmax(0,1fr) 150px 28px')
    expect(tabla.style.getPropertyValue('--columnas-tableta')).toBe('minmax(240px,1.1fr) minmax(0,1fr) 28px')
    expect(screen.getAllByRole('row')[1]).toHaveClass('md:grid-cols-(--columnas-tableta)', 'lg:grid-cols-(--columnas-escritorio)')
  })

  it('renders the phone row: title, subtitle, avatar and meta, only below md', () => {
    render(<Lista />)
    const fila = screen.getAllByRole('row')[1]
    const movil = within(fila).getByText('Ana Pérez', { selector: '[data-slot="fila-movil-titulo"]' }).closest('[role="cell"]')
    expect(movil).toHaveClass('flex', 'md:hidden')
    expect(within(movil as HTMLElement).getByText('Bienvenida')).toBeInTheDocument()
    expect(within(movil as HTMLElement).getByTestId('avatar-p1')).toBeInTheDocument()
    expect(within(movil as HTMLElement).getByText('meta p1')).toBeInTheDocument()
  })

  it('insets the phone divider past the avatar', () => {
    render(<Lista renderFilaMovil={(p) => ({ titulo: p.nombre, avatar: p.id === 'p2' ? <span /> : undefined })} />)
    const [, primera, segunda] = screen.getAllByRole('row')
    expect(primera).not.toHaveClass('before:absolute')
    expect(segunda).toHaveClass('before:left-[66px]')
  })

  it('opens a row by click, Enter and Space through its named button', async () => {
    const onAbrirFila = jest.fn()
    render(<Lista onAbrirFila={onAbrirFila} />)
    const boton = screen.getByRole('button', { name: 'Abrir Luis Gómez' })
    await userEvent.click(boton)
    expect(onAbrirFila).toHaveBeenLastCalledWith(PERSONAS[1])

    onAbrirFila.mockClear()
    boton.focus()
    await userEvent.keyboard('{Enter}')
    await userEvent.keyboard(' ')
    expect(onAbrirFila).toHaveBeenCalledTimes(2)
    expect(onAbrirFila).toHaveBeenCalledWith(PERSONAS[1])
  })

  it('stretches the row button over the row and rings the row on keyboard focus', () => {
    render(<Lista />)
    const boton = screen.getByRole('button', { name: 'Abrir Ana Pérez' })
    expect(boton).toHaveClass('after:absolute', 'after:inset-0')
    expect(screen.getAllByRole('row')[1]).toHaveClass('relative', 'has-[:focus-visible]:ring-2')
  })

  it('renders sortable headers as buttons, with aria-sort and an arrow on the active one', async () => {
    const onOrdenar = jest.fn()
    render(<Lista orden={{ columna: 'persona', sentido: 'desc' }} onOrdenar={onOrdenar} />)
    const persona = screen.getByRole('columnheader', { name: /Persona/ })
    const equipo = screen.getByRole('columnheader', { name: /Equipo/ })
    const turno = screen.getByRole('columnheader', { name: 'Turno' })
    expect(persona).toHaveAttribute('aria-sort', 'descending')
    expect(persona).toHaveTextContent('Persona ↓')
    expect(equipo).not.toHaveAttribute('aria-sort')
    expect(within(turno).queryByRole('button')).toBeNull()

    await userEvent.click(within(equipo).getByRole('button', { name: 'Equipo' }))
    expect(onOrdenar).toHaveBeenCalledWith('equipo')
  })

  it('marks ascending order with ↑', () => {
    render(<Lista orden={{ columna: 'equipo', sentido: 'asc' }} onOrdenar={() => {}} />)
    const equipo = screen.getByRole('columnheader', { name: /Equipo/ })
    expect(equipo).toHaveAttribute('aria-sort', 'ascending')
    expect(equipo).toHaveTextContent('Equipo ↑')
    // The button is a flex box, which drops the text space before the arrow; the gap draws it.
    expect(within(equipo).getByRole('button', { name: 'Equipo' })).toHaveClass('gap-1')
  })

  it('shows loading rows instead of the items while loading', () => {
    render(<Lista cargando />)
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByRole('button', { name: 'Abrir Ana Pérez' })).toBeNull()
  })

  it('shows the empty state when there are no items', () => {
    render(<Lista filas={[]} vacio={<p>Nadie coincide con estos filtros</p>} />)
    expect(screen.getByText('Nadie coincide con estos filtros')).toBeInTheDocument()
    expect(screen.queryByRole('table')).toBeNull()
  })
})
