'use client'

/**
 * Niños › Voluntarios, the salón of each volunteer (odd/tasks/ninos-checkin-pco.md,
 * T2c, L27). A «Salón» select (the campus salones + «Anfitriones / mesa») sets
 * the habitual salón; with «Solo hoy» it sets the salón of this service only,
 * and unchecking it goes back to the habitual one. The salón screen shows each
 * salón's volunteers from this.
 */
import type { ReactNode } from 'react'

import { SelectSistema } from '@/components/ui/sistema-diseno'
import { MESA, type AsignacionSalon, type SalonOpcionPlanilla } from '@/lib/platform/ninos/salon-voluntarios'

type Props = {
  servicioId: string
  asignacion: AsignacionSalon | undefined
  salones: readonly SalonOpcionPlanilla[]
  /** «Solo hoy» is offered only while the date can still be marked. */
  editableHoy: boolean
  onCambiar: (salonId: string | null, soloHoy: boolean) => void
  /** Ticks «Solo hoy» without writing: the next salón chosen is for this service. */
  soloHoy: boolean
  onSoloHoy: (activo: boolean) => void
  /** The volunteer row (FilaVoluntarioItem). */
  children: ReactNode
}

/** One volunteer row plus its salón, kept as one list item. */
export function FilaConSalon({ servicioId, asignacion, salones, editableHoy, onCambiar, soloHoy, onSoloHoy, children }: Props) {
  const valor = asignacion?.salonId ?? MESA
  return (
    <li data-testid={`salon-${servicioId}`} className="pb-3">
      <ul>{children}</ul>
      <div className="flex flex-wrap items-end gap-x-4 gap-y-1 sm:max-w-md">
        <div className="min-w-0 flex-1">
          <SelectSistema
            id={`salon-${servicioId}-select`}
            label="Salón"
            opciones={[{ valor: MESA, etiqueta: 'Anfitriones / mesa' }, ...salones.map((s) => ({ valor: s.id, etiqueta: s.nombre }))]}
            value={valor}
            onValueChange={(v) => onCambiar(v === MESA ? null : v, soloHoy)}
          />
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={soloHoy}
            disabled={!editableHoy}
            onChange={(e) => onSoloHoy(e.target.checked)}
            className="size-4 accent-[var(--brand-strong)]"
          />
          Solo hoy
        </label>
      </div>
    </li>
  )
}
