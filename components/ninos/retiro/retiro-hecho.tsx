'use client'

import { Check } from 'lucide-react'

import { BotonSistema } from '@/components/ui/sistema-diseno'
import { horaEnCaracas } from '@/lib/platform/ninos/fecha'
import { listaNatural, type FilaCodigo } from '@/lib/platform/ninos/retiro'

type Props = {
  titulo: string
  detalle: string
  codigo: string
  /** The children of the code still inside. */
  quedan: readonly FilaCodigo[]
  onRetirarQuedan: () => void
  onSiguiente: () => void
}

const primerNombre = (f: FilaCodigo) => f.nombre.trim().split(/\s+/)[0] ?? f.nombre

/** After a pickup: who picked up and when, and who is still inside with the same code. */
export function RetiroHecho({ titulo, detalle, codigo, quedan, onRetirarQuedan, onSiguiente }: Props) {
  return (
    <div className="space-y-4">
      <section role="status" className="flex gap-3 rounded-md border border-success/20 bg-success/10 p-4">
        <Check className="mt-0.5 size-5 shrink-0 text-success-text" aria-hidden />
        <div className="min-w-0">
          <p className="text-base font-semibold text-foreground">{titulo}</p>
          <p className="text-sm text-success-text">{detalle}</p>
        </div>
      </section>

      {quedan.length > 0 && (
        <div className="space-y-2">
          <p className="flex items-baseline justify-between gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            <span>Sigue adentro</span>
            <span className="font-normal normal-case tracking-normal">
              Código <span className="font-mono tabular-nums">{codigo}</span> activo
            </span>
          </p>
          <ul aria-label="Sigue adentro" className="divide-y divide-border/60 rounded-md border border-border">
            {quedan.map((f) => (
              <li key={f.checkin_id} className="min-h-[56px] px-3 py-2">
                <span className="block truncate text-sm font-semibold text-foreground">
                  {f.nombre} {f.apellido}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  Sigue en {f.salon} · desde <span className="font-mono tabular-nums">{horaEnCaracas(f.entrada_at)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-2">
        {quedan.length > 0 && (
          <BotonSistema type="button" variante="secundario" tamaño="lg" className="w-full" onClick={onRetirarQuedan}>
            Retirar a {listaNatural(quedan.map(primerNombre))} también
          </BotonSistema>
        )}
        <BotonSistema type="button" tamaño="lg" className="w-full" onClick={onSiguiente}>
          Siguiente código
        </BotonSistema>
      </div>
    </div>
  )
}
