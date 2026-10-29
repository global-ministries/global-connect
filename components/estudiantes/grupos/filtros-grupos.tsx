'use client'

/**
 * Estudiantes › Grupos — the filters sheet (artboards 06 / 07, `#filtros`):
 * the canonical `HojaFiltros` with Año escolar (Transit / Inside Out only,
 * with the active groups per año; single choice, a second tap clears) and
 * Ordenar por. Filters apply live; "Limpiar" empties them, "Ver N grupos"
 * only closes.
 */
import type { ReactElement } from 'react'

import { GrupoFiltro, HojaFiltros } from '@/components/ui/hoja-filtros'
import { GrupoPastillas, PastillaFiltro } from '@/components/ui/PastillasFiltro'
import {
  ETIQUETA_ORDEN,
  LIMPIAR_HOJA,
  ORDENES,
  type FiltrosGrupos,
  type VistaGrupos,
} from '@/lib/platform/estudiantes/grupos-vista'

export interface HojaFiltrosGruposProps {
  readonly vista: VistaGrupos
  readonly abierta: boolean
  readonly onCambioAbierta: (abierta: boolean) => void
  readonly onCambio: (parche: Partial<FiltrosGrupos>) => void
}

export function HojaFiltrosGrupos({ vista, abierta, onCambioAbierta, onCambio }: HojaFiltrosGruposProps): ReactElement {
  const { filtros, anios } = vista
  const total = anios.reduce((suma, anio) => suma + anio.cantidad, 0)
  return (
    <HojaFiltros
      abierta={abierta}
      onCambioAbierta={onCambioAbierta}
      resultados={vista.visibles.length}
      unidad={{ singular: 'grupo', plural: 'grupos' }}
      onLimpiar={() => onCambio(LIMPIAR_HOJA)}
    >
      {anios.length > 0 && (
        <GrupoFiltro titulo="Año escolar">
          <GrupoPastillas etiqueta="Filtrar por año escolar">
            <PastillaFiltro etiqueta="Todos" cantidad={total} activa={filtros.anio === null} onClick={() => onCambio({ anio: null })} />
            {anios.map((anio) => {
              const activa = filtros.anio === anio.numero
              return (
                <PastillaFiltro
                  key={anio.numero}
                  etiqueta={anio.etiqueta}
                  cantidad={anio.cantidad}
                  activa={activa}
                  // A second tap on the active año removes the filter.
                  onClick={() => onCambio({ anio: activa ? null : anio.numero })}
                />
              )
            })}
          </GrupoPastillas>
        </GrupoFiltro>
      )}

      <GrupoFiltro titulo="Ordenar por">
        <GrupoPastillas etiqueta="Ordenar la lista">
          {ORDENES.map((orden) => (
            <PastillaFiltro key={orden} etiqueta={ETIQUETA_ORDEN[orden]} activa={filtros.orden === orden} onClick={() => onCambio({ orden })} />
          ))}
        </GrupoPastillas>
      </GrupoFiltro>
    </HojaFiltros>
  )
}
