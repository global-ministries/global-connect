'use client'

/**
 * Niños › Check-in — where the family card and the pickup code live.
 * Phone (< md, prototype 01): a bottom sheet over the queue, so "Llegaron" at
 * the top of the screen shows its code right away. Tablet and up (prototype
 * 04): inline in the mesa column, replacing "Mesa libre". Without matchMedia
 * (tests) it renders inline, like DetalleResponsivo falls back to desktop.
 */
import type { ReactElement, ReactNode } from 'react'

import { useEsEscritorio } from '@/components/ui/detalle-responsivo'
import { HojaInferior } from '@/components/ui/hoja-inferior'

export interface MarcoMesaProps {
  readonly abierto: boolean
  readonly titulo: string
  readonly descripcion?: string
  /** The phone sheet was closed (scrim, drag, Escape, close button). */
  readonly onCerrar: () => void
  readonly children: ReactNode
}

export function MarcoMesa({ abierto, titulo, descripcion, onCerrar, children }: MarcoMesaProps): ReactElement | null {
  const escritorio = useEsEscritorio()
  if (escritorio === false) {
    return (
      <HojaInferior abierta={abierto} onCambioAbierta={(v) => !v && onCerrar()} titulo={titulo} descripcion={descripcion}>
        {children}
      </HojaInferior>
    )
  }
  return abierto ? <>{children}</> : null
}
