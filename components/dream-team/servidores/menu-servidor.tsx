'use client'

/**
 * Servidores — the per-row "⋯" menu (a 44px button): "Cambiar etapa" (the
 * shared stage dialog, controlled mode) and "Ver su equipo" (Mi equipo on the
 * person's dirección).
 *
 * Renders nothing for a row without actions: a read-only viewer, or a Grupos
 * de Vida leader (its lifecycle is managed in Grupos de Vida).
 */
import { useState, type ReactElement } from 'react'
import Link from 'next/link'
import { ArrowRightLeft, MoreHorizontal, Users } from 'lucide-react'

import { AvanceEtapaControl } from '@/components/dream-team/avance-etapa-control'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { FilaServidor } from '@/lib/platform/dream-team/servidores-vista'
import { TRANSICIONES_VALIDAS } from '@/lib/platform/dream-team/state-machine'
import { cn } from '@/lib/utils'
import { ANILLO } from './contadores-etapa'

export interface MenuServidorProps {
  readonly fila: FilaServidor
  readonly onActualizado: () => void
  readonly className?: string
}

export function tieneMenu(fila: FilaServidor): boolean {
  return fila.editable && fila.servicioId !== undefined && fila.version !== undefined
}

export function MenuServidor({ fila, onActualizado, className }: MenuServidorProps): ReactElement | null {
  const [etapaAbierta, setEtapaAbierta] = useState(false)
  if (!tieneMenu(fila) || fila.servicioId === undefined || fila.version === undefined) return null

  const puedeCambiarEtapa = (TRANSICIONES_VALIDAS[fila.estado]?.size ?? 0) > 0

  return (
    <>
      {/* modal={false}: the stage dialog opens from an item, and a modal menu would fight it for focus and pointer events. */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Acciones para ${fila.nombre}`}
            className={cn(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
              ANILLO,
              className,
            )}
          >
            <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          {puedeCambiarEtapa && (
            <DropdownMenuItem className="min-h-11 px-3 text-sm" onSelect={() => setEtapaAbierta(true)}>
              <ArrowRightLeft aria-hidden="true" />
              Cambiar etapa
            </DropdownMenuItem>
          )}
          <DropdownMenuItem asChild className="min-h-11 px-3 text-sm">
            <Link href={`/dream-team/mi-equipo?direccion=${encodeURIComponent(fila.direccionId)}`}>
              <Users aria-hidden="true" />
              Ver su equipo
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {puedeCambiarEtapa && (
        <AvanceEtapaControl
          servicioId={fila.servicioId}
          estadoActual={fila.estado}
          version={fila.version}
          puedeEditar
          abierto={etapaAbierta}
          onAbiertoChange={setEtapaAbierta}
          ocultarBoton
          onSuccess={onActualizado}
        />
      )}
    </>
  )
}
