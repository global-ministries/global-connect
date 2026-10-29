'use client'

/**
 * Estructura — the toolbar above the org chart (S12; prototype `.lz-barra`):
 * the search ("/" focuses it on desktop) and the problem pills (Sin
 * responsable, Roles sin asignar, Sin turno, Inactivos) with their counts.
 * Both HIGHLIGHT boxes and never hide one; a second tap on the pressed pill
 * clears it. Under them, a status line says how many boxes are lit.
 */
import { useEffect, useRef, type ReactElement } from 'react'
import { Search } from 'lucide-react'

import { GrupoPastillas, PastillaFiltro } from '@/components/ui/PastillasFiltro'
import { InputSistema } from '@/components/ui/sistema-diseno'
import { PROBLEMAS_ESTRUCTURA, type ProblemaEstructura } from '@/lib/platform/dream-team/estructura-organigrama'
import { cn } from '@/lib/utils'

export interface BarraOrganigramaProps {
  readonly q: string
  readonly onBuscar: (q: string) => void
  readonly problema: ProblemaEstructura | null
  readonly onProblema: (problema: ProblemaEstructura | null) => void
  readonly conteos: Readonly<Record<ProblemaEstructura, number>>
  /** Lit boxes while a search or a pill is on; `null` when nothing is highlighted. */
  readonly resaltados: number | null
  readonly className?: string
}

function escribiendoEnOtroCampo(objetivo: EventTarget | null): boolean {
  if (!(objetivo instanceof HTMLElement)) return false
  return objetivo.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(objetivo.tagName)
}

/** "2 equipos resaltados", "Ningún equipo resaltado · probá con otra palabra". */
export function textoResaltados(cantidad: number): string {
  if (cantidad === 0) return 'Ningún equipo resaltado · probá con otra palabra'
  return cantidad === 1 ? '1 equipo resaltado' : `${cantidad} equipos resaltados`
}

export function BarraOrganigrama({
  q,
  onBuscar,
  problema,
  onProblema,
  conteos,
  resaltados,
  className,
}: BarraOrganigramaProps): ReactElement {
  const campo = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function alPulsar(evento: KeyboardEvent): void {
      if (evento.key !== '/' || evento.defaultPrevented || evento.metaKey || evento.ctrlKey || evento.altKey) return
      if (escribiendoEnOtroCampo(evento.target)) return
      if (typeof window.matchMedia === 'function' && !window.matchMedia('(min-width: 768px)').matches) return
      evento.preventDefault()
      campo.current?.focus()
    }
    document.addEventListener('keydown', alPulsar)
    return () => document.removeEventListener('keydown', alPulsar)
  }, [])

  return (
    <section aria-label="Buscar y resaltar" className={cn('grid min-w-0 gap-2.5', className)}>
      <div className="flex min-w-0 flex-col gap-2.5 md:flex-row md:flex-wrap md:items-center md:gap-x-3.5">
        <div className="min-w-0 md:w-[300px] md:shrink-0">
          <InputSistema
            ref={campo}
            type="search"
            icono={Search}
            aria-label="Buscar en el organigrama"
            placeholder="Buscar en el organigrama"
            value={q}
            onChange={(evento) => onBuscar(evento.target.value)}
            accesorio={
              <kbd className="hidden rounded-md border border-border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground md:inline-flex">
                /
              </kbd>
            }
            className="max-md:h-10 max-md:border-transparent max-md:bg-foreground/8"
          />
        </div>
        <GrupoPastillas etiqueta="Resaltar en el organigrama" className="md:flex-1">
          {PROBLEMAS_ESTRUCTURA.map((definicion) => (
            <PastillaFiltro
              key={definicion.id}
              etiqueta={definicion.label}
              cantidad={conteos[definicion.id]}
              tono={definicion.tono}
              activa={problema === definicion.id}
              onClick={() => onProblema(problema === definicion.id ? null : definicion.id)}
            />
          ))}
        </GrupoPastillas>
      </div>
      <p role="status" className="text-[13px] text-muted-foreground empty:hidden">
        {resaltados === null ? '' : textoResaltados(resaltados)}
      </p>
    </section>
  )
}
