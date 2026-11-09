/**
 * `<MisGruposClient>` — /estudiantes (C3b) with the "En vivo" link of C4b:
 * only whoever has the live view gets it; in the planning style (E4a of
 * odd/tasks/estudiantes-estilo-dps.md, artboard 01): a band per ámbito and
 * rows that link to the leader list. Every person is fictitious.
 */
import React from 'react'
import { render, screen, within } from '@testing-library/react'

import { MisGruposClient } from '@/components/estudiantes/mis-grupos-client'
import type { GrupoMio } from '@/lib/platform/estudiantes/lista-datos'

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }))
jest.mock('@/components/ui/desktop-header', () => ({
  DesktopHeader: ({ accionPrincipal, breadcrumbs }: { accionPrincipal?: React.ReactNode; breadcrumbs?: React.ReactNode }) => (
    <header>
      {breadcrumbs}
      {accionPrincipal}
    </header>
  ),
}))

const GRUPO: GrupoMio = {
  grupoId: 'g2',
  nombre: '2do año · Chicas',
  campusId: 'c1',
  ambito: 'Transit',
  experiencia: 'estudiantes',
  subareaId: 's1',
  subarea: 'Grupos de Chicas',
  detalle: '2do año',
  soyLider: false,
  puedeVerVivo: true,
  puedeGestionar: false,
  miembros: 12,
  visitantes: 1,
  lideres: ['Andrea Molina'],
}

describe('<MisGruposClient>', () => {
  it('links the live view for whoever has it', () => {
    render(<MisGruposClient grupos={[GRUPO]} puedeGestionar={false} puedeVerVivo />)
    const enlaces = screen.getAllByRole('link', { name: 'En vivo' })
    expect(enlaces.length).toBeGreaterThan(0)
    for (const enlace of enlaces) expect(enlace).toHaveAttribute('href', '/estudiantes/vivo')
  })

  it('has no live link otherwise', () => {
    render(<MisGruposClient grupos={[GRUPO]} puedeGestionar />)
    expect(screen.queryByRole('link', { name: 'En vivo' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Gestionar grupos' }).length).toBeGreaterThan(0)
  })

  it('groups the rows by ámbito and links each one to its leader list', () => {
    const tlr: GrupoMio = { ...GRUPO, grupoId: 'g9', nombre: 'Zona Este · Chicos', ambito: 'The Living Room', subarea: 'Zona Este', lideres: [] }
    render(<MisGruposClient grupos={[GRUPO, tlr]} puedeGestionar={false} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Mis grupos' })).toBeInTheDocument()
    expect(screen.getByText(/toca uno para marcar su asistencia/)).toHaveTextContent('2 grupos · toca uno para marcar su asistencia')
    const transit = screen.getByRole('region', { name: 'Transit' })
    expect(within(transit).getByRole('link', { name: 'Abrir la lista de 2do año · Chicas' })).toHaveAttribute('href', '/estudiantes/grupos/g2')
    const living = screen.getByRole('region', { name: 'The Living Room' })
    expect(within(living).getByRole('link', { name: 'Abrir la lista de Zona Este · Chicos' })).toHaveTextContent('Sin líder')
  })

  it('says how to get a group when there is none', () => {
    render(<MisGruposClient grupos={[]} puedeGestionar={false} />)
    expect(screen.getByText('Todavía no tienes un grupo')).toBeInTheDocument()
    expect(screen.getByText('Cuando la dirección te asigne como líder, tu grupo aparece aquí.')).toBeInTheDocument()
  })
})
