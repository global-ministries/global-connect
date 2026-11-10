'use client'

/**
 * One taller embedded on a church site (T6, S2 S18; design/talleres-reserva/07):
 * the reservation flow inline, without the public header. As a card it is
 * one bordered surface that grows with its steps; inside the modal of
 * public/embed.js it fills the window and has a close button. A snippet with
 * `data-edicion` shows only that edición while it stays open.
 */
import Link from 'next/link'
import { ChevronLeft, X } from 'lucide-react'

import { cn } from '@/lib/utils'
import { edicionesConLugar, type TallerPublico } from '@/lib/platform/talleres/reserva-publica'

import { FlujoReservaEnLinea } from './flujo-reserva'
import { MarcoIncrustado, cerrarIncrustado } from './incrustado'
import { rutaCatalogoDe, type ModoIncrustado } from './modo-incrustado'

/** The pinned edición when it is still listed; otherwise every open one. */
export function edicionesIncrustadas(taller: TallerPublico, edicion: string | null): TallerPublico {
  const fijada = edicion ? taller.ediciones.filter((e) => e.id === edicion) : []
  return fijada.length > 0 ? { ...taller, ediciones: fijada } : taller
}

export function TallerIncrustado({ taller: completo, modo }: { taller: TallerPublico; modo: ModoIncrustado }) {
  const taller = edicionesIncrustadas(completo, modo.edicion)
  const inicial = (edicionesConLugar(taller)[0] ?? taller.ediciones[0])?.id ?? ''
  const paginaPublica = `/talleres/reservar/${taller.slug}`

  return (
    <MarcoIncrustado modo={modo} paginaPublica={paginaPublica}>
      <div className={cn('min-w-0 bg-card', !modo.modal && 'overflow-hidden rounded-2xl border border-border')}>
        {modo.desdeCatalogo && (
          <Link
            href={rutaCatalogoDe(modo)}
            className="focus-ring ml-2 mt-2 inline-flex min-h-11 items-center gap-0.5 rounded-xl px-2 text-base font-medium text-brand-text"
          >
            <ChevronLeft aria-hidden="true" className="-ml-1 size-6" />
            Talleres
          </Link>
        )}
        {inicial ? (
          <FlujoReservaEnLinea taller={taller} edicionId={inicial} onCerrar={modo.modal ? () => cerrarIncrustado(paginaPublica) : undefined} />
        ) : (
          <div className="flex items-start gap-2 p-4 md:px-6">
            <div className="grid min-w-0 flex-1 gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-brand-text">Grupo de Corto Plazo</p>
              <h1 className="text-xl font-semibold tracking-tight text-foreground">{taller.nombre}</h1>
              <p className="text-[15px] text-muted-foreground">No hay horarios abiertos ahora. Vuelve pronto: las nuevas ediciones aparecen aquí.</p>
            </div>
            {modo.modal && (
              <button
                type="button"
                onClick={() => cerrarIncrustado(paginaPublica)}
                aria-label="Cerrar la reserva"
                className="focus-ring grid size-11 shrink-0 place-items-center rounded-xl text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X aria-hidden="true" className="size-5" />
              </button>
            )}
          </div>
        )}
      </div>
    </MarcoIncrustado>
  )
}
