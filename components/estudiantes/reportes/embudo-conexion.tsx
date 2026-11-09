'use client'

/**
 * Estudiantes › Reportes — «Embudo de conexión» (S18, L48 "Foto de hoy", L49
 * names; gap GR1 `EmbudoEtapas` under "Planned components" in
 * docs/design-system/components.md): Sin grupo → En grupo → Sirviendo for
 * the ámbito (and sub-área) today; the date range does not change it.
 *
 * Each step is a button that opens its list in the panel
 * (`aria-haspopup="dialog"`), named by its whole sentence. Two looks
 * (design/estudiantes-dps 15 / 16, C28, C35):
 * - `barra`: vertical, in the «barra de alcance»: name, value, definition,
 *   the conversion in brand text with its bar, and a decorative arrow down
 *   between steps.
 * - `compacto`: three 76px cards side by side on phones: name, value and the
 *   conversion.
 * Foyer / Living Room / Kitchen are the plan's internal names and never show.
 */
import type { ReactElement } from 'react'
import { ArrowDown } from 'lucide-react'

import { textoPorcentaje, type IdEtapa, type PasoEmbudo } from '@/lib/platform/estudiantes/reportes'
import { cn } from '@/lib/utils'

export interface EmbudoConexionProps {
  readonly pasos: readonly PasoEmbudo[]
  readonly onAbrir: (id: IdEtapa) => void
  readonly variante?: 'barra' | 'compacto'
}

const minuscula = (texto: string): string => texto.charAt(0).toLocaleLowerCase('es') + texto.slice(1)

const nombrePaso = (paso: PasoEmbudo): string =>
  `${paso.nombre}: ${paso.cantidad} ${paso.cantidad === 1 ? 'persona' : 'personas'}, ${minuscula(paso.definicion)}. ${textoPorcentaje(paso.conversion)} ${paso.conversionTexto}. Ver la lista.`

export function EmbudoConexion({ pasos, onAbrir, variante = 'barra' }: EmbudoConexionProps): ReactElement {
  if (variante === 'compacto') {
    return (
      <ul aria-label="Embudo de conexión" className="grid grid-cols-3 gap-2">
        {pasos.map((paso) => (
          <li key={paso.id} className="min-w-0">
            <button
              type="button"
              aria-haspopup="dialog"
              aria-label={nombrePaso(paso)}
              onClick={() => onAbrir(paso.id)}
              className="focus-ring flex h-full min-h-[76px] w-full min-w-0 flex-col items-start gap-0.5 rounded-2xl bg-card px-3 py-2.5 text-left transition-colors touch-manipulation active:bg-accent"
            >
              <b className="max-w-full truncate text-xs font-semibold text-muted-foreground">{paso.nombre}</b>
              <span className="font-mono text-2xl font-semibold tabular-nums text-foreground">{paso.cantidad}</span>
              {paso.conversion !== null && <small className="text-xs leading-tight text-brand-text">{`${textoPorcentaje(paso.conversion)} ${paso.conversionTexto}`}</small>}
            </button>
          </li>
        ))}
      </ul>
    )
  }
  return (
    <ul aria-label="Embudo de conexión" className="flex flex-col">
      {pasos.map((paso, i) => (
        <li key={paso.id} className="min-w-0">
          {i > 0 && (
            <span aria-hidden="true" className="flex h-3.5 justify-center text-muted-foreground">
              <ArrowDown className="size-3.5" />
            </span>
          )}
          <button
            type="button"
            aria-haspopup="dialog"
            aria-label={nombrePaso(paso)}
            onClick={() => onAbrir(paso.id)}
            className={cn(
              'focus-ring -ml-2 grid w-[calc(100%+8px)] grid-cols-[minmax(0,1fr)_auto] gap-x-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent',
            )}
          >
            <b className="truncate text-[13px] font-semibold text-foreground">{paso.nombre}</b>
            <span className="font-mono text-lg leading-tight font-semibold tabular-nums text-foreground">{paso.cantidad}</span>
            <small className="col-span-2 text-xs text-muted-foreground">{paso.definicion}</small>
            {paso.conversion !== null && (
              <>
                <span className="col-span-2 mt-0.5 text-xs text-brand-text">
                  <strong className="font-mono font-semibold tabular-nums">{textoPorcentaje(paso.conversion)}</strong> {paso.conversionTexto}
                </span>
                <span aria-hidden="true" className="col-span-2 mt-1 h-1 overflow-hidden rounded-full bg-muted">
                  <span className="block h-full rounded-full bg-brand" style={{ width: `${Math.round(paso.conversion)}%` }} />
                </span>
              </>
            )}
          </button>
        </li>
      ))}
    </ul>
  )
}
