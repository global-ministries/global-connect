/**
 * Estudiantes › En vivo — the groups of the meeting in the planning style
 * (artboards 04 / 05 of design/estudiantes-dps, B25): one dense table, a
 * sticky band per sub-área ("Grupos de Chicas 20/39 · 1 sin marcar") and a
 * row per group: avatar, name and leaders ("Sin líder" in warning),
 * Presentes "n / total" with a proportion bar, Visitantes and Estado (Sin
 * marcar / Faltan N / Completo, never color alone). On a phone the row is
 * 64px with "n/total" and the estado at its end. Every row opens the group
 * detail. "Última marca" is left out: estudiantes_en_vivo does not return
 * it. Server-safe.
 */
import type { ReactElement, ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'

import { FONDO_TONO, PuntoEstado } from '@/components/ui/punto-estado'
import { AvatarIniciales } from '@/components/grupos-vida/planner/avatar-iniciales'
import type { GrupoVivo } from '@/lib/platform/estudiantes/vivo-datos'
import { etiquetaEstado, inscritosDe, type SeccionVivo } from '@/lib/platform/estudiantes/vivo-vista'
import { cn } from '@/lib/utils'

import { BandaSeccion, CLASE_AVATAR_FILA, CLASE_FILA, CLASE_LINEA, CabeceraColumnas, TablaPlanificacion } from '../planificacion/region-datos'

const COLUMNAS = 'md:grid-cols-[minmax(0,1.4fr)_150px_80px_120px_16px] min-[1100px]:grid-cols-[minmax(0,1.6fr)_180px_90px_130px_16px]'

export const lideresTexto = (g: GrupoVivo): string => (g.lideres.length > 0 ? g.lideres.join(', ') : 'Sin líder')

function Lideres({ grupo }: { readonly grupo: GrupoVivo }): ReactElement {
  return grupo.lideres.length > 0 ? <span>{lideresTexto(grupo)}</span> : <span className="font-medium text-warning-text">Sin líder</span>
}

function FilaGrupoVivo({ grupo: g, onAbrir }: { readonly grupo: GrupoVivo; readonly onAbrir: (grupoId: string) => void }): ReactElement {
  const total = inscritosDe(g)
  const pct = total > 0 ? Math.round((g.presentes / total) * 100) : 0
  const { tono, texto } = etiquetaEstado(g)
  return (
    <li className={CLASE_LINEA}>
      <button
        type="button"
        aria-label={`Abrir ${g.nombre}`}
        onClick={() => onAbrir(g.grupoId)}
        className={cn(CLASE_FILA, COLUMNAS, 'focus-ring min-h-16 touch-manipulation transition-colors active:bg-accent md:min-h-11')}
      >
        <span className="flex min-w-0 flex-1 items-center gap-3 md:gap-2.5">
          <AvatarIniciales nombres={[g.nombre]} className={CLASE_AVATAR_FILA} />
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-semibold text-foreground md:text-sm">{g.nombre}</span>
            <span className="block truncate text-[13px] text-muted-foreground md:text-xs">
              <Lideres grupo={g} />
            </span>
          </span>
        </span>
        <span className="hidden items-center gap-2.5 md:flex">
          <span className="font-mono text-sm tabular-nums text-foreground">
            {g.presentes} <span className="text-xs text-muted-foreground">/ {total}</span>
          </span>
          <span aria-hidden="true" className="h-1.5 max-w-20 flex-1 overflow-hidden rounded-full bg-muted">
            <span className={cn('block h-full rounded-full', FONDO_TONO.success)} style={{ width: `${pct}%` }} />
          </span>
        </span>
        <span className="hidden font-mono text-sm tabular-nums text-foreground md:block">{g.visitantes}</span>
        <span className="hidden md:block">
          <PuntoEstado tono={tono} etiqueta={texto} />
        </span>
        <span className="flex shrink-0 flex-col items-end gap-0.5 md:hidden">
          <span className="font-mono text-[13px] tabular-nums text-foreground">
            {g.presentes}
            <span className="text-muted-foreground">/{total}</span>
          </span>
          <PuntoEstado tono={tono} etiqueta={texto} />
        </span>
        <ChevronRight aria-hidden="true" className="hidden size-4 shrink-0 text-muted-foreground md:block" />
      </button>
    </li>
  )
}

export interface ListaVivoProps {
  readonly secciones: readonly SeccionVivo[]
  readonly onAbrir: (grupoId: string) => void
  /** Shown instead of the table when no group is visible. */
  readonly vacio: ReactNode
}

export function ListaVivo({ secciones, onAbrir, vacio }: ListaVivoProps): ReactElement {
  return (
    <TablaPlanificacion>
      {secciones.length === 0 ? (
        vacio
      ) : (
        <>
          <CabeceraColumnas className={COLUMNAS}>
            <span>Grupo</span>
            <span>Presentes</span>
            <span>Visitantes</span>
            <span>Estado</span>
            <span />
          </CabeceraColumnas>
          {secciones.map((s, i) => (
            <section key={s.subarea} aria-labelledby={`vivo-seccion-${i}`}>
              <BandaSeccion
                id={`vivo-seccion-${i}`}
                titulo={s.subarea}
                cuenta={
                  <>
                    {s.presentes}/{s.inscritos}
                    <span className="sr-only"> presentes</span>
                  </>
                }
                pista={
                  s.gruposSinMarcar > 0 ? (
                    <>
                      · <span className="font-mono tabular-nums">{s.gruposSinMarcar}</span> sin marcar
                    </>
                  ) : undefined
                }
              />
              <ul aria-label={`Grupos de ${s.subarea}`}>
                {s.grupos.map((g) => (
                  <FilaGrupoVivo key={g.grupoId} grupo={g} onAbrir={onAbrir} />
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </TablaPlanificacion>
  )
}
