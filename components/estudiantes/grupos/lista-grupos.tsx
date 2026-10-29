'use client'

/**
 * Estudiantes › Grupos — the list (artboards 06 / 07): a `ListaResponsiva`
 * with Grupo (+ leaders, "Sin líder" in warning text), Año or Zona (from lg),
 * Integrantes and Por confirmar. Phones get inset rows: name, leaders, flags
 * (Sin líder, N por confirmar, Desactivado) and the member count. Every row
 * opens the group drawer. The Sunday attendance column waits for C3 (L23).
 */
import type { ReactElement, ReactNode } from 'react'

import { BadgeSistema } from '@/components/ui/sistema-diseno'
import { ListaResponsiva, type ColumnaLista } from '@/components/ui/lista-responsiva'
import type { GrupoGestion } from '@/lib/platform/estudiantes/grupos-datos'
import {
  horarioTexto,
  lideresTexto,
  miembrosDe,
  porConfirmarDe,
  type OrdenGrupos,
  type VistaGrupos,
} from '@/lib/platform/estudiantes/grupos-vista'

/** The header a column sorts by, and how (the list sorts one way per column). */
const ORDEN_COLUMNA: Readonly<Record<string, { readonly orden: OrdenGrupos; readonly sentido: 'asc' | 'desc' }>> = {
  grupo: { orden: 'nombre', sentido: 'asc' },
  anio: { orden: 'anio', sentido: 'asc' },
  integrantes: { orden: 'integrantes', sentido: 'desc' },
}

function Lideres({ grupo }: { readonly grupo: GrupoGestion }): ReactElement {
  const texto = lideresTexto(grupo)
  if (!grupo.activo) return <span>Desactivado</span>
  return texto ? <span>{texto}</span> : <span className="font-medium text-warning-text">Sin líder</span>
}

function CeldaGrupo({ grupo }: { readonly grupo: GrupoGestion }): ReactElement {
  return (
    <div className="min-w-0">
      <p className="truncate text-[15px] font-semibold text-foreground">{grupo.nombre}</p>
      <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
        <Lideres grupo={grupo} />
      </p>
    </div>
  )
}

function CeldaAnio({ grupo }: { readonly grupo: GrupoGestion }): ReactElement {
  const horario = horarioTexto(grupo.diaSemana, grupo.hora)
  return (
    <div className="min-w-0 text-sm text-muted-foreground">
      <p className="truncate">{grupo.anioEtiqueta ?? grupo.zona ?? '—'}</p>
      {horario && <p className="truncate text-[13px]">{horario}</p>}
    </div>
  )
}

function Insignias({ grupo }: { readonly grupo: GrupoGestion }): ReactElement | null {
  const porConfirmar = porConfirmarDe(grupo).length
  const insignias: ReactNode[] = []
  if (!grupo.activo) {
    insignias.push(
      <BadgeSistema key="inactivo" variante="default" tamaño="sm">
        Desactivado
      </BadgeSistema>,
    )
  } else if (grupo.lideres.length === 0) {
    insignias.push(
      <BadgeSistema key="lider" variante="warning" tamaño="sm">
        Sin líder
      </BadgeSistema>,
    )
  }
  if (porConfirmar > 0) {
    insignias.push(
      <BadgeSistema key="confirmar" variante="info" tamaño="sm">
        {`${porConfirmar} por confirmar`}
      </BadgeSistema>,
    )
  }
  return insignias.length > 0 ? <>{insignias}</> : null
}

export interface ListaGruposProps {
  readonly vista: VistaGrupos
  readonly onOrdenar: (orden: OrdenGrupos) => void
  readonly onAbrir: (grupoId: string) => void
  readonly vacio: ReactNode
}

export function ListaGrupos({ vista, onOrdenar, onAbrir, vacio }: ListaGruposProps): ReactElement {
  const columnas: readonly ColumnaLista[] = [
    { id: 'grupo', titulo: 'Grupo', ordenable: true, ancho: 'minmax(0,1.6fr)' },
    { id: 'anio', titulo: vista.columnaAnio, ordenable: true, ocultarEnTablet: true, ancho: 'minmax(0,0.8fr)' },
    { id: 'integrantes', titulo: 'Integrantes', ordenable: true, ancho: 'minmax(0,0.6fr)' },
    { id: 'confirmar', titulo: 'Por confirmar', ancho: 'minmax(0,0.8fr)' },
  ]
  const columnaActiva = Object.entries(ORDEN_COLUMNA).find(([, o]) => o.orden === vista.filtros.orden)

  return (
    <ListaResponsiva
      etiqueta="Grupos"
      columnas={columnas}
      filas={vista.visibles}
      claveFila={(grupo) => grupo.id}
      orden={columnaActiva ? { columna: columnaActiva[0], sentido: columnaActiva[1].sentido } : undefined}
      onOrdenar={(columna) => {
        const orden = ORDEN_COLUMNA[columna]
        if (orden) onOrdenar(orden.orden)
      }}
      onAbrirFila={(grupo) => onAbrir(grupo.id)}
      etiquetaFila={(grupo) => `Abrir ${grupo.nombre}`}
      vacio={vacio}
      renderCelda={(grupo, columna) => {
        switch (columna) {
          case 'grupo':
            return <CeldaGrupo grupo={grupo} />
          case 'anio':
            return <CeldaAnio grupo={grupo} />
          case 'integrantes':
            return <span className="font-mono text-[15px] tabular-nums text-foreground">{miembrosDe(grupo).length}</span>
          default: {
            const porConfirmar = porConfirmarDe(grupo).length
            return porConfirmar > 0 ? (
              <BadgeSistema variante="info" tamaño="sm">{`${porConfirmar} por confirmar`}</BadgeSistema>
            ) : (
              <span className="text-sm text-muted-foreground">—</span>
            )
          }
        }
      }}
      renderFilaMovil={(grupo) => {
        const miembros = miembrosDe(grupo).length
        return {
          titulo: grupo.nombre,
          subtitulo: <Lideres grupo={grupo} />,
          insignias: <Insignias grupo={grupo} />,
          meta: (
            <span className="font-mono text-sm tabular-nums text-muted-foreground" aria-label={`${miembros} integrantes`}>
              {miembros}
            </span>
          ),
        }
      }}
    />
  )
}
