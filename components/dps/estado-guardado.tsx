/**
 * DPS — the autosave status (planned `EstadoGuardado` of
 * docs/design-system/components.md#planning-style-components, `.sv` of the
 * DPS artboards; local here until it moves to components/ui). 12px muted,
 * `role="status"`: "Guardando…" → check + "Guardado"; a failure reads "No se
 * pudo guardar" in `danger-text` (the change was already rolled back).
 */
import type { ReactElement } from 'react'
import { Check, Loader2 } from 'lucide-react'

import { cn } from '@/lib/utils'

export type EstadoGuardadoValor = 'inactivo' | 'guardando' | 'guardado' | 'error'

export function EstadoGuardado({ estado, className }: { readonly estado: EstadoGuardadoValor; readonly className?: string }): ReactElement {
  return (
    <p
      role="status"
      aria-live="polite"
      data-testid="estado-guardado"
      className={cn('flex min-h-5 items-center gap-1 text-xs text-muted-foreground', estado === 'error' && 'text-danger-text', className)}
    >
      {estado === 'guardando' && (
        <>
          <Loader2 aria-hidden="true" className="size-3.5 animate-spin motion-reduce:animate-none" />
          Guardando…
        </>
      )}
      {estado === 'guardado' && (
        <>
          <Check aria-hidden="true" className="size-3.5 text-success-text" />
          Guardado
        </>
      )}
      {estado === 'error' && 'No se pudo guardar'}
    </p>
  )
}
