/**
 * Estudiantes › Voluntarios — one volunteer row in the planning style (E4a of
 * odd/tasks/estudiantes-estilo-dps.md; B33 and B36 of
 * design/estudiantes-dps/README-tanda-a.md): avatar and name (muted once
 * present), Rol and Estado from md, and the marks of DPS 05: «Avisó»
 * (warning) and «Faltó» (danger) written next to the big «Presente» circle.
 * The three are `aria-pressed` and exclusive; a second tap on the active one
 * clears it (the caller decides that). On a phone the second line repeats
 * the estado in text ("Servidora · Avisó"). Server-safe.
 */
import type { ReactElement } from 'react'

import { PuntoEstado, type TonoEstado } from '@/components/ui/punto-estado'
import { AvatarIniciales } from '@/components/grupos-vida/planner/avatar-iniciales'
import { ETIQUETA_ESTADO, nombreCompleto, type EstadoAsistencia, type FilaVoluntario } from '@/lib/platform/ninos/voluntarios'
import { cn } from '@/lib/utils'

import { MarcasFila } from '../planificacion/marcas'
import { CLASE_AVATAR_FILA, CLASE_FILA, CLASE_LINEA } from '../planificacion/region-datos'

/** Voluntario · Rol · Estado (from lg) · Marcar. */
export const COLUMNAS_VOLUNTARIOS = 'md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_212px] lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_120px_212px]'

const TONO: Readonly<Record<EstadoAsistencia, { readonly tono: TonoEstado; readonly texto: string }>> = {
  presente: { tono: 'success', texto: 'text-success-text' },
  justificado: { tono: 'warning', texto: 'text-warning-text' },
  ausente: { tono: 'danger', texto: 'text-danger-text' },
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
  const rol = mostrarEquipo ? `${fila.rol} · ${fila.equipo}` : fila.rol
  const estado = fila.estado ? ETIQUETA_ESTADO[fila.estado] : 'Sin marcar'
  const tono = fila.estado ? TONO[fila.estado] : { tono: 'muted' as const, texto: 'text-muted-foreground' }
  return (
    <li className={cn(CLASE_LINEA, CLASE_FILA, COLUMNAS_VOLUNTARIOS)}>
      <span className="flex min-w-0 flex-1 items-center gap-3 md:gap-2.5">
        <AvatarIniciales nombres={[nombre]} className={CLASE_AVATAR_FILA} />
        <span className="min-w-0">
          <span
            className={cn('block truncate text-[15px] font-semibold text-foreground md:text-sm', fila.estado === 'presente' && 'font-medium text-muted-foreground')}
            title={nombre}
          >
            {nombre}
          </span>
          <span className="block truncate text-[13px] text-muted-foreground md:hidden">
            {rol} · <span className={cn('font-medium', tono.texto)}>{estado}</span>
          </span>
        </span>
      </span>
      <span className="hidden truncate text-sm text-foreground md:block">{rol}</span>
      <span className="hidden lg:block">
        <PuntoEstado tono={tono.tono} etiqueta={estado} />
      </span>
      <MarcasFila
        nombre={nombre}
        presente={fila.estado === 'presente'}
        onPresente={() => onMarcar(fila, 'presente')}
        deshabilitadas={!editable}
        secundarias={[
          { texto: ETIQUETA_ESTADO.justificado, tono: 'warning', activa: fila.estado === 'justificado', onClick: () => onMarcar(fila, 'justificado') },
          { texto: ETIQUETA_ESTADO.ausente, tono: 'danger', activa: fila.estado === 'ausente', onClick: () => onMarcar(fila, 'ausente') },
        ]}
      />
    </li>
  )
}
