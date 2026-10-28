'use client'

/**
 * Servidores — the filters sheet (docs/design-system/patterns.md#toolbar-and-filters-sheet):
 * the canonical `HojaFiltros` (side panel from md, bottom sheet below) with
 * Etapa (the six etapas with their counts, single choice, a second tap
 * clears), Atención (Sin cuenta, Sin turno, Por activar, En varios equipos,
 * independent toggles counting people), the Rol / Turno / Inicio selects,
 * Ordenar por (a second tap flips the direction) and Vista. Filters apply
 * live; "Limpiar" empties exactly these filters and "Ver N" only closes.
 */
import type { ReactElement } from 'react'

import { GrupoFiltro, HojaFiltros, SelectsFiltro } from '@/components/ui/hoja-filtros'
import { GrupoPastillas, PastillaFiltro } from '@/components/ui/PastillasFiltro'
import { SelectSistema } from '@/components/ui/sistema-diseno'
import { ESTADO_LABELS } from '@/components/dream-team/labels'
import { SelectorTurno } from '@/components/dream-team/turnos/selector-turno'
import { DREAM_TEAM_ESTADOS, type DreamTeamEstado } from '@/lib/platform/dream-team/types'
import {
  COLUMNAS_ORDEN,
  ETIQUETA_COLUMNA,
  LIMPIAR_HOJA,
  parcheAtencion,
  type Agrupar,
  type ColumnaOrden,
  type FiltrosServidores,
  type Inicio,
  type MetricaAtencionId,
  type VistaServidores,
} from '@/lib/platform/dream-team/servidores-vista'

const TODOS = ''

export const OPCIONES_INICIO: ReadonlyArray<{ readonly valor: Inicio; readonly etiqueta: string }> = [
  { valor: 'cualquiera', etiqueta: 'Cualquier fecha' },
  { valor: 'mes', etiqueta: 'Este mes' },
  { valor: 'trimestre', etiqueta: 'Últimos 3 meses' },
]

/** "Por persona" (the default) or "Por servicio" (`ninguno` in the URL). */
export const OPCIONES_VISTA: ReadonlyArray<{ readonly valor: Agrupar; readonly etiqueta: string }> = [
  { valor: 'persona', etiqueta: 'Por persona' },
  { valor: 'ninguno', etiqueta: 'Por servicio' },
]

const ATENCION: ReadonlyArray<{ readonly id: MetricaAtencionId; readonly etiqueta: string }> = [
  { id: 'sinCuenta', etiqueta: 'Sin cuenta' },
  { id: 'sinTurno', etiqueta: 'Sin turno' },
  { id: 'porActivar', etiqueta: 'Por activar' },
  { id: 'varios', etiqueta: 'En varios equipos' },
]

export interface HojaFiltrosServidoresProps {
  readonly vista: VistaServidores
  readonly abierta: boolean
  readonly onCambioAbierta: (abierta: boolean) => void
  readonly onCambio: (parche: Partial<FiltrosServidores>) => void
  readonly onOrdenar: (columna: ColumnaOrden) => void
}

export function HojaFiltrosServidores({ vista, abierta, onCambioAbierta, onCambio, onOrdenar }: HojaFiltrosServidoresProps): ReactElement {
  const { filtros, opciones, contadoresEtapa, atencion } = vista
  const porPersona = filtros.agrupar === 'persona'
  const resultados = porPersona ? vista.items.length : vista.visibles.length
  const etapas: ReadonlyArray<{ readonly valor: DreamTeamEstado | null; readonly etiqueta: string; readonly cantidad: number }> = [
    { valor: null, etiqueta: 'Todas', cantidad: contadoresEtapa.todas },
    ...DREAM_TEAM_ESTADOS.map((estado) => ({ valor: estado, etiqueta: ESTADO_LABELS[estado], cantidad: contadoresEtapa.porEtapa[estado] })),
  ]

  return (
    <HojaFiltros
      abierta={abierta}
      onCambioAbierta={onCambioAbierta}
      resultados={resultados}
      unidad={porPersona ? { singular: 'persona', plural: 'personas' } : { singular: 'servicio', plural: 'servicios' }}
      onLimpiar={() => onCambio(LIMPIAR_HOJA)}
    >
      <GrupoFiltro titulo="Etapa">
        <GrupoPastillas etiqueta="Filtrar por etapa">
          {etapas.map(({ valor, etiqueta, cantidad }) => {
            const activa = filtros.etapa === valor
            return (
              <PastillaFiltro
                key={valor ?? 'todas'}
                etiqueta={etiqueta}
                cantidad={cantidad}
                activa={activa}
                // A second tap on the active etapa removes the filter.
                onClick={() => onCambio({ etapa: activa ? null : valor })}
              />
            )
          })}
        </GrupoPastillas>
      </GrupoFiltro>

      <GrupoFiltro titulo="Atención">
        <GrupoPastillas etiqueta="Filtrar por atención">
          {ATENCION.map(({ id, etiqueta }) => (
            <PastillaFiltro
              key={id}
              etiqueta={etiqueta}
              cantidad={atencion[id].personas}
              activa={atencion[id].activo}
              onClick={() => onCambio(parcheAtencion(filtros, id))}
            />
          ))}
        </GrupoPastillas>
      </GrupoFiltro>

      <SelectsFiltro>
        <SelectSistema
          label="Rol"
          opciones={[{ valor: TODOS, etiqueta: 'Todos' }, ...opciones.roles.map((r) => ({ valor: r.id, etiqueta: r.label }))]}
          value={filtros.rol ?? TODOS}
          onValueChange={(valor) => onCambio({ rol: valor === TODOS ? null : valor })}
        />
        <SelectorTurno turnos={opciones.turnos} valor={filtros.turno} onCambio={(turno) => onCambio({ turno })} />
        <SelectSistema
          label="Inicio"
          opciones={OPCIONES_INICIO.map((o) => ({ valor: o.valor, etiqueta: o.etiqueta }))}
          value={filtros.inicio}
          onValueChange={(valor) => onCambio({ inicio: valor as Inicio })}
        />
      </SelectsFiltro>

      <GrupoFiltro titulo="Ordenar por">
        <GrupoPastillas etiqueta="Ordenar la lista">
          {COLUMNAS_ORDEN.map((columna) => {
            const activa = filtros.orden.columna === columna
            const flecha = activa ? (filtros.orden.sentido === 'asc' ? ' ↑' : ' ↓') : ''
            return (
              <PastillaFiltro
                key={columna}
                etiqueta={`${ETIQUETA_COLUMNA[columna]}${flecha}`}
                activa={activa}
                onClick={() => onOrdenar(columna)}
              />
            )
          })}
        </GrupoPastillas>
      </GrupoFiltro>

      <GrupoFiltro titulo="Vista">
        <GrupoPastillas etiqueta="Vista de la lista">
          {OPCIONES_VISTA.map((opcion) => (
            <PastillaFiltro
              key={opcion.valor}
              etiqueta={opcion.etiqueta}
              activa={filtros.agrupar === opcion.valor}
              onClick={() => onCambio({ agrupar: opcion.valor })}
            />
          ))}
        </GrupoPastillas>
      </GrupoFiltro>
    </HojaFiltros>
  )
}
