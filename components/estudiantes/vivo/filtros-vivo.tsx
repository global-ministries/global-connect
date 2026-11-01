'use client'

/**
 * Estudiantes › En vivo — the filters sheet (artboards 03 / 04, `#filtros`):
 * the canonical `HojaFiltros` with Estado del grupo (Todos / Sin marcar /
 * Faltan / Completo, with counts; single choice) and Ordenar por. Filters
 * apply live; "Limpiar" resets both, "Ver N grupos" only closes.
 */
import type { ReactElement } from 'react'

import { GrupoFiltro, HojaFiltros } from '@/components/ui/hoja-filtros'
import { GrupoPastillas, PastillaFiltro } from '@/components/ui/PastillasFiltro'
import {
  ESTADOS_FILTRO,
  ETIQUETA_ESTADO_FILTRO,
  ETIQUETA_ORDEN_VIVO,
  LIMPIAR_HOJA_VIVO,
  ORDENES_VIVO,
  type FiltrosVivo,
  type VistaVivo,
} from '@/lib/platform/estudiantes/vivo-vista'

export interface HojaFiltrosVivoProps {
  readonly vista: VistaVivo
  readonly abierta: boolean
  readonly onCambioAbierta: (abierta: boolean) => void
  readonly onCambio: (parche: Partial<FiltrosVivo>) => void
}

export function HojaFiltrosVivo({ vista, abierta, onCambioAbierta, onCambio }: HojaFiltrosVivoProps): ReactElement {
  const { filtros, cuentasEstado } = vista
  return (
    <HojaFiltros
      abierta={abierta}
      onCambioAbierta={onCambioAbierta}
      resultados={vista.visibles.length}
      unidad={{ singular: 'grupo', plural: 'grupos' }}
      onLimpiar={() => onCambio(LIMPIAR_HOJA_VIVO)}
    >
      <GrupoFiltro titulo="Estado del grupo">
        <GrupoPastillas etiqueta="Filtrar por estado del grupo">
          {ESTADOS_FILTRO.map((estado) => (
            <PastillaFiltro
              key={estado}
              etiqueta={ETIQUETA_ESTADO_FILTRO[estado]}
              cantidad={cuentasEstado[estado]}
              activa={filtros.estado === estado}
              onClick={() => onCambio({ estado })}
            />
          ))}
        </GrupoPastillas>
      </GrupoFiltro>

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
