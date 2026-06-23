import React from 'react'
import { render, screen, within } from '@testing-library/react'

import { HostHomeQueuesWidget } from '@/components/dashboard/widgets/HostHomeQueuesWidget'
import DashboardAdmin from '@/components/dashboard/roles/DashboardAdmin'
import DashboardDirector from '@/components/dashboard/roles/DashboardDirector'
import DashboardLider from '@/components/dashboard/roles/DashboardLider'

jest.mock('@/hooks/useCampus', () => ({ useCampus: () => ({ campusId: null, loading: true }) }))
jest.mock('@/lib/supabase/client', () => ({ createClient: jest.fn() }))
jest.mock('@/components/dashboard/widgets/MetricWidget', () => ({ MetricWidget: ({ title }: { title: string }) => <div>{title}</div> }))
jest.mock('@/components/dashboard/widgets/DonutWidget', () => ({ DonutWidget: ({ title }: { title: string }) => <div>{title}</div> }))
jest.mock('@/components/dashboard/widgets/ActivityWidget', () => ({ ActivityWidget: ({ title }: { title: string }) => <div>{title}</div> }))
jest.mock('@/components/dashboard/widgets/BirthdayWidget', () => ({ BirthdayWidget: ({ title }: { title: string }) => <div>{title}</div> }))
jest.mock('@/components/dashboard/widgets/RiskGroupsWidget', () => ({ RiskGroupsWidget: ({ title }: { title: string }) => <div>{title}</div> }))
jest.mock('@/components/dashboard/widgets/NotasLideresWidget', () => ({ NotasLideresWidget: ({ title }: { title: string }) => <div>{title}</div> }))
jest.mock('@/components/dashboard/widgets/PendingLeadersWidget', () => ({ PendingLeadersWidget: ({ title }: { title: string }) => <div>{title}</div> }))
jest.mock('@/components/dashboard/widgets/ActionRequiredWidget', () => ({ ActionRequiredWidget: () => <div>Acción requerida</div> }))
jest.mock('@/components/dashboard/widgets/RecentAbsencesWidget', () => ({ RecentAbsencesWidget: ({ title }: { title: string }) => <div>{title}</div> }))
jest.mock('@/components/dashboard/widgets/NewMembersWidget', () => ({ NewMembersWidget: ({ title }: { title: string }) => <div>{title}</div> }))

const hostHomeQueues = {
  missingGroups: [
    { grupo_id: 'group-1', grupo_nombre: 'Grupo Norte', estado_ciclo: 'activo', segmento: 'Jóvenes', temporada: '2026' },
  ],
  pendingReviews: [
    { review_id: 'review-1', casa_id: 'casa-1', casa_nombre: 'Casa de Ana', review_type: 'location_change' as const, created_at: '2026-06-21T12:00:00.000Z', requested_by: 'Ana Pérez' },
  ],
}

