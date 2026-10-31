'use client'

/**
 * Estudiantes — the "Agregar visitante" sheet of the leader list (artboard
 * 02): `DetalleResponsivo` (480px panel from md, bottom sheet below) holding
 * the shared flow of ./use-flujo-visitante.ts. Mount it with a new `key` per
 * opening so every visit starts at the search.
 */
import type { ReactElement } from 'react'

import { DetalleResponsivo } from '@/components/ui/detalle-responsivo'
import type { GradoEscala } from '@/lib/platform/estudiantes/grupos-datos'

import { ContenidoVisitante, PieVisitante } from './flujo-visitante'
import { useFlujoVisitante, type GrupoVisitante, type SesionVisitante } from './use-flujo-visitante'

export interface AgregarVisitanteProps {
  readonly abierto: boolean
  readonly onCambioAbierto: (abierto: boolean) => void
  readonly grupo: GrupoVisitante
  readonly sesion: SesionVisitante
  readonly escala: readonly GradoEscala[]
  readonly hoy: string
  /** "2do año · Chicas · Dom 25 oct". */
  readonly descripcion: string
  readonly onListo: () => void
}

export function AgregarVisitante({ abierto, onCambioAbierto, grupo, sesion, escala, hoy, descripcion, onListo }: AgregarVisitanteProps): ReactElement {
  const flujo = useFlujoVisitante({
    grupo,
    sesion,
    escala,
    hoy,
    onListo: () => {
      onCambioAbierto(false)
      onListo()
    },
    onCancelar: () => onCambioAbierto(false),
  })
  return (
    <DetalleResponsivo abierto={abierto} onCambioAbierto={onCambioAbierto} titulo="Agregar visitante" descripcion={descripcion} pie={<PieVisitante flujo={flujo} />}>
      <ContenidoVisitante flujo={flujo} />
    </DetalleResponsivo>
  )
}
