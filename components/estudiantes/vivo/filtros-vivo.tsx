'use client'

/**
 * Estudiantes › En vivo — the phone filters sheet (artboard 05 of
 * design/estudiantes-dps, `#filtros`; B27): the canonical `HojaFiltros` with
 * Ámbito (only with more than one), Área (Todas and each sub-área, only with
 * more than one) and Ordenar por. Estado del grupo lives in the toolbar and
 * «Grupos sin marcar» in its metric (S6). Filters apply live; "Limpiar"
 * resets Área and Ordenar por, "Ver N grupos" only closes.
 */
import type { ReactElement } from 'react'

import { GrupoFiltro, HojaFiltros } from '@/components/ui/hoja-filtros'
import { GrupoPastillas, PastillaFiltro } from '@/components/ui/PastillasFiltro'
import { ETIQUETA_ORDEN_VIVO, LIMPIAR_HOJA_VIVO, ORDENES_VIVO, type FiltrosVivo, type OpcionSelector, type VistaVivo } from '@/lib/platform/estudiantes/vivo-vista'

export interface HojaFiltrosVivoProps {
  readonly vista: VistaVivo
  readonly ambitos: readonly OpcionSelector[]
  readonly ambito: string
  readonly onAmbito: (valor: string) => void
  readonly abierta: boolean
  readonly onCambioAbierta: (abierta: boolean) => void
  readonly onCambio: (parche: Partial<FiltrosVivo>) => void
}

export function HojaFiltrosVivo({ vista, ambitos, ambito, onAmbito, abierta, onCambioAbierta, onCambio }: HojaFiltrosVivoProps): ReactElement {
  const { filtros } = vista
  return (
    <HojaFiltros
      abierta={abierta}
      onCambioAbierta={onCambioAbierta}
      resultados={vista.visibles.length}
      unidad={{ singular: 'grupo', plural: 'grupos' }}
      onLimpiar={() => onCambio(LIMPIAR_HOJA_VIVO)}
    >
      {ambitos.length > 1 && (
        <GrupoFiltro titulo="Ámbito">
          <GrupoPastillas etiqueta="Ámbito">
            {ambitos.map((a) => (
              <PastillaFiltro key={a.valor} etiqueta={a.etiqueta} activa={a.valor === ambito} onClick={() => a.valor !== ambito && onAmbito(a.valor)} />
            ))}
          </GrupoPastillas>
        </GrupoFiltro>
      )}

      {vista.subareas.length > 1 && (
        <GrupoFiltro titulo="Área">
          <GrupoPastillas etiqueta="Área">
            <PastillaFiltro etiqueta="Todas" activa={filtros.area === null} onClick={() => onCambio({ area: null })} />
            {vista.subareas.map((area) => (
              <PastillaFiltro key={area} etiqueta={area} activa={filtros.area === area} onClick={() => onCambio({ area })} />
            ))}
          </GrupoPastillas>
        </GrupoFiltro>
      )}

      <GrupoFiltro titulo="Ordenar por">
        <GrupoPastillas etiqueta="Ordenar la lista">
          {ORDENES_VIVO.map((orden) => (
            <PastillaFiltro key={orden} etiqueta={ETIQUETA_ORDEN_VIVO[orden]} activa={filtros.orden === orden} onClick={() => onCambio({ orden })} />
          ))}
        </GrupoPastillas>
      </GrupoFiltro>
    </HojaFiltros>
  )
}
