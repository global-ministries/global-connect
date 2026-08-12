import type { ReactElement, ReactNode } from 'react'

import {
  ContenedorDashboard,
  TarjetaSistema,
} from '@/components/ui/sistema-diseno'

export interface DashboardPageProps {
  readonly titulo: string
  readonly subtitulo?: string
  readonly botonRegreso?: { readonly href: string; readonly texto: string }
  readonly children: ReactNode
}

/**
 * Shared layout wrapper for the L / C / D dashboards (PR19).
 * Centralizes ContenedorDashboard + a one-line description card so
 * each page stays compact (≤40 lines).
 */
export function DashboardPage({
  titulo,
  subtitulo,
  botonRegreso,
  children,
}: DashboardPageProps): ReactElement {
  return (
    <ContenedorDashboard
      titulo={titulo}
      botonRegreso={botonRegreso ?? { href: '/dashboard', texto: 'Inicio' }}
    >
      <div className="grid gap-4">
        {subtitulo && (
          <TarjetaSistema variante="outlined" className="p-4 sm:p-5">
            <p className="text-sm text-muted-foreground">{subtitulo}</p>
          </TarjetaSistema>
        )}
        {children}
      </div>
    </ContenedorDashboard>
  )
}

interface EmptyStateProps {
  readonly message: string
}

/** Compact empty-state card. */
export function EmptyState({ message }: EmptyStateProps): ReactElement {
  return (
    <TarjetaSistema variante="outlined" className="p-6 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
    </TarjetaSistema>
  )
}
