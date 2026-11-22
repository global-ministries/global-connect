/**
 * Org chart responsables on screen (S1, S2 of
 * odd/tasks/dream-team-estructura-correcciones.md): the box line and the
 * subequipo rows show the short names («Isaac Paez y Kelly Chaviel»,
 * «Isaac Paez y 2 más»); the panel's Responsable block lists every
 * responsable with their rol.
 */
import React from 'react'
import { render, screen, within } from '@testing-library/react'

import { ContenidoCaja, descripcionCaja } from '@/components/dream-team/estructura/caja-organigrama'
import { PanelNodoResumen } from '@/components/dream-team/estructura/panel-nodo-resumen'
import { construirArbol } from '@/lib/platform/dream-team/arbol'
import type { NodoEquipoArbol, ResponsableNodo } from '@/lib/platform/dream-team/estructura-arbol'
import { crearOrganigrama, type CajaOrganigrama } from '@/lib/platform/dream-team/estructura-organigrama'
import { crearVistaEstructura } from '@/lib/platform/dream-team/estructura-vista'
import { personaId } from '@/lib/platform/dream-team/types'

const persona = (id: string, nombre: string, apellido: string, rol = 'director'): ResponsableNodo => ({
  personaId: personaId(id),
  nombre: `${nombre} ${apellido}`,
  rol,
  partes: { nombre, apellido },
})
const ISAAC = persona('p-isaac', 'Isaac José', 'Paez Cordero')
const KELLY = persona('p-kelly', 'Kelly', 'Chaviel')
const LUIS = persona('p-luis', 'Luis', 'Rojas')

const equipo = (id: string, label: string, padre: string | undefined, responsables: ResponsableNodo[]): NodoEquipoArbol => ({
  origen: 'dream_team',
  id,
  label,
  parentEquipoId: padre,
  activo: true,
  experiencia: 'dps',
  responsables,
})

const arbol = construirArbol([
  equipo('dps', 'DPS', undefined, [ISAAC, KELLY]),
  equipo('uno', 'Uno', 'dps', [ISAAC]),
  equipo('dos', 'Dos', 'dps', [ISAAC, KELLY]),
  equipo('tres', 'Tres', 'dps', [ISAAC, KELLY, LUIS]),
])
const entrada = { arbol, rolesPorEquipo: {}, uso: { propias: {}, porRol: {} }, talleres: {} }

function caja(id: string): CajaOrganigrama {
  const encontrada = crearOrganigrama(entrada)
    .diagrama({ expandidos: new Set(['dps']) })
    .find((candidata) => candidata.id === id)
  if (!encontrada) throw new Error(`no box ${id}`)
  return encontrada
}

describe('the org chart box', () => {
  it.each([
    ['uno', 'Isaac Paez'],
    ['dos', 'Isaac Paez y Kelly Chaviel'],
    ['tres', 'Isaac Paez y 2 más'],
  ])('shows the responsables of %s as «%s»', (id, texto) => {
    render(
      <div data-testid="caja">
        <ContenidoCaja caja={caja(id)} />
      </div>,
    )
    expect(within(screen.getByTestId('caja')).getByText(texto)).toBeInTheDocument()
    expect(descripcionCaja(caja(id))).toContain(`, ${texto}, `)
  })

  it('draws the avatar with the short name initials', () => {
    render(
      <div data-testid="caja">
        <ContenidoCaja caja={caja('uno')} />
      </div>,
    )
    expect(within(screen.getByTestId('caja')).getByText('IP')).toBeInTheDocument()
  })
})

describe('the panel Resumen', () => {
  const detalle = crearVistaEstructura(entrada).detalle('dps')
  if (!detalle) throw new Error('no detalle')
  const renderPanel = () =>
    render(
      <PanelNodoResumen
        detalle={detalle}
        direccionId="dps"
        problemas={[]}
        edita={false}
        ocupado={false}
        onVerRoles={jest.fn()}
        onElegirTurnos={jest.fn()}
        onActivar={jest.fn()}
        onAgregarSubequipo={jest.fn()}
        onAbrirNodo={jest.fn()}
      />,
    )

  it('lists every responsable with their rol', () => {
    renderPanel()
    const bloque = screen.getByRole('list', { name: 'Responsables' })
    const filas = within(bloque).getAllByRole('listitem')
    expect(filas.map((fila) => fila.textContent)).toEqual(['Isaac José Paez CorderoDirector', 'Kelly ChavielDirector'])
  })

  it('names the responsables of each subequipo with short names', () => {
    renderPanel()
    expect(screen.getByRole('button', { name: 'Abrir Uno' })).toHaveTextContent('Isaac Paez')
    expect(screen.getByRole('button', { name: 'Abrir Dos' })).toHaveTextContent('Isaac Paez y Kelly Chaviel')
    expect(screen.getByRole('button', { name: 'Abrir Tres' })).toHaveTextContent('Isaac Paez y 2 más')
  })
})
