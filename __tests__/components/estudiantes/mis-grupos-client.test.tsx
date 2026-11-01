/**
 * `<MisGruposClient>` — /estudiantes (C3b) with the "En vivo" link of C4b:
 * only whoever has the live view gets it. Every person is fictitious.
 */
import React from 'react'
import { render, screen } from '@testing-library/react'

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
})
