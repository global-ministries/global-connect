/**
 * Niños › Custodia — the red banner of a restriction (artboard 07 `.cus`;
 * T2e, S9.2): «No entregar a {persona} — {respaldo}», whom it covers, the
 * protocol and who to tell. The app has no coordination phone yet, so it
 * says «Avisa a coordinación» instead of a «Llamar a coordinación» link.
 */
import type { ReactElement } from 'react'
import { Ban, PhoneCall } from 'lucide-react'

import { AVISA_COORDINACION, textoNoEntregar } from '@/lib/platform/ninos/custodia'

type Props = {
  readonly persona: string
  readonly respaldo: string
  readonly notas: string | null
  /** «Sofía y Mateo»: the children it covers, when it is not obvious. */
  readonly ninos?: string
  /** Pickup: add «Avisa a coordinación». */
  readonly conCoordinacion?: boolean
}

export function AvisoCustodia({ persona, respaldo, notas, ninos, conCoordinacion = false }: Props): ReactElement {
  return (
    <section role="alert" aria-label="Custodia" className="grid min-w-0 gap-1.5 rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm">
      <p className="flex min-w-0 items-start gap-2 break-words font-semibold text-danger-text">
        <Ban className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span className="min-w-0">{textoNoEntregar({ persona, respaldo })}</span>
      </p>
      {ninos && <p className="pl-6 text-foreground">No puede retirar a {ninos}.</p>}
      {notas && <p className="whitespace-pre-line break-words pl-6 text-foreground">{notas}</p>}
      {conCoordinacion && (
        <p className="flex items-center gap-2 pl-6 font-semibold text-foreground">
          <PhoneCall className="size-4 shrink-0 text-danger-text" aria-hidden />
          {AVISA_COORDINACION}
        </p>
      )}
    </section>
  )
}
