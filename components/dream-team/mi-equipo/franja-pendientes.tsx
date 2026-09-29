'use client'

/**
 * Mi equipo — strip announcing the people of the direccion who still wait to
 * be activated (`postulado` / `en_orientacion`), with "Revisar" to filter the
 * list down to them.
 */
import type { ReactElement } from 'react'
import { Clock } from 'lucide-react'

import { BotonSistema, TextoSistema } from '@/components/ui/sistema-diseno'
import type { PersonaVista } from '@/lib/platform/dream-team/mi-equipo-vista'

const NOMBRES_VISIBLES = 3

export interface FranjaPendientesProps {
  readonly pendientes: readonly PersonaVista[]
  readonly onRevisar: () => void
}

export function tituloDePendientes(cantidad: number): string {
  return cantidad === 1 ? '1 persona espera que la actives' : `${cantidad} personas esperan que las actives`
}

function nombresDePendientes(pendientes: readonly PersonaVista[]): string {
  const visibles = pendientes.slice(0, NOMBRES_VISIBLES).map((p) => `${p.nombre} · ${p.equipoLabel}`)
  const restantes = pendientes.length - visibles.length
  return restantes > 0 ? `${visibles.join('   ·   ')}   ·   y ${restantes} más` : visibles.join('   ·   ')
}

export function FranjaPendientes({ pendientes, onRevisar }: FranjaPendientesProps): ReactElement | null {
  if (pendientes.length === 0) return null
  return (
    <section
      aria-label="Pendientes"
      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-info/30 bg-info/10 px-4 py-3"
    >
      <div className="flex min-w-0 items-center gap-3">
        <div aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-info/15 text-info">
          <Clock className="h-[18px] w-[18px]" />
        </div>
        <div className="min-w-0">
          <TextoSistema className="font-semibold">{tituloDePendientes(pendientes.length)}</TextoSistema>
          <TextoSistema variante="sutil" tamaño="sm" className="truncate">
            {nombresDePendientes(pendientes)}
          </TextoSistema>
        </div>
      </div>
      <BotonSistema type="button" variante="outline" tamaño="sm" onClick={onRevisar}>
        Revisar
      </BotonSistema>
    </section>
  )
}
