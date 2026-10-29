'use client'

/**
 * Mi equipo — the filters sheet (docs/design-system/patterns.md#toolbar-and-filters-sheet;
 * S11 decision 5): the canonical `HojaFiltros` (side panel from md, bottom
 * sheet below) with Etapa (the pills Mi equipo always had: "Todos", the
 * always-offered etapas and those with servicios; a second tap clears),
 * Atención (Por activar, Sin cuenta, Sin turno, independent toggles counting
 * people), Edad (the age pills, only when someone in scope has a known range),
 * the Turno select (the shifts of the campus selected in the app) and Vista
 * (the toolbar's segmented control, for phones). Filters apply live;
 * "Limpiar" empties them and "Ver N" only closes.
 */
import type { ReactElement } from 'react'

import { GrupoFiltro, HojaFiltros, SelectsFiltro } from '@/components/ui/hoja-filtros'
import { GrupoPastillas, PastillaFiltro } from '@/components/ui/PastillasFiltro'
import { ESTADO_LABELS } from '@/components/dream-team/labels'
import { ContadoresEdad } from '@/components/dream-team/contadores-edad'
import { SelectorTurno } from '@/components/dream-team/turnos/selector-turno'
import {
  LIMPIAR_FILTROS_MI_EQUIPO,
  parcheAtencionMiEquipo,
  type FiltrosMiEquipo,
  type MetricaMiEquipoId,
  type PastillaEtapa,
  type VistaListaMiEquipo,
  type VistaMiEquipo,
} from '@/lib/platform/dream-team/mi-equipo-filtros'

export const OPCIONES_VISTA_MI_EQUIPO: ReadonlyArray<{ readonly valor: VistaListaMiEquipo; readonly etiqueta: string }> = [
  { valor: 'persona', etiqueta: 'Por persona' },
  { valor: 'servicio', etiqueta: 'Por servicio' },
]

const ATENCION: ReadonlyArray<{ readonly id: Exclude<MetricaMiEquipoId, 'sirviendo'>; readonly etiqueta: string }> = [
  { id: 'porActivar', etiqueta: 'Por activar' },
  { id: 'sinCuenta', etiqueta: 'Sin cuenta' },
  { id: 'sinTurno', etiqueta: 'Sin turno' },
]

function etiquetaEtapa(pastilla: PastillaEtapa): string {
  if (pastilla.valor === 'todos') return 'Todos'
  return pastilla.valor === 'activo' ? 'Activos' : ESTADO_LABELS[pastilla.valor]
}

export interface HojaFiltrosMiEquipoProps {
  readonly vista: VistaMiEquipo
  /** The shifts of the campus selected in the app. */
  readonly turnos: readonly { readonly id: string; readonly label: string }[]
  readonly abierta: boolean
  readonly onCambioAbierta: (abierta: boolean) => void
  readonly onCambio: (parche: Partial<FiltrosMiEquipo>) => void
}

export function HojaFiltrosMiEquipo({ vista, turnos, abierta, onCambioAbierta, onCambio }: HojaFiltrosMiEquipoProps): ReactElement {
  const { filtros, atencion } = vista
  const porPersona = filtros.vista === 'persona'

  return (
    <HojaFiltros
      abierta={abierta}
      onCambioAbierta={onCambioAbierta}
      resultados={porPersona ? vista.personas.length : vista.servicios.length}
      unidad={porPersona ? { singular: 'persona', plural: 'personas' } : { singular: 'servicio', plural: 'servicios' }}
      onLimpiar={() => onCambio(LIMPIAR_FILTROS_MI_EQUIPO)}
    >
      <GrupoFiltro titulo="Etapa">
        <GrupoPastillas etiqueta="Filtrar por etapa">
          {vista.pastillasEtapa.map((pastilla) => {
            const valor = pastilla.valor === 'todos' ? null : pastilla.valor
            const activa = filtros.etapa === valor
            return (
              <PastillaFiltro
                key={pastilla.valor}
                etiqueta={etiquetaEtapa(pastilla)}
                cantidad={pastilla.cantidad}
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
              onClick={() => onCambio(parcheAtencionMiEquipo(filtros, id))}
            />
          ))}
        </GrupoPastillas>
      </GrupoFiltro>

      {vista.contadoresEdad && (
        <GrupoFiltro titulo="Edad">
          <ContadoresEdad contadores={vista.contadoresEdad} edad={filtros.edad} onEdadChange={(edad) => onCambio({ edad })} />
        </GrupoFiltro>
      )}

      {turnos.length > 0 && (
        <SelectsFiltro>
          <SelectorTurno turnos={turnos} valor={filtros.turno} onCambio={(turno) => onCambio({ turno })} />
        </SelectsFiltro>
      )}

      <GrupoFiltro titulo="Vista">
        <GrupoPastillas etiqueta="Vista de la lista">
          {OPCIONES_VISTA_MI_EQUIPO.map((opcion) => (
            <PastillaFiltro
              key={opcion.valor}
              etiqueta={opcion.etiqueta}
              activa={filtros.vista === opcion.valor}
              onClick={() => onCambio({ vista: opcion.valor })}
            />
          ))}
        </GrupoPastillas>
      </GrupoFiltro>
    </HojaFiltros>
  )
}
