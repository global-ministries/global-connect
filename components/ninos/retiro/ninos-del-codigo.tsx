'use client'

import { textoSalida, type Retiro } from '@/lib/platform/ninos/retiro'

type Props = {
  retiro: Retiro
  marcados: readonly string[]
  onMarcar: (ninoId: string) => void
}

/** «¿A quién retiras?»: one checkbox per child inside; the ones already out say when and with whom. */
export function NinosDelCodigo({ retiro, marcados, onMarcar }: Props) {
  return (
    <fieldset className="relative min-w-0">
      <legend className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">¿A quién retiras?</legend>
      {retiro.adentro.length > 1 && <p className="absolute right-0 top-0 text-xs text-muted-foreground">Toca para marcar</p>}
      <ul className="divide-y divide-border/60 rounded-md border border-border">
        {retiro.adentro.map((f) => (
          <li key={f.checkin_id}>
            <label className="flex min-h-[56px] cursor-pointer items-center gap-3 px-3 py-2 transition-colors has-[:checked]:bg-brand-tint">
              <input
                type="checkbox"
                checked={marcados.includes(f.nino_id)}
                onChange={() => onMarcar(f.nino_id)}
                className="size-5 shrink-0 accent-[var(--brand-strong)]"
              />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-foreground">
                  {f.nombre} {f.apellido}
                </span>
                <span className="block truncate text-xs text-muted-foreground">Sigue en {f.salon}</span>
              </span>
            </label>
          </li>
        ))}
        {retiro.retirados.map((f) => (
          <li key={f.checkin_id} className="flex min-h-[56px] items-center gap-3 px-3 py-2">
            <span className="min-w-0 pl-8">
              <span className="block truncate text-sm font-medium text-muted-foreground">
                {f.nombre} {f.apellido}
              </span>
              <span className="block truncate text-xs text-success-text">{textoSalida(f)}</span>
            </span>
          </li>
        ))}
      </ul>
    </fieldset>
  )
}
