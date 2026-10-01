/**
 * `<ListaPersonas>` — the people of the selected team in Mi equipo, each with
 * the phone on their profile and a "Sin cuenta" mark, presented exactly like
 * Servidores does (same phone component, same marker wording).
 *
 *  - recognized mobile: formatted, a WhatsApp link in a new tab;
 *  - unrecognizable: the stored text with a "Revisar teléfono" warning;
 *  - no phone: nothing;
 *  - `tieneCuenta === false`: "Sin cuenta"; true or null (unknown): no mark.
 */
import { render, screen, within } from '@testing-library/react'

import { ListaPersonas, type ListaPersonasProps } from '@/components/dream-team/mi-equipo/lista-personas'
import { contadoresPorEstado, type PersonaVista } from '@/lib/platform/dream-team/mi-equipo-vista'
import { personaId } from '@/lib/platform/dream-team/types'

function persona(clave: string, nombre: string, contacto: Partial<Pick<PersonaVista, 'telefono' | 'tieneCuenta'>> = {}): PersonaVista {
  return {
    clave,
    personaId: personaId(`persona-${clave}`),
    nombre,
    iniciales: nombre.slice(0, 2).toUpperCase(),
    equipoId: 'eq-1',
    equipoLabel: 'Equipo Uno',
    rolClave: 'facilitador',
    rolLabel: 'Facilitador',
    rolOrden: 3,
    estado: 'activo',
    origen: 'dream_team',
    editable: true,
    telefono: null,
    tieneCuenta: null,
    ...contacto,
  }
}

function renderLista(personas: readonly PersonaVista[], overrides: Partial<ListaPersonasProps> = {}) {
  return render(
    <ListaPersonas
      titulo="Equipo Uno"
      subtitulo="Personas del equipo"
      personas={personas}
      contadores={contadoresPorEstado(personas)}
      filtro="todos"
      onFiltroChange={jest.fn()}
      hayBusqueda={false}
      puedeEditar={false}
      onActualizado={jest.fn()}
      {...overrides}
    />,
  )
}

const fila = (nombre: string) => {
  const lista = screen.getByRole('list', { name: 'Personas del equipo' })
  const encontrada = within(lista)
    .getAllByRole('listitem')
    .find((item) => item.textContent?.includes(nombre))
  if (!encontrada) throw new Error(`row of ${nombre} not found`)
  return within(encontrada)
}

describe('ListaPersonas — phone', () => {
  it('shows a recognized mobile as a WhatsApp link that opens in a new tab', () => {
    renderLista([persona('a', 'Ana Perez', { telefono: '04125457346' })])

    const enlace = fila('Ana Perez').getByRole('link', { name: /0412 545 7346/ })
    expect(enlace).toHaveTextContent('0412 545 7346 · WhatsApp')
    expect(enlace.getAttribute('href')).toMatch(/^https:\/\/(wa\.me|api\.whatsapp\.com)\//)
    expect(enlace).toHaveAttribute('target', '_blank')
    expect(enlace).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })

  it('shows the stored text, with a warning and no link, when the phone is not recognizable', () => {
    renderLista([persona('b', 'Bea Gomez', { telefono: '123' })])

    const celda = fila('Bea Gomez')
    expect(celda.getByText('123')).toBeInTheDocument()
    expect(celda.getByText('Revisar teléfono')).toBeInTheDocument()
    expect(celda.queryByRole('link')).not.toBeInTheDocument()
  })

  it('shows nothing when there is no phone (none on the profile, or not visible to the caller)', () => {
    renderLista([persona('c', 'Carla Diaz', { telefono: null }), persona('d', 'Dora Ruiz', { telefono: '' })])

    for (const nombre of ['Carla Diaz', 'Dora Ruiz']) {
      const celda = fila(nombre)
      expect(celda.queryByRole('link')).not.toBeInTheDocument()
      expect(celda.queryByText('Revisar teléfono')).not.toBeInTheDocument()
      expect(celda.queryByText(/WhatsApp/)).not.toBeInTheDocument()
    }
  })

  it('keeps the phone of each person on that person\'s row', () => {
    renderLista([
      persona('a', 'Ana Perez', { telefono: '04125457346' }),
      persona('e', 'Eva Lopez', { telefono: '04245551111' }),
    ])

    expect(fila('Ana Perez').getByRole('link', { name: /0412 545 7346/ })).toBeInTheDocument()
    expect(fila('Ana Perez').queryByRole('link', { name: /0424 555 1111/ })).not.toBeInTheDocument()
    expect(fila('Eva Lopez').getByRole('link', { name: /0424 555 1111/ })).toBeInTheDocument()
  })
})

describe('ListaPersonas — account mark', () => {
  it('marks a person who has no account', () => {
    renderLista([persona('f', 'Fede Sosa', { tieneCuenta: false })])

    expect(fila('Fede Sosa').getByText('Sin cuenta')).toBeInTheDocument()
  })

  it('has no mark when the person has an account', () => {
    renderLista([persona('g', 'Gina Mora', { tieneCuenta: true })])

    expect(fila('Gina Mora').queryByText('Sin cuenta')).not.toBeInTheDocument()
  })

  it('has no mark when the account state is unknown (not visible to the caller): never "Sin cuenta"', () => {
    renderLista([persona('h', 'Hugo Paz', { tieneCuenta: null })])

    expect(fila('Hugo Paz').queryByText('Sin cuenta')).not.toBeInTheDocument()
  })

  it('shows the mark and the phone together, and neither adds an edit action', () => {
    renderLista([persona('i', 'Ines Vega', { telefono: '04125457346', tieneCuenta: false })])

    const celda = fila('Ines Vega')
    expect(celda.getByText('Sin cuenta')).toBeInTheDocument()
    expect(celda.getByRole('link', { name: /0412 545 7346/ })).toBeInTheDocument()
    expect(celda.queryByRole('button')).not.toBeInTheDocument()
  })

  it('also shows it for a Grupos de Vida person, who is read-only', () => {
    renderLista([{ ...persona('j', 'Juan Gil', { telefono: '04245551111', tieneCuenta: false }), origen: 'grupos_vida', editable: false }])

    const celda = fila('Juan Gil')
    expect(celda.getByText('Sin cuenta')).toBeInTheDocument()
    expect(celda.getByRole('link', { name: /0424 555 1111/ })).toBeInTheDocument()
  })
})
