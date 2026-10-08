/**
 * Niños — in-page header, the same shape as Dream Team's
 * components/dream-team/mi-equipo/encabezado.tsx: a `TituloSistema` title,
 * a muted subtitle and the actions on the right (stacked on phones).
 * The page title in the desktop bar comes from `ContenedorDashboard` in each
 * page.tsx.
 */
import type { ReactElement, ReactNode } from 'react'

import { TextoSistema, TituloSistema } from '@/components/ui/sistema-diseno'

type Props = {
  titulo: string
  subtitulo?: string
  /** Buttons or links rendered on the right. */
  acciones?: ReactNode
}

export function EncabezadoNinos({ titulo, subtitulo, acciones }: Props): ReactElement {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-1">
        <TituloSistema nivel={1} className="text-2xl md:text-3xl">
          {titulo}
        </TituloSistema>
        {subtitulo && <TextoSistema variante="sutil">{subtitulo}</TextoSistema>}
      </div>
      {acciones && <div className="flex shrink-0 flex-wrap gap-2">{acciones}</div>}
    </header>
  )
}
