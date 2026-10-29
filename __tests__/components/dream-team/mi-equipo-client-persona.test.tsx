/**
 * `<MiEquipoClient>` lists a person once (S12): the list, the "Por activar"
 * metric (which replaced the pending strip in T7a-3) and the counts of the
 * hero, cards and footer follow people, while the etapa pills keep counting
 * servicios (as Servidores). The servicios of a person show as chips in the
 * row and as one card each in the person panel (which replaced the
 * per-servicio menus).
 */
import React from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { MiEquipoClient } from '@/components/dream-team/mi-equipo/mi-equipo-client'
import { listarDirecciones, vistaDeDireccion, type PersonaEntrada, type PersonasPorEquipo } from '@/lib/platform/dream-team/mi-equipo-vista'
import type { NodoArbol } from '@/lib/platform/dream-team/arbol'
import type { NodoEquipoArbol } from '@/lib/platform/dream-team/estructura-arbol'
import { personaId, type DreamTeamEstado } from '@/lib/platform/dream-team/types'

jest.mock('@/hooks/useCampus', () => ({ useCampus: () => ({ campusId: null }) }))
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), refresh: jest.fn(), push: jest.fn() }),
  usePathname: () => '/dream-team/mi-equipo',
}))
jest.mock('@/components/ui/desktop-header', () => ({
  DesktopHeader: () => <header />,
}))

function nodo(id: string, label: string, hijos: readonly NodoArbol<NodoEquipoArbol>[] = [], nivel = 0): NodoArbol<NodoEquipoArbol> {
  return {
    equipo: { origen: 'dream_team', id, label, experiencia: 'talleres_crecimiento', activo: true, responsables: [] },
    hijos,
    nivel,
  }
}

const arbol = [nodo('dir', 'Estudiantes', [nodo('coro', 'Coro', [], 1), nodo('banda', 'Banda', [], 1)])]

function servicio(quien: string, nombre: string, equipo: string, estado: DreamTeamEstado = 'activo'): PersonaEntrada {
  return {
    clave: `${quien}-${equipo}`,
    personaId: personaId(`persona-${quien}`),
    nombre,
    rolClave: 'voluntario',
    rolLabel: 'Voluntario',
    estado,
    origen: 'dream_team',
    servicioId: `servicio-${quien}-${equipo}`,
    version: 1,
  }
}

const personas: PersonasPorEquipo = {
  coro: [servicio('gabriel', 'Gabriel Salas', 'coro', 'en_orientacion'), servicio('ana', 'Ana Ruiz', 'coro')],
  banda: [servicio('gabriel', 'Gabriel Salas', 'banda', 'en_orientacion')],
}

function renderizar() {
  render(
    <MiEquipoClient
      direcciones={listarDirecciones(arbol, personas)}
      vista={vistaDeDireccion(arbol, personas, 'dir')}
      direccionId="dir"
      rol="director"
      equiposAsignables={[]}
      rolesPorEquipo={{}}
    />,
  )
}

const filaDe = (nombre: string) =>
  screen.getByRole('button', { name: `Abrir ${nombre}`, hidden: true }).closest('[role="row"]') as HTMLElement

describe('MiEquipoClient — one row per person', () => {
  it('lists Gabriel once with a chip per servicio, and his panel with one card per servicio', async () => {
    renderizar()
    const tabla = screen.getByRole('table', { name: 'Personas del equipo', hidden: true })
    expect(within(tabla).getAllByRole('button', { name: /^Abrir /, hidden: true })).toHaveLength(2)
    expect(within(filaDe('Gabriel Salas')).getByTitle('Banda · Voluntario · En orientación')).toBeInTheDocument()
    expect(within(filaDe('Gabriel Salas')).getByTitle('Coro · Voluntario · En orientación')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Abrir Gabriel Salas', hidden: true }))
    const panel = within(await screen.findByRole('dialog', { name: 'Gabriel Salas' }))
    expect(panel.getByText('2 servicios')).toBeInTheDocument()
    for (const equipo of ['Banda', 'Coro']) {
      expect(within(panel.getByRole('group', { name: equipo })).getByRole('button', { name: 'Cambiar etapa' })).toBeInTheDocument()
    }
  })

  it('counts people in the hero and the footer, and the servicios when someone serves more than once', () => {
    renderizar()
    expect(screen.getByRole('heading', { level: 1, name: 'Estudiantes' }).nextElementSibling).toHaveTextContent('2 personas · 3 servicios')
    expect(screen.getByText('2 personas · 3 servicios', { selector: 'p[role="status"]' })).toBeInTheDocument()
  })

  it('counts a pending person once in "Por activar", with both servicios in the row', () => {
    renderizar()
    const metrica = within(screen.getByRole('group', { name: 'Necesitan atención' })).getByRole('button', { name: /^Por activar/ })
    expect(metrica).toHaveTextContent('1')
  })
})
