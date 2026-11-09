'use client'

/**
 * Estudiantes › Grupos — the groups (artboards 11 / 12 of
 * design/estudiantes-dps, C5, C6, C12).
 *
 * - Desktop: a `TablaDensa` banded by sub-área ("Grupos de Chicas · 3 grupos ·
 *   39 integrantes · Dirige Lorena Salas"): Grupo (frozen, opens the panel)
 *   · Año or Zona (+ day and hour in The Living Room) · Líderes ("Sin líder"
 *   in warning text) · Integrantes · Por confirmar · Estado. Sorted by Grupo,
 *   Año and Integrantes (the three orders of the URL). No «Última reunión»
 *   until that figure exists (S7 / D1).
 * - Phone: a bleed list per sub-área with a sticky header; 64px rows with
 *   the name, the leaders, the flags (Sin líder, N por confirmar,
 *   Desactivado) and the members in mono.
 * Every row opens the group panel.
 */
import type { ReactElement, ReactNode } from 'react'

import { BadgeSistema } from '@/components/ui/sistema-diseno'
import { ListaResponsiva, type ColumnaLista } from '@/components/ui/lista-responsiva'
import type { GrupoGestion } from '@/lib/platform/estudiantes/grupos-datos'
import { horarioTexto, lideresTexto, miembrosDe, porConfirmarDe, type OrdenGrupos, type VistaGrupos } from '@/lib/platform/estudiantes/grupos-vista'

import { TablaDensa, type ColumnaDensa, type Densidad, type OrdenColumna } from '../alcance/tabla-densa'
import { SeccionMovil } from '../alcance/movil-alcance'

/** The columns «Columnas» can hide (Grupo is always on). */
export const COLUMNAS_GRUPOS = [
  { id: 'anio', etiqueta: 'Año o zona' },
  { id: 'lideres', etiqueta: 'Líderes' },
  { id: 'integrantes', etiqueta: 'Integrantes' },
  { id: 'confirmar', etiqueta: 'Por confirmar' },
  { id: 'estado', etiqueta: 'Estado' },
] as const

const Nada = (): ReactElement => <span className="text-muted-foreground">—</span>

function Lideres({ grupo }: { readonly grupo: GrupoGestion }): ReactElement {
  const texto = lideresTexto(grupo)
  if (!grupo.activo) return <span>Desactivado</span>
  return texto ? <span>{texto}</span> : <span className="font-semibold text-warning-text">Sin líder</span>
}

function PorConfirmar({ grupo }: { readonly grupo: GrupoGestion }): ReactElement {
  const n = porConfirmarDe(grupo).length
  return n > 0 ? (
    <BadgeSistema variante="info" tamaño="sm">
      {`${n} por confirmar`}
    </BadgeSistema>
  ) : (
    <Nada />
  )
}

function Estado({ grupo }: { readonly grupo: GrupoGestion }): ReactElement {
  if (!grupo.activo) return <BadgeSistema tamaño="sm">Desactivado</BadgeSistema>
  if (grupo.lideres.length === 0) {
    return (
      <BadgeSistema variante="warning" tamaño="sm">
        Sin líder
      </BadgeSistema>
    )
  }
  return <span className="text-muted-foreground">Activo</span>
}

export interface TablaGruposProps {
  readonly vista: VistaGrupos
  readonly ocultas: ReadonlySet<string>
  readonly densidad: Densidad
  readonly seleccionado: string | null
  readonly onOrdenar: (orden: OrdenGrupos) => void
  readonly onAbrir: (grupoId: string) => void
}

export function TablaGrupos({ vista, ocultas, densidad, seleccionado, onOrdenar, onAbrir }: TablaGruposProps): ReactElement {
  const orden = (o: OrdenGrupos, sentido: 'asc' | 'desc'): OrdenColumna => ({ activo: vista.filtros.orden === o, sentido, onOrdenar: () => onOrdenar(o) })
  const todas: readonly ColumnaDensa<GrupoGestion>[] = [
    {
      id: 'anio',
      titulo: vista.columnaAnio,
      orden: orden('anio', 'asc'),
      celda: (g) => {
        const horario = horarioTexto(g.diaSemana, g.hora)
        return (
          <>
            {g.anioEtiqueta ?? g.zona ?? '—'}
            {horario && <span className="text-muted-foreground"> · {horario}</span>}
          </>
        )
      },
    },
    { id: 'lideres', titulo: 'Líderes', celda: (g) => <Lideres grupo={g} /> },
    { id: 'integrantes', titulo: 'Integrantes', derecha: true, orden: orden('integrantes', 'desc'), clase: 'font-mono tabular-nums', celda: (g) => miembrosDe(g).length },
    { id: 'confirmar', titulo: 'Por confirmar', celda: (g) => <PorConfirmar grupo={g} /> },
    { id: 'estado', titulo: 'Estado', celda: (g) => <Estado grupo={g} /> },
  ]
  return (
    <TablaDensa
      etiqueta={vista.filtros.metrica === 'desactivados' ? 'Grupos desactivados' : 'Grupos'}
      describidaPor="grupos-pie"
      primera={{ titulo: 'Grupo', orden: orden('nombre', 'asc'), nombre: (g) => g.nombre }}
      columnas={todas.filter((c) => !ocultas.has(c.id))}
      secciones={vista.secciones.map((s) => ({ id: s.id, titulo: s.titulo, detalle: s.detalle, filas: s.grupos }))}
      claveFila={(g) => g.id}
      onAbrir={(g) => onAbrir(g.id)}
      etiquetaFila={(g) => `Abrir ${g.nombre}`}
      seleccionada={seleccionado}
      densidad={densidad}
      tonoFila={(g) => (g.activo ? undefined : 'apagada')}
    />
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

const COLUMNAS_MOVIL: readonly ColumnaLista[] = [{ id: 'grupo', titulo: 'Grupo' }]

export function ListaGruposMovil({ vista, onAbrir }: { readonly vista: VistaGrupos; readonly onAbrir: (grupoId: string) => void }): ReactElement {
  return (
    <div className="space-y-4">
      {vista.secciones.map((s, i) => {
        const integrantes = s.grupos.reduce((suma, g) => suma + miembrosDe(g).length, 0)
        return (
          <SeccionMovil
            key={s.id}
            id={`grupos-seccion-${i}`}
            titulo={s.titulo}
            detalle={
              <>
                <span className="font-mono tabular-nums">{s.grupos.length}</span> · <span className="font-mono tabular-nums">{integrantes}</span> integrantes
              </>
            }
          >
            <ListaResponsiva
              etiqueta={s.titulo}
              columnas={COLUMNAS_MOVIL}
              filas={s.grupos}
              claveFila={(g) => g.id}
              onAbrirFila={(g) => onAbrir(g.id)}
              etiquetaFila={(g) => `Abrir ${g.nombre}`}
              vacio={null}
              renderCelda={(g) => g.nombre}
              renderFilaMovil={(g) => {
                const miembros = miembrosDe(g).length
                const horario = horarioTexto(g.diaSemana, g.hora)
                return {
                  titulo: g.nombre,
                  subtitulo: (
                    <>
                      <Lideres grupo={g} />
                      {horario && ` · ${horario}`}
                    </>
                  ),
                  insignias: <Insignias grupo={g} />,
                  meta: (
                    <span className="font-mono text-sm tabular-nums text-muted-foreground" aria-label={`${miembros} integrantes`}>
                      {miembros}
                    </span>
                  ),
                }
              }}
            />
          </SeccionMovil>
        )
      })}
    </div>
  )
}
