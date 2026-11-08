'use client'

/**
 * Niños › Custodia — the «Custodia» chip of a child at the desk and in the
 * salón (artboards 05 `.q-al`, 06 `.ley`; T2e, S9.2). Tapping it shows «No
 * entregar a {persona} — {respaldo}» under it; on desktop the same text is
 * its tooltip. Nothing without restrictions.
 */
import { useId, useState, type ReactElement } from 'react'
import { Ban } from 'lucide-react'

import { BadgeSistema } from '@/components/ui/sistema-diseno'
import { textoNoEntregar, type RestriccionCustodia } from '@/lib/platform/ninos/custodia'

export function ChipCustodia({ restricciones }: { readonly restricciones: readonly RestriccionCustodia[] }): ReactElement | null {
  const [abierto, setAbierto] = useState(false)
  const idDetalle = useId()
  if (restricciones.length === 0) return null
  const textos = restricciones.map(textoNoEntregar)
  return (
    <>
      <button
        type="button"
        aria-expanded={abierto}
        aria-controls={idDetalle}
        aria-label={`Custodia: ${textos.join('. ')}`}
        title={textos.join('\n')}
        onClick={() => setAbierto((v) => !v)}
        className="focus-ring inline-flex items-center rounded-full pointer-coarse:min-h-11"
      >
        <BadgeSistema variante="error" tamaño="sm" className="gap-1">
          <Ban className="size-3 shrink-0" aria-hidden />
          Custodia
        </BadgeSistema>
      </button>
      {abierto && (
        <span id={idDetalle} className="block w-full space-y-0.5 text-[13px] font-medium text-danger-text">
          {textos.map((t) => (
            <span key={t} className="block">
              {t}
            </span>
          ))}
        </span>
      )}
    </>
  )
}
