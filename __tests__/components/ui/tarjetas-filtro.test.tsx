/**
 * TarjetasFiltro — the optional scope-card pieces of the Servidores prototype
 * (`.scope` / `.node`): flags, the stacked etapa bar and the "alcance"
 * presentation (chevron, auto-fill grid, inset grouped rows on phones).
 * Without them the cards render exactly as before (Mi equipo, Niños).
 */
import { render, screen, within } from '@testing-library/react'

import { TarjetasFiltro, type TarjetaFiltro, type TarjetasFiltroProps } from '@/components/ui/TarjetasFiltro'

const todas: TarjetaFiltro = { id: '', label: 'Toda la dirección', subtitulo: 'Dirige Nina Rodríguez', total: 12, badge: null }
const waumba: TarjetaFiltro = {
  id: 'w',
  label: 'Waumba Land',
  subtitulo: 'Coordina Wanda Pérez',
  total: 7,
  badge: null,
  insignias: [
    { texto: '2 por activar', tono: 'info' },
    { texto: '3 sin cuenta', tono: 'warning' },
  ],
  barraEtapas: [
    { tono: 'success', valor: 6, etiqueta: 'Activo' },
    { tono: 'info', valor: 2, etiqueta: 'En orientación' },
    { tono: 'warning', valor: 0, etiqueta: 'Postulado' },
  ],
}
const legado: TarjetaFiltro = { id: 'u', label: 'UpStreet', subtitulo: 'Coordina Daniel Ortega', total: 5, badge: '1 por activar' }

function renderTarjetas(props: Partial<TarjetasFiltroProps> = {}) {
  return render(
    <TarjetasFiltro
      todas={todas}
      items={[waumba, legado]}
      modoCompacto={false}
      seleccionadoId=""
      onSeleccionar={() => {}}
      unidad={{ singular: 'persona', plural: 'personas' }}
      etiqueta="Áreas"
      buscarEtiqueta="Buscar área"
      {...props}
    />,
  )
}

const tarjeta = (nombre: RegExp) => screen.getByRole('button', { name: nombre })

describe('TarjetasFiltro flags (insignias)', () => {
  it('renders each flag inside its card with the tone token', () => {
    renderTarjetas()
    const card = tarjeta(/Waumba Land/)
    expect(card).toHaveAccessibleName(expect.stringContaining('2 por activar'))
    expect(card).toHaveAccessibleName(expect.stringContaining('3 sin cuenta'))
    expect(within(card).getByText('3 sin cuenta')).toHaveClass('text-warning-text', 'bg-warning/10')
    expect(within(card).getByText('2 por activar')).toHaveClass('text-info-text', 'bg-info/10')
  })

  it('in the scope presentation the info flags hide on phones (warning only, as in the prototype)', () => {
    renderTarjetas({ presentacion: 'alcance' })
    const card = tarjeta(/Waumba Land/)
    expect(within(card).getByText('2 por activar')).toHaveClass('hidden', 'md:inline-flex')
    expect(within(card).getByText('3 sin cuenta')).not.toHaveClass('hidden')
  })

  it('the compact list shows the flags too', () => {
    renderTarjetas({ modoCompacto: true })
    expect(within(tarjeta(/Waumba Land/)).getByText('3 sin cuenta')).toBeInTheDocument()
  })
})

describe('TarjetasFiltro etapa bar (barraEtapas)', () => {
  it('draws one segment per non-empty etapa, sized by its share, filled with the tone token', () => {
    const { container } = renderTarjetas()
    const barra = container.querySelector('[data-barra-etapas]')
    expect(barra).toHaveAttribute('aria-hidden', 'true')
    const segmentos = Array.from(barra?.children ?? []) as HTMLElement[]
    expect(segmentos).toHaveLength(2)
    expect(segmentos[0]).toHaveClass('bg-success')
    expect(segmentos[0].style.width).toBe('75%')
    expect(segmentos[1]).toHaveClass('bg-info')
    expect(segmentos[1].style.width).toBe('25%')
  })

  it('says the etapas in words for screen readers (never color alone)', () => {
    renderTarjetas()
    expect(tarjeta(/Waumba Land/)).toHaveAccessibleName(expect.stringContaining('Activo 6, En orientación 2'))
  })

  it('hides the bar on phones', () => {
    const { container } = renderTarjetas({ presentacion: 'alcance' })
    expect(container.querySelector('[data-barra-etapas]')).toHaveClass('hidden', 'md:flex')
  })
})

