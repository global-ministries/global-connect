/**
 * Reserved place of «Mis servicios» (odd/tasks/home-por-rol.md S2). The card
 * comes from feat/dps-avisos (`<TarjetaMisServicios inicial hoy />`, design
 * design/dps-avisos/04 and 07) and is not redesigned here. Until that branch
 * is merged the slot is empty and takes no room; `#mis-servicios` is the
 * target of the «Confirmar tus servicios» row of «Para responder».
 */
import type { ReactElement, ReactNode } from 'react'

import { cn } from '@/lib/utils'

export function RanuraMisServicios({ children, className }: { readonly children?: ReactNode; readonly className?: string }): ReactElement {
  return (
    <div id="mis-servicios" className={cn('scroll-mt-20 empty:hidden', className)}>
      {children}
    </div>
  )
}
