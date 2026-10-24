'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Plus, X } from 'lucide-react'

import { BotonSistema, TarjetaSistema, TituloSistema } from '@/components/ui/sistema-diseno'
import type { HijoForm } from '@/lib/platform/ninos/familia'
import { hoyEnCaracas } from '@/lib/platform/ninos/fecha'
import type { SalonNivel } from '@/lib/platform/ninos/nivel'
import { edadOGrado } from '@/lib/platform/ninos/salon'

import { CamposNino } from './campos-nino'

type Props = {
  hijos: HijoForm[]
  onCambiar: (i: number, h: HijoForm) => void
  onQuitar: (i: number) => void
  onAgregar: () => void
  salones?: readonly SalonNivel[]
}

function resumen(h: HijoForm): string {
  const nombre = `${h.nombre} ${h.apellido}`.trim() || 'Sin nombre'
  const edad = edadOGrado({ grado: null, fecha_nacimiento: h.fechaNacimiento || null }, hoyEnCaracas())
  return edad ? `${nombre} · ${edad}` : nombre
}

/**
 * The children of a family form, one full-width card per row. Only one card is
 * expanded at a time; the others collapse into a "name · age" summary. Collapsed
 * fields stay mounted (hidden) so their state is never lost.
 */
export function TarjetasHijos({ hijos, onCambiar, onQuitar, onAgregar, salones }: Props) {
  const [abierto, setAbierto] = useState(hijos.length - 1)
  const tarjetas = useRef<(HTMLDivElement | null)[]>([])
  const cantidad = useRef(hijos.length)
  const [cantidadVista, setCantidadVista] = useState(hijos.length)

  // A newly added child opens (adjusted during render, not in an effect)...
  if (hijos.length !== cantidadVista) {
    setCantidadVista(hijos.length)
    if (hijos.length > cantidadVista) setAbierto(hijos.length - 1)
  }

  // ...then scrolls into view and receives focus.
  useEffect(() => {
    const anterior = cantidad.current
    cantidad.current = hijos.length
    if (hijos.length <= anterior) return
    const tarjeta = tarjetas.current[hijos.length - 1]
    tarjeta?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
    tarjeta?.querySelector<HTMLElement>('input, select, textarea')?.focus()
  }, [hijos.length])

  function quitar(i: number) {
    onQuitar(i)
    setAbierto((a) => (a === i ? Math.max(0, i - 1) : a > i ? a - 1 : a))
  }

  const varios = hijos.length > 1

  return (
    <div className="space-y-3">
      {hijos.map((h, i) => {
        const expandido = !varios || abierto === i
        return (
          <TarjetaSistema
            key={i}
            ref={(el) => {
              tarjetas.current[i] = el
            }}
            data-testid={`nino-${i + 1}`}
            className={expandido ? 'min-w-0 space-y-4 p-4 md:p-5' : 'min-w-0 px-4 py-2 md:px-5'}
          >
            <div className="flex items-center justify-between gap-2">
              {varios && !expandido ? (
                <button
                  type="button"
                  aria-expanded={false}
                  onClick={() => setAbierto(i)}
                  className="flex min-h-[44px] min-w-0 flex-1 items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]/40"
                >
                  <ChevronDown className="h-4 w-4 shrink-0 -rotate-90 text-muted-foreground" aria-hidden />
                  <span className="shrink-0 text-sm font-semibold text-foreground">Niño {i + 1}</span>
                  <span className="truncate text-sm text-muted-foreground">{resumen(h)}</span>
                </button>
              ) : (
                <TituloSistema nivel={3}>Niño {i + 1}</TituloSistema>
              )}
              {varios && (
                <BotonSistema type="button" variante="ghost" tamaño="sm" icono={X} onClick={() => quitar(i)}>
                  Quitar
                </BotonSistema>
              )}
            </div>
            <div hidden={!expandido}>
              <CamposNino indice={i} hijo={h} onChange={(x) => onCambiar(i, x)} salones={salones} />
            </div>
          </TarjetaSistema>
        )
      })}
      <BotonSistema type="button" variante="outline" icono={Plus} className="w-full" onClick={onAgregar}>
        Agregar otro niño
      </BotonSistema>
    </div>
  )
}
