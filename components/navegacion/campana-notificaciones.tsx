"use client"

import { useId, useRef, useState, type ReactNode } from 'react'
import { Bell } from 'lucide-react'

import { cn } from '@/lib/utils'
import { CLASE_BOTON_ICONO_SHELL } from '@/components/navegacion/estilos-navegacion'
import { PanelFlotante } from '@/components/navegacion/panel-flotante-riel'
import { ListaAvisos, ListaAvisosCargando } from '@/components/navegacion/avisos/lista-avisos'
import { useAvisosPersona } from '@/components/navegacion/avisos/use-avisos-persona'
import { BotonSistema } from '@/components/ui/sistema-diseno'
import { EstadoVacioSistema } from '@/components/ui/estado-vacio-sistema'
import { HojaInferior } from '@/components/ui/hoja-inferior'
import type { AvisoPersona, ClienteAvisos } from '@/lib/platform/avisos/avisos-persona'

/**
 * The notifications bell of the app shell (odd/tasks/sistema-diseno-v2.md,
 * S9.9; prototype design/app-shell): always visible, in the desktop header
 * and in the phone navigation bar. The unread badge is a `bg-brand-strong`
 * count.
 *
 * Source (odd/tasks/talleres-reserva-publica.md T7, S6 S11): the person's
 * in-app notices, `mis_avisos()` (avisos_persona, owner-only by RLS), loaded
 * after mount and on focus. Opening one marks it read
 * (`aviso_marcar_leido`). A caller that passes `noLeidas` or its own list
 * (`children`) gets the old static bell and nothing is fetched.
 */
export interface CampanaNotificacionesProps {
  /** Unread notifications; the badge shows above 0. Passing it turns the fetch off. */
  readonly noLeidas?: number
  /** A list of the caller's own. Passing it turns the fetch off. */
  readonly children?: ReactNode
  /** `popover` under the bell (desktop header) or `hoja`, a bottom sheet (phone). */
  readonly presentacion?: 'popover' | 'hoja'
  /** Replaces the browser Supabase client (tests). */
  readonly fuente?: ClienteAvisos
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
  noLeidas: noLeidasPropias,
  children,
  presentacion = 'popover',
  fuente,
  className,
}: CampanaNotificacionesProps) {
  const [abierta, setAbierta] = useState(false)
  const botonRef = useRef<HTMLButtonElement>(null)
  const idPanel = useId()
  const idTitulo = useId()
  const propia = children !== undefined || noLeidasPropias !== undefined
  const avisos = useAvisosPersona({ activo: !propia, fuente })
  const noLeidas = propia ? (noLeidasPropias ?? 0) : avisos.noLeidas

  function abrirAviso(aviso: AvisoPersona) {
    if (!aviso.leido) void avisos.marcarLeido(aviso.id)
    if (aviso.url) setAbierta(false)
  }

  function alternar() {
    if (!abierta && !propia) void avisos.recargar()
    setAbierta(!abierta)
  }

  let lista: ReactNode = children
  if (!propia) {
    if (avisos.estado === 'cargando' && avisos.avisos.length === 0) {
      lista = <ListaAvisosCargando />
    } else if (avisos.estado === 'error' && avisos.avisos.length === 0) {
      lista = (
        <EstadoVacioSistema
          icono={Bell}
          titulo="No pudimos cargar tus notificaciones"
          subtitulo="Revisa tu conexión e inténtalo de nuevo."
          accion={
            <BotonSistema variante="outline" tamaño="sm" onClick={() => void avisos.recargar()}>
              Reintentar
            </BotonSistema>
          }
          className="py-8"
        />
      )
    } else if (avisos.avisos.length > 0) {
      lista = (
        <ListaAvisos
          avisos={avisos.avisos}
          noLeidas={avisos.noLeidas}
          onAbrir={abrirAviso}
          onMarcarTodos={() => void avisos.marcarTodos()}
        />
      )
    }
  }

  return (
    <div className={cn('relative', className)}>
      <button
        ref={botonRef}
        type="button"
        onClick={alternar}
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
            <ContenidoNotificaciones>{lista}</ContenidoNotificaciones>
          </div>
        </PanelFlotante>
      ) : (
        <HojaInferior abierta={abierta} onCambioAbierta={setAbierta} titulo={TITULO_NOTIFICACIONES}>
          {/* The sheet body has its own padding; the rows bleed to its edges like grouped lists. */}
          <div className="-mx-4.5 -my-4">
            <ContenidoNotificaciones>{lista}</ContenidoNotificaciones>
          </div>
        </HojaInferior>
      )}
    </div>
  )
}