describe('TarjetasFiltro scope presentation (presentacion="alcance")', () => {
  it('is an inset grouped list on phones and an auto-fill grid of cards from md', () => {
    renderTarjetas({ presentacion: 'alcance' })
    const grupo = screen.getByRole('group', { name: 'Áreas' })
    expect(grupo).toHaveClass('rounded-2xl', 'bg-card', 'md:grid-cols-[repeat(auto-fill,minmax(240px,1fr))]')
    expect(grupo).not.toHaveClass('overflow-x-auto')
  })

  it('every card is a 64px row with a chevron, the count to the right, and a pressed state', () => {
    renderTarjetas({ presentacion: 'alcance', seleccionadoId: 'w' })
    for (const card of within(screen.getByRole('group', { name: 'Áreas' })).getAllByRole('button')) {
      expect(card).toHaveClass('min-h-16')
      expect(card.querySelector('[data-chevron]')).toHaveAttribute('aria-hidden', 'true')
    }
    expect(tarjeta(/Waumba Land/)).toHaveAttribute('aria-pressed', 'true')
    expect(tarjeta(/Waumba Land/)).toHaveClass('bg-brand-tint')
    expect(within(tarjeta(/Waumba Land/)).getByText('Coordina Wanda Pérez')).toHaveClass('truncate')
  })

  it('shows a short responsible on one line, keeping the full name in title and for screen readers', () => {
    const largo: TarjetaFiltro = { ...waumba, subtitulo: 'Coordina Wanda Lucía Pérez', subtituloCorto: 'Coordina Wanda Pérez' }
    renderTarjetas({ presentacion: 'alcance', items: [largo, legado] })
    const card = tarjeta(/Waumba Land/)
    const linea = within(card).getByTitle('Coordina Wanda Lucía Pérez')
    expect(linea).toHaveClass('truncate', 'block')
    expect(within(linea).getByText('Coordina Wanda Pérez')).toHaveAttribute('aria-hidden', 'true')
    expect(within(linea).getByText('Coordina Wanda Lucía Pérez')).toHaveClass('sr-only')
    expect(card).toHaveAccessibleName(expect.stringContaining('Coordina Wanda Lucía Pérez'))
    expect(card).not.toHaveAccessibleName(expect.stringContaining('Coordina Wanda Pérez'))
  })

  it('separates the phone rows with hairlines inset 14px, none above the first row', () => {
    renderTarjetas({ presentacion: 'alcance' })
    const [primera, segunda] = within(screen.getByRole('group', { name: 'Áreas' })).getAllByRole('button')
    expect(primera).not.toHaveClass('before:left-3.5')
    expect(segunda).toHaveClass('before:left-3.5', 'md:before:hidden')
  })
})

describe('TarjetasFiltro without the "all" card (todas omitted)', () => {
  it.each([
    ['alcance', false],
    ['filtro', false],
    ['filtro', true],
  ] as const)('renders only the items (presentacion=%s, modoCompacto=%s)', (presentacion, modoCompacto) => {
    renderTarjetas({ todas: undefined, presentacion, modoCompacto })
    const botones = within(screen.getByRole('group', { name: 'Áreas' })).getAllByRole('button')
    expect(botones.map((boton) => boton.getAttribute('aria-pressed'))).toEqual(['false', 'false'])
    expect(screen.queryByRole('button', { name: /Toda la dirección/ })).not.toBeInTheDocument()
  })

  it('the first item of the scope list has no hairline above it', () => {
    renderTarjetas({ todas: undefined, presentacion: 'alcance' })
    expect(tarjeta(/Waumba Land/)).not.toHaveClass('before:left-3.5')
  })
})

describe('TarjetasFiltro without the new props (Mi equipo, Niños)', () => {
  it('keeps the scrollable pill row, the badge and no chevron, flags or bar', () => {
    const { container } = renderTarjetas({ items: [legado] })
    expect(screen.getByRole('group', { name: 'Áreas' })).toHaveClass('overflow-x-auto', 'xl:grid-cols-5')
    const card = tarjeta(/UpStreet/)
    expect(card).toHaveClass('rounded-full', 'md:min-h-[148px]')
    expect(within(card).getByText('1 por activar')).toBeInTheDocument()
    expect(container.querySelector('[data-chevron]')).toBeNull()
    expect(container.querySelector('[data-barra-etapas]')).toBeNull()
    expect(container.querySelector('[data-insignia]')).toBeNull()
  })
})
