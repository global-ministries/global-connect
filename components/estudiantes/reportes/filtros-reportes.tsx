'use client'

/**
 * Estudiantes › Reportes — the filters sheet (`HojaFiltros`, artboards 11 /
 * 12 `#filtros`): Rango de fechas (the quick ranges plus Desde / Hasta, gap
 * GR3 `FiltroRangoFechas` under "Planned components" in
 * docs/design-system/components.md), Sub-área (only when the caller sees
 * more than one) and Ordenar grupos / personas por (The Living Room adds
 * Menos 1:1 · Servicio más bajo · Menos talleres, A39). Filters apply live; "Ver
 * N" only closes. The range and the sub-área reload the page data; a custom
 * range applies once both dates are valid, otherwise the sheet says why.
 */
import { useState, type ReactElement } from 'react'

import { CamposSistema, InputSistema } from '@/components/ui/sistema-diseno'
import { GrupoFiltro, HojaFiltros } from '@/components/ui/hoja-filtros'
import { GrupoPastillas, PastillaFiltro } from '@/components/ui/PastillasFiltro'
import {
  ORDENES_CONEXIONES,
  ORDENES_GRUPOS,
  ORDENES_PERSONAS,
  rangosReportes,
  validarRango,
  type FiltrosReportes,
  type OrdenGruposReporte,
  type OrdenPersonasReporte,
  type RangoReporte,
  type SubareaReporte,
} from '@/lib/platform/estudiantes/reportes'

export interface HojaFiltrosReportesProps {
  readonly abierta: boolean
  readonly onCambioAbierta: (abierta: boolean) => void
  readonly hoy: string
  readonly rango: RangoReporte
  readonly onRango: (rango: RangoReporte) => void
  /** The sub-áreas the caller sees in this ámbito; the filter shows with more than one. */
  readonly subareas: readonly SubareaReporte[]
  readonly subareaId: string | null
  readonly onSubarea: (subareaId: string | null) => void
  readonly filtros: FiltrosReportes
  readonly onFiltros: (parche: Partial<FiltrosReportes>) => void
  readonly resultados: number
  readonly onLimpiar: () => void
  /** The Living Room with its connections loaded (S21). */
  readonly conConexiones?: boolean
}

function FechasPropias({ hoy, rango, onRango }: Pick<HojaFiltrosReportesProps, 'hoy' | 'rango' | 'onRango'>): ReactElement {
  const [desde, setDesde] = useState(rango.desde)
  const [hasta, setHasta] = useState(rango.hasta)
  const error = validarRango(desde, hasta, hoy)

  function cambiar(siguienteDesde: string, siguienteHasta: string): void {
    setDesde(siguienteDesde)
    setHasta(siguienteHasta)
    if (validarRango(siguienteDesde, siguienteHasta, hoy) === null && (siguienteDesde !== rango.desde || siguienteHasta !== rango.hasta)) {
      onRango({ clave: 'fechas', desde: siguienteDesde, hasta: siguienteHasta })
    }
  }

  return (
    <div className="grid gap-2">
      <CamposSistema className="gap-3 sm:grid-cols-2">
        <InputSistema
          id="reportes-desde"
          type="date"
          label="Desde"
          value={desde}
          max={hoy}
          aria-invalid={error !== null || undefined}
          aria-describedby="reportes-rango-nota"
          onChange={(e) => cambiar(e.target.value, hasta)}
        />
        <InputSistema id="reportes-hasta" type="date" label="Hasta" value={hasta} max={hoy} aria-describedby="reportes-rango-nota" onChange={(e) => cambiar(desde, e.target.value)} />
      </CamposSistema>
      <p id="reportes-rango-nota" className={error ? 'text-sm text-warning-text' : 'text-sm text-muted-foreground'}>
        {error ?? 'La tendencia compara con el período anterior del mismo largo.'}
      </p>
    </div>
  )
}

export function HojaFiltrosReportes({
  abierta,
  onCambioAbierta,
  hoy,
  rango,
  onRango,
  subareas,
  subareaId,
  onSubarea,
  filtros,
  onFiltros,
  resultados,
  onLimpiar,
  conConexiones = false,
}: HojaFiltrosReportesProps): ReactElement {
  const grupos = filtros.tab === 'grupos'
  const totalGrupos = subareas.reduce((suma, s) => suma + s.grupos, 0)
  return (
    <HojaFiltros
      abierta={abierta}
      onCambioAbierta={onCambioAbierta}
      resultados={resultados}
      unidad={grupos ? { singular: 'grupo', plural: 'grupos' } : { singular: 'persona', plural: 'personas' }}
      onLimpiar={onLimpiar}
    >
      <GrupoFiltro titulo="Rango de fechas">
        <GrupoPastillas etiqueta="Rango de fechas">
          {rangosReportes(hoy).map((r) => (
            <PastillaFiltro key={r.clave} etiqueta={r.etiqueta} activa={rango.clave === r.clave} onClick={() => onRango({ clave: r.clave, desde: r.desde, hasta: r.hasta })} />
          ))}
        </GrupoPastillas>
        {/* A new range from outside (a pill, a chip) starts the fields again. */}
        <FechasPropias key={`${rango.desde}|${rango.hasta}`} hoy={hoy} rango={rango} onRango={onRango} />
      </GrupoFiltro>

      {subareas.length > 1 && (
        <GrupoFiltro titulo="Sub-área">
          <GrupoPastillas etiqueta="Sub-área">
            <PastillaFiltro etiqueta="Todas" cantidad={totalGrupos} activa={subareaId === null} onClick={() => onSubarea(null)} />
            {subareas.map((s) => (
              <PastillaFiltro key={s.subareaId} etiqueta={s.label} cantidad={s.grupos} activa={subareaId === s.subareaId} onClick={() => onSubarea(s.subareaId)} />
            ))}
          </GrupoPastillas>
        </GrupoFiltro>
      )}

      <GrupoFiltro titulo={grupos ? 'Ordenar grupos por' : 'Ordenar personas por'}>
        <GrupoPastillas etiqueta={grupos ? 'Ordenar grupos por' : 'Ordenar personas por'}>
          {grupos
            ? ORDENES_GRUPOS.map((o) => (
                <PastillaFiltro key={o.id} etiqueta={o.etiqueta} activa={filtros.ordenGrupos === o.id} onClick={() => onFiltros({ ordenGrupos: o.id as OrdenGruposReporte })} />
              ))
            : [...ORDENES_PERSONAS, ...(conConexiones ? ORDENES_CONEXIONES : [])].map((o) => (
                <PastillaFiltro key={o.id} etiqueta={o.etiqueta} activa={filtros.ordenPersonas === o.id} onClick={() => onFiltros({ ordenPersonas: o.id as OrdenPersonasReporte })} />
              ))}
        </GrupoPastillas>
      </GrupoFiltro>
    </HojaFiltros>
  )
}
