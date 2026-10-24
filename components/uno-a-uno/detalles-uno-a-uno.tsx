/**
 * Small pieces shared by the 1:1 cards of "Mis 1 a 1" and "Supervisión"
 * (odd/tasks/uno-a-uno.md, T4/T7): an icon-led detail line and the
 * celebración block. Rendered on the server.
 */

import type { ReactElement, ReactNode } from 'react'
import { PartyPopper, type LucideIcon } from 'lucide-react'

import { TextoSistema } from '@/components/ui/sistema-diseno'

export function Detalle({ icono: Icono, children }: { icono: LucideIcon; children: ReactNode }): ReactElement {
  return (
    <TextoSistema variante="sutil" tamaño="sm" className="flex items-center gap-1.5">
      <Icono className="h-4 w-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </TextoSistema>
  )
}

export function CelebracionUnoAUno({ texto }: { texto: string }): ReactElement {
  return (
    <div className="rounded-lg bg-muted/50 p-3">
      <Detalle icono={PartyPopper}>Celebración</Detalle>
      <TextoSistema tamaño="sm" className="mt-1 whitespace-pre-line">
        {texto}
      </TextoSistema>
    </div>
  )
}