describe('HostHomeQueuesWidget', () => {
  it('renders missing host-home and pending-review queues with active workflow links', () => {
    render(
      <HostHomeQueuesWidget
        canReviewHostHomes
        queues={{
          missingGroups: [
            { grupo_id: 'group-1', grupo_nombre: 'Grupo Norte', estado_ciclo: 'activo', segmento: 'Jóvenes', temporada: '2026' },
            { grupo_id: 'group-2', grupo_nombre: 'Grupo Sur', estado_ciclo: 'activo', segmento: null, temporada: null },
          ],
          pendingReviews: [
            { review_id: 'review-1', casa_id: 'casa-1', casa_nombre: 'Casa de Ana', review_type: 'location_change', created_at: '2026-06-21T12:00:00.000Z', requested_by: 'Ana Pérez' },
          ],
        }}
      />
    )

    const missingCard = screen.getByRole('region', { name: 'Grupos de Vida sin Casa Anfitriona asignada en el sistema' })
    expect(within(missingCard).getByText('2')).toBeInTheDocument()
    expect(within(missingCard).getByText('Grupo Norte')).toBeInTheDocument()
    expect(within(missingCard).getByText('Jóvenes · 2026')).toBeInTheDocument()
    expect(within(missingCard).getByRole('link', { name: 'Asignar Casa Anfitriona' })).toHaveAttribute('href', '/grupos-vida/casas-anfitrionas/asignar')
    expect(within(missingCard).queryByRole('button', { name: 'Disponible en la próxima etapa' })).not.toBeInTheDocument()

    const pendingCard = screen.getByRole('region', { name: 'Casas Anfitrionas pendientes de revisión' })
    expect(within(pendingCard).getByText('1')).toBeInTheDocument()
    expect(within(pendingCard).getByText('Casa de Ana')).toBeInTheDocument()
    expect(within(pendingCard).getByText('Cambio de ubicación · Ana Pérez')).toBeInTheDocument()
    expect(within(pendingCard).getByRole('link', { name: 'Revisar Casas Anfitrionas' })).toHaveAttribute('href', '/grupos-vida/casas-anfitrionas/revision')
    expect(within(pendingCard).queryByRole('button', { name: 'Disponible en la próxima etapa' })).not.toBeInTheDocument()
    expect(screen.getAllByText(/no bloqueante/i)).toHaveLength(2)
  })

  it('hides empty queue cards while keeping pending work visible independently', () => {
    render(
      <HostHomeQueuesWidget
        canReviewHostHomes
        queues={{
          missingGroups: [],
          pendingReviews: [
            { review_id: 'review-2', casa_id: 'casa-2', casa_nombre: 'Casa Nueva', review_type: 'create', created_at: '2026-06-22T12:00:00.000Z', requested_by: null },
          ],
        }}
      />
    )

    expect(screen.queryByRole('region', { name: 'Grupos de Vida sin Casa Anfitriona asignada en el sistema' })).not.toBeInTheDocument()
    const pendingCard = screen.getByRole('region', { name: 'Casas Anfitrionas pendientes de revisión' })
    expect(within(pendingCard).getByText('Solicitud nueva · Solicitante no registrado')).toBeInTheDocument()
  })

  it('renders nothing when there is no operational queue work', () => {
    const { container } = render(<HostHomeQueuesWidget queues={{ missingGroups: [], pendingReviews: [] }} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('renders a retry warning instead of a false empty state when a queue load is degraded', () => {
    render(<HostHomeQueuesWidget queues={{ missingGroups: [], pendingReviews: [], pendingReviewsDegraded: true }} canReviewHostHomes />)

    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cargar la cola de revisión de Casas Anfitrionas')
    expect(screen.getByRole('link', { name: 'Reintentar revisión' })).toHaveAttribute('href', '/grupos-vida/casas-anfitrionas/revision')
  })

  it('does not expose pending-review details or an active review CTA when review is not allowed', () => {
    render(<HostHomeQueuesWidget queues={hostHomeQueues} canReviewHostHomes={false} />)

    expect(screen.getByRole('region', { name: 'Grupos de Vida sin Casa Anfitriona asignada en el sistema' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Casas Anfitrionas pendientes de revisión' })).not.toBeInTheDocument()
    expect(screen.queryByText('Casa de Ana')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Revisar Casas Anfitrionas' })).not.toBeInTheDocument()
  })

  it('shows queue cards when rendering the real admin dashboard role', () => {
    render(<DashboardAdmin rol="admin" data={{ casas_anfitrionas_queues: hostHomeQueues, kpis_globales: {} }} />)

    const assignmentQueue = screen.getByRole('region', { name: 'Grupos de Vida sin Casa Anfitriona asignada en el sistema' })
    const riskGroups = screen.getByText('Grupos que Necesitan Atención')
    const hostHomeWrapper = assignmentQueue.closest('.grid')?.parentElement

    expect(assignmentQueue).toBeInTheDocument()
    expect(hostHomeWrapper?.nextElementSibling).toContainElement(riskGroups)
    expect(screen.getByRole('region', { name: 'Casas Anfitrionas pendientes de revisión' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Asignar Casa Anfitriona' })).toHaveAttribute('href', '/grupos-vida/casas-anfitrionas/asignar')
    expect(screen.getByRole('link', { name: 'Revisar Casas Anfitrionas' })).toHaveAttribute('href', '/grupos-vida/casas-anfitrionas/revision')
  })

  it('shows only assignment queue cards when rendering the real director dashboard role', () => {
    render(<DashboardDirector data={{ casas_anfitrionas_queues: hostHomeQueues, kpis_alcance: {} }} />)

    const assignmentQueue = screen.getByRole('region', { name: 'Grupos de Vida sin Casa Anfitriona asignada en el sistema' })
    const riskGroups = screen.getByText('Grupos que Necesitan Atención (mi etapa)')
    const hostHomeWrapper = assignmentQueue.closest('.grid')?.parentElement

    expect(assignmentQueue).toBeInTheDocument()
    expect(hostHomeWrapper?.nextElementSibling).toContainElement(riskGroups)
    expect(screen.getByRole('link', { name: 'Asignar Casa Anfitriona' })).toHaveAttribute('href', '/grupos-vida/casas-anfitrionas/asignar')
    expect(screen.queryByRole('region', { name: 'Casas Anfitrionas pendientes de revisión' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Revisar Casas Anfitrionas' })).not.toBeInTheDocument()
  })

  it('shows only assignment queue cards when rendering the real leader dashboard role', () => {
    render(<DashboardLider data={{ casas_anfitrionas_queues: hostHomeQueues, kpis_grupo: {} }} />)

    expect(screen.getByRole('region', { name: 'Grupos de Vida sin Casa Anfitriona asignada en el sistema' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Asignar Casa Anfitriona' })).toHaveAttribute('href', '/grupos-vida/casas-anfitrionas/asignar')
    expect(screen.queryByRole('region', { name: 'Casas Anfitrionas pendientes de revisión' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Revisar Casas Anfitrionas' })).not.toBeInTheDocument()
  })
})
