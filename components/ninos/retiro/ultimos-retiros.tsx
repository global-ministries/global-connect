'use client'

import { horaEnCaracas } from '@/lib/platform/ninos/fecha'
import type { RetirosRecientes } from '@/lib/platform/ninos/retiro'

/** While no code is open: the service's counts and its last pickups (who, with whom, when). */
export function UltimosRetiros({ recientes }: { recientes: RetirosRecientes }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        <strong className="font-mono font-semibold tabular-nums text-foreground">{recientes.adentro}</strong> niños adentro ·{' '}
        <strong className="font-mono font-semibold tabular-nums text-foreground">{recientes.salieron}</strong> ya salieron
      </p>
      {recientes.retiros.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Últimos retiros</p>
          <ul aria-label="Últimos retiros" className="divide-y divide-border/60 rounded-md border border-border">
            {recientes.retiros.map((r) => (
              <li key={`${r.ninoId}-${r.salidaAt}`} className="flex min-h-[56px] items-center gap-3 px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground">{r.nombre}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {r.retiradoPor ? `${r.salon} · con ${r.retiradoPor}` : r.salon}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">{horaEnCaracas(r.salidaAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
