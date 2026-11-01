'use client'

/**
 * Estudiantes › En vivo — the groups of the meeting (artboards 03 / 04): a
 * `ListaResponsiva` with Grupo (+ leaders), Presentes (n / inscritos and a
 * proportion bar), Visitantes and Estado (`PuntoEstado`: Sin marcar / Faltan
 * N / Completo). "Última marca" is left out: estudiantes_en_vivo does not
 * return it. The headers sort (Grupo A–Z, más presentes, sin marcar primero).
 * Phones get inset rows: name, leaders, and "n/total" with the estado. Every
 * row opens the group detail.
 */
import type { ReactElement, ReactNode } from 'react'

import { ListaResponsiva, type ColumnaLista } from '@/components/ui/lista-responsiva'
import { FONDO_TONO, PuntoEstado } from '@/components/ui/punto-estado'
import type { GrupoVivo } from '@/lib/platform/estudiantes/vivo-datos'
import { etiquetaEstado, inscritosDe, type OrdenVivo } from '@/lib/platform/estudiantes/vivo-vista'

const COLUMNAS: readonly ColumnaLista[] = [
  { id: 'grupo', titulo: 'Grupo', ordenable: true, ancho: 'minmax(0,1.6fr)' },
  { id: 'presentes', titulo: 'Presentes', ordenable: true, ancho: 'minmax(0,1fr)' },
  { id: 'visitantes', titulo: 'Visitantes', ancho: 'minmax(0,0.6fr)' },
  { id: 'estado', titulo: 'Estado', ordenable: true, ancho: 'minmax(0,0.8fr)' },
]

/** The sort a header applies, and how the arrow reads. */
const ORDEN_COLUMNA: Readonly<Record<string, { readonly orden: OrdenVivo; readonly sentido: 'asc' | 'desc' }>> = {
  grupo: { orden: 'nombre', sentido: 'asc' },
  presentes: { orden: 'asistencia', sentido: 'desc' },
  estado: { orden: 'atencion', sentido: 'asc' },
}

export const lideresTexto = (g: GrupoVivo): string => (g.lideres.length > 0 ? g.lideres.join(', ') : 'Sin líder')

function Lideres({ grupo }: { readonly grupo: GrupoVivo }): ReactElement {
  return grupo.lideres.length > 0 ? <span>{lideresTexto(grupo)}</span> : <span className="font-medium text-warning-text">Sin líder</span>
}

function Presentes({ grupo }: { readonly grupo: GrupoVivo }): ReactElement {
  const total = inscritosDe(grupo)
  const pct = total > 0 ? Math.round((grupo.presentes / total) * 100) : 0
  return (
    <div className="min-w-0 max-w-[160px]">
      <span className="font-mono text-[15px] tabular-nums text-foreground">
        {grupo.presentes} <span className="text-[13px] text-muted-foreground">/ {total}</span>
      </span>
      <span aria-hidden="true" className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-muted">
        <span className={`block h-full rounded-full ${FONDO_TONO.success}`} style={{ width: `${pct}%` }} />
      </span>
    </div>
  )
}

export interface ListaVivoProps {
  readonly grupos: readonly GrupoVivo[]
  readonly orden: OrdenVivo
  readonly onOrdenar: (orden: OrdenVivo) => void
  readonly onAbrir: (grupoId: string) => void
  readonly vacio: ReactNode
}

export function ListaVivo({ grupos, orden, onOrdenar, onAbrir, vacio }: ListaVivoProps): ReactElement {
  const columnaActiva = Object.entries(ORDEN_COLUMNA).find(([, o]) => o.orden === orden)
  return (
    <ListaResponsiva
      etiqueta="Grupos"
      columnas={COLUMNAS}
      filas={grupos}
      claveFila={(g) => g.grupoId}
      orden={columnaActiva ? { columna: columnaActiva[0], sentido: columnaActiva[1].sentido } : undefined}
      onOrdenar={(columna) => {
        const o = ORDEN_COLUMNA[columna]
        if (o) onOrdenar(o.orden)
      }}
      onAbrirFila={(g) => onAbrir(g.grupoId)}
      etiquetaFila={(g) => `Abrir ${g.nombre}`}
      vacio={vacio}
      renderCelda={(g, columna) => {
        switch (columna) {
          case 'grupo':
            return (
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold text-foreground">{g.nombre}</p>
                <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
                  <Lideres grupo={g} />
                </p>
              </div>
            )
          case 'presentes':
            return <Presentes grupo={g} />
          case 'visitantes':
            return <span className="font-mono text-[15px] tabular-nums text-foreground">{g.visitantes}</span>
          default: {
            const { tono, texto } = etiquetaEstado(g)
            return <PuntoEstado tono={tono} etiqueta={texto} />
          }
        }
      }}
      renderFilaMovil={(g) => {
        const { tono, texto } = etiquetaEstado(g)
        return {
          titulo: g.nombre,
          subtitulo: <Lideres grupo={g} />,
          meta: (
            <span className="flex flex-col items-end gap-1">
              <span className="font-mono text-sm tabular-nums text-foreground" aria-label={`${g.presentes} presentes de ${inscritosDe(g)}`}>
                {g.presentes}
                <span className="text-muted-foreground">/{inscritosDe(g)}</span>
              </span>
              <PuntoEstado tono={tono} etiqueta={texto} />
            </span>
          ),
        }
      }}
    />
  )
}
