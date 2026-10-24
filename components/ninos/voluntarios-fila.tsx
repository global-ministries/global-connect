'use client'

import { cn } from '@/lib/utils'
import {
  ESTADOS_ASISTENCIA,
  ETIQUETA_ESTADO,
  nombreCompleto,
  type EstadoAsistencia,
  type FilaVoluntario,
} from '@/lib/platform/ninos/voluntarios'

const ACTIVO: Record<EstadoAsistencia, string> = {
  presente: 'border-green-600 bg-green-600 text-white',
  justificado: 'border-amber-500 bg-amber-500 text-white',
  ausente: 'border-red-600 bg-red-600 text-white',
}

type Props = {
  fila: FilaVoluntario
  editable: boolean
  /** Rows from several equipos (collapsed groups) also show the equipo. */
  mostrarEquipo?: boolean
  onMarcar: (fila: FilaVoluntario, estado: EstadoAsistencia) => void
}

/** One volunteer with the Presente / Avisó / Faltó buttons (tapping the active one clears it). */
export function FilaVoluntarioItem({ fila, editable, mostrarEquipo = false, onMarcar }: Props) {
  const nombre = nombreCompleto(fila)
  return (
    <li
      data-testid={`voluntario-${fila.servicio_id}`}
      className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
    >
      <div className="min-w-0">
        <p className="break-words text-[15px] font-medium text-foreground">{nombre}</p>
        <p className="text-sm text-muted-foreground">{mostrarEquipo ? `${fila.rol} · ${fila.equipo}` : fila.rol}</p>
      </div>
      <div role="group" aria-label={`Asistencia de ${nombre}`} className="grid shrink-0 grid-cols-3 gap-2 sm:w-[19rem]">
        {ESTADOS_ASISTENCIA.map((estado) => {
          const activo = fila.estado === estado
          return (
            <button
              key={estado}
              type="button"
              aria-pressed={activo}
              disabled={!editable}
              onClick={() => onMarcar(fila, estado)}
              className={cn(
                'min-h-[44px] rounded-xl border px-2 text-sm font-medium touch-manipulation transition-colors',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]',
                activo ? ACTIVO[estado] : 'border-border bg-card/50 text-foreground hover:bg-accent',
                !editable && 'cursor-not-allowed opacity-60',
              )}
            >
              {ETIQUETA_ESTADO[estado]}
            </button>
          )
        })}
      </div>
    </li>
  )
}
