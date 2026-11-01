'use client'

/**
 * Estudiantes › Voluntarios — one volunteer row with the Presente / Avisó /
 * Faltó marks (C5 of odd/tasks/estudiantes-fase-b.md).
 *
 * `MarcaVoluntario` is the three-state sibling of gap G1 (`MarcaAsistencia`,
 * components/estudiantes/lista/marca-asistencia.tsx; "Planned components" in
 * docs/design-system/components.md): the `ControlSegmentado` frame and
 * pressed state with three text segments (44px targets), each with
 * `aria-pressed`; a second tap on the pressed one clears the mark (the caller
 * decides that). The row is the inset row of `FilaInset`
 * (components/estudiantes/filas-inset.tsx) with the marks under the name on
 * phones and at its end from `sm`.
 */
import type { ReactElement } from 'react'

import {
  ESTADOS_ASISTENCIA,
  ETIQUETA_ESTADO,
  nombreCompleto,
  type EstadoAsistencia,
  type FilaVoluntario,
} from '@/lib/platform/ninos/voluntarios'
import { cn } from '@/lib/utils'

export interface MarcaVoluntarioProps {
  /** The person's name, for the group label ("Asistencia de Ana Rivas"). */
  readonly nombre: string
  readonly valor: EstadoAsistencia | null
  readonly deshabilitada: boolean
  readonly onMarcar: (toque: EstadoAsistencia) => void
}

export function MarcaVoluntario({ nombre, valor, deshabilitada, onMarcar }: MarcaVoluntarioProps): ReactElement {
  return (
    <div role="group" aria-label={`Asistencia de ${nombre}`} className="grid shrink-0 grid-cols-3 rounded-xl border border-border bg-card p-[3px] sm:w-[16.5rem]">
      {ESTADOS_ASISTENCIA.map((estado) => {
        const pulsado = valor === estado
        return (
          <button
            key={estado}
            type="button"
            aria-pressed={pulsado}
            disabled={deshabilitada}
            onClick={() => onMarcar(estado)}
            className={cn(
              'focus-ring min-h-11 rounded-md px-2 text-sm font-medium transition-colors touch-manipulation',
              pulsado ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground',
              deshabilitada && 'cursor-not-allowed opacity-60 hover:text-muted-foreground',
            )}
          >
            {ETIQUETA_ESTADO[estado]}
          </button>
        )
      })}
    </div>
  )
}

export interface FilaVoluntarioEstudiantesProps {
  readonly fila: FilaVoluntario
  readonly editable: boolean
  /** Rows of several equipos (Otros, Sin turno) also show the equipo. */
  readonly mostrarEquipo?: boolean
  readonly onMarcar: (fila: FilaVoluntario, estado: EstadoAsistencia) => void
}

export function FilaVoluntarioEstudiantes({ fila, editable, mostrarEquipo = false, onMarcar }: FilaVoluntarioEstudiantesProps): ReactElement {
  const nombre = nombreCompleto(fila)
  return (
    <li
      className={cn(
        'relative flex min-w-0 flex-col gap-2 px-3.5 py-2.5 sm:min-h-[60px] sm:flex-row sm:items-center sm:gap-4',
        'before:absolute before:top-0 before:right-0 before:left-3.5 before:h-px before:bg-border/60 first:before:hidden',
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold text-foreground" title={nombre}>
          {nombre}
        </span>
        <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">{mostrarEquipo ? `${fila.rol} · ${fila.equipo}` : fila.rol}</span>
      </span>
      <MarcaVoluntario nombre={nombre} valor={fila.estado} deshabilitada={!editable} onMarcar={(estado) => onMarcar(fila, estado)} />
    </li>
  )
}
