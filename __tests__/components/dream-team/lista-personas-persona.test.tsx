/**
 * `<ListaPersonas>` lists a person once (S12): name, phone and marks once and
 * the person's servicios stacked in the same row, each with its equipo, rol,
 * etapa, turno and its own "⋯" menu; past three servicios "+N más" expands
 * the rest, as in Servidores.
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ListaPersonas, type ListaPersonasProps } from '@/components/dream-team/mi-equipo/lista-personas'
import { contadoresPorEstado, type PersonaVista } from '@/lib/platform/dream-team/mi-equipo-vista'
import { personaId } from '@/lib/platform/dream-team/types'

function servicio(quien: string, nombre: string, equipoLabel: string, extra: Partial<PersonaVista> = {}): PersonaVista {
  return {
    clave: `${quien}-${equipoLabel}`,
    servicioId: `servicio-${quien}-${equipoLabel}`,
    version: 1,
    personaId: personaId(`persona-${quien}`),
    nombre,
    iniciales: 'XX',
    equipoId: `eq-${equipoLabel}`,
    equipoLabel,
    rolClave: 'voluntario',
    rolLabel: 'Voluntario',
    rolOrden: 5,
    estado: 'activo',
    origen: 'dream_team',
    editable: true,
    telefono: null,
    tieneCuenta: null,
    ...extra,
  }
}

function renderLista(personas: readonly PersonaVista[], overrides: Partial<ListaPersonasProps> = {}) {
  return render(
    <ListaPersonas
      titulo="Estudiantes"
      subtitulo="Personas del equipo"
      personas={personas}
      contadores={contadoresPorEstado(personas)}
      filtro="todos"
      onFiltroChange={jest.fn()}
      hayBusqueda={false}
      puedeEditar
      onActualizado={jest.fn()}
      {...overrides}
    />,
  )
}

const filas = () => within(screen.getByRole('list', { name: 'Personas del equipo' })).getAllByRole('listitem')

describe('ListaPersonas — one row per person', () => {
  const gabriel = [
    servicio('gabriel', 'Gabriel Salas', 'Banda', { rolClave: 'coordinador', rolLabel: 'Coordinador', rolOrden: 2, telefono: '04125457346', tieneCuenta: false }),
    servicio('gabriel', 'Gabriel Salas', 'Coro', { estado: 'en_pausa' }),
  ]

  it('shows a person with two servicios in one row, with the name, phone and marks once', () => {
    renderLista([...gabriel, servicio('ana', 'Ana Ruiz', 'Coro')])

    expect(filas()).toHaveLength(2)
    const fila = within(filas()[0])
    expect(fila.getAllByText('Gabriel Salas')).toHaveLength(1)
    expect(fila.getAllByRole('link', { name: /0412 545 7346/ })).toHaveLength(1)
    expect(fila.getAllByText('Sin cuenta')).toHaveLength(1)
  })

  it('stacks each servicio with its equipo, rol and etapa', () => {
    renderLista(gabriel)

    const servicios = within(screen.getByRole('group', { name: 'Servicios de Gabriel Salas' }))
    expect(servicios.getByText('Banda')).toBeInTheDocument()
    expect(servicios.getByText('Coro')).toBeInTheDocument()
    expect(servicios.getByText('Coordinador')).toBeInTheDocument()
    expect(servicios.getByText('Voluntario')).toBeInTheDocument()
    expect(servicios.getByText('Activo')).toBeInTheDocument()
    expect(servicios.getByText('En pausa')).toBeInTheDocument()
  })

  it('gives each servicio its own actions menu, named after its equipo', () => {
    renderLista(gabriel)

    expect(screen.getByRole('button', { name: 'Acciones para Gabriel Salas en Banda' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Acciones para Gabriel Salas en Coro' })).toBeInTheDocument()
  })

  it('keeps the plain menu name for a person with a single servicio', () => {
    renderLista([servicio('ana', 'Ana Ruiz', 'Coro')])

    expect(screen.getByRole('button', { name: 'Acciones para Ana Ruiz' })).toBeInTheDocument()
  })

  it('keeps every action of each servicio reachable from its own menu', async () => {
    renderLista(gabriel.map((s) => ({ ...s, fichaEditable: true, tieneCuenta: false })))

    await userEvent.click(screen.getByRole('button', { name: 'Acciones para Gabriel Salas en Coro' }))
    for (const accion of ['Cambiar etapa', 'Turnos', 'Editar ficha', 'Invitar a la plataforma']) {
      expect(screen.getByRole('menuitem', { name: accion })).toBeInTheDocument()
    }
  })

  it('collapses more than three servicios behind "+N más" (44px, aria-expanded)', async () => {
    renderLista(['Banda', 'Coro', 'Sonido', 'Luces'].map((equipo) => servicio('gabriel', 'Gabriel Salas', equipo)))

    expect(screen.getAllByRole('button', { name: /^Acciones para Gabriel Salas en / })).toHaveLength(3)
    const mas = screen.getByRole('button', { name: '+1 más' })
    expect(mas).toHaveAttribute('aria-expanded', 'false')
    expect(mas.className).toContain('min-h-[44px]')

    await userEvent.click(mas)
    expect(screen.getAllByRole('button', { name: /^Acciones para Gabriel Salas en / })).toHaveLength(4)
    expect(screen.getByRole('button', { name: 'Ver menos' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('shows no "+N más" up to three servicios', () => {
    renderLista(['Banda', 'Coro', 'Sonido'].map((equipo) => servicio('gabriel', 'Gabriel Salas', equipo)))

    expect(screen.queryByRole('button', { name: /más$/ })).not.toBeInTheDocument()
  })

  it('puts the Grupos de Vida mark on that servicio when the person also serves in Dream Team', () => {
    const lider = servicio('gabriel', 'Gabriel Salas', 'Grupo Norte', {
      clave: 'gdv:persona-gabriel:norte',
      servicioId: undefined,
      version: undefined,
      origen: 'grupos_vida',
      editable: false,
      rolLabel: 'Líder',
    })
    renderLista([gabriel[0], lider])

    const servicios = within(screen.getByRole('group', { name: 'Servicios de Gabriel Salas' }))
    expect(servicios.getByText('Grupos de Vida')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Acciones para Gabriel Salas/ })).toHaveLength(1)
  })
})
