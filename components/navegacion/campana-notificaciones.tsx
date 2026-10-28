"use client"

import { useId, useRef, useState, type ReactNode } from 'react'
import { Bell } from 'lucide-react'

import { cn } from '@/lib/utils'
import { CLASE_BOTON_ICONO_SHELL } from '@/components/navegacion/estilos-navegacion'
import { PanelFlotante } from '@/components/navegacion/panel-flotante-riel'
import { EstadoVacioSistema } from '@/components/ui/estado-vacio-sistema'
import { HojaInferior } from '@/components/ui/hoja-inferior'

/**
 * The notifications bell of the app shell (odd/tasks/sistema-diseno-v2.md,
 * S9.9; prototype design/app-shell): always visible, in the desktop header
 * and in the phone navigation bar. The unread badge is a `bg-brand-strong`
 * count; the panel shows the empty state until there is a data source.
 *
 * There is no notifications source yet, so nothing here fetches: the caller
 * passes `noLeidas` and the list (`children`) once one exists.
 */
export interface CampanaNotificacionesProps {
  /** Unread notifications; the badge shows above 0. */
  readonly noLeidas?: number
  /** The notification list. Without it the panel shows "No tenés notificaciones". */
  readonly children?: ReactNode
  /** `popover` under the bell (desktop header) or `hoja`, a bottom sheet (phone). */
  readonly presentacion?: 'popover' | 'hoja'
  readonly className?: string
}

export const TITULO_NOTIFICACIONES = 'Notificaciones'

/** "Notificaciones", or "Notificaciones, 3 sin leer" when there are unread ones. */
export function etiquetaCampana(noLeidas = 0): string {
  return noLeidas > 0 ? `${TITULO_NOTIFICACIONES}, ${noLeidas} sin leer` : TITULO_NOTIFICACIONES
}

/** The panel body: the list, or the empty state when there is none. */
export function ContenidoNotificaciones({ children }: { readonly children?: ReactNode }) {
  if (children) return <>{children}</>
  return (
    <EstadoVacioSistema
      icono={Bell}
      titulo="No tenés notificaciones"
      subtitulo="Acá vas a ver postulaciones, recordatorios de 1 a 1 y novedades de la app."
      className="py-8"
    />
  )
}

export function CampanaNotificaciones({
  noLeidas = 0,
  children,
  presentacion = 'popover',
  className,
}: CampanaNotificacionesProps) {
  const [abierta, setAbierta] = useState(false)
  const botonRef = useRef<HTMLButtonElement>(null)
  const idPanel = useId()
  const idTitulo = useId()

  return (
    <div className={cn('relative', className)}>
      <button
        ref={botonRef}
        type="button"
        onClick={() => setAbierta((valor) => !valor)}
        aria-label={etiquetaCampana(noLeidas)}
        aria-haspopup="dialog"
        aria-expanded={abierta}
        aria-controls={presentacion === 'popover' ? idPanel : undefined}
        className={cn(CLASE_BOTON_ICONO_SHELL, 'relative', abierta && 'bg-accent text-foreground')}
      >
        <Bell aria-hidden="true" className="size-5" />
        {noLeidas > 0 && (
          <span
            aria-hidden="true"
            data-slot="insignia-notificaciones"
            className="absolute top-1 right-1 inline-grid h-5 min-w-5 place-items-center rounded-full bg-brand-strong px-1.5 font-mono text-xs font-semibold tabular-nums text-white"
          >
            {noLeidas > 99 ? '99+' : noLeidas}
          </span>
        )}
      </button>

      {presentacion === 'popover' ? (
        <PanelFlotante
          abierto={abierta}
          onCerrar={() => setAbierta(false)}
          ancla={botonRef}
          id={idPanel}
          etiquetadoPor={idTitulo}
          className="w-[360px] max-w-[calc(100vw-2rem)] p-0"
        >
          <h2 id={idTitulo} className="px-4 pt-3.5 text-base font-semibold">
            {TITULO_NOTIFICACIONES}
          </h2>
          {/* Focus lands here on open, so the empty state is read right away. */}
          <div tabIndex={0} className="focus-ring max-h-[60vh] overflow-y-auto rounded-b-2xl outline-none">
            <ContenidoNotificaciones>{children}</ContenidoNotificaciones>
          </div>
        </PanelFlotante>
      ) : (
        <HojaInferior abierta={abierta} onCambioAbierta={setAbierta} titulo={TITULO_NOTIFICACIONES}>
          <ContenidoNotificaciones>{children}</ContenidoNotificaciones>
        </HojaInferior>
      )}
    </div>
  )
}
