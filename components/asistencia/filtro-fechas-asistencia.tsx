"use client"

import { useId, useState } from "react"
import { ChevronDown, Filter } from "lucide-react"
import { BotonSistema, InputSistema, PieAccionesSistema, TarjetaSistema } from "@/components/ui/sistema-diseno"
import { cn } from "@/lib/utils"

interface FiltroFechasAsistenciaProps {
  fechaInicio?: string
  fechaFin?: string
  /** Receives the dates as typed (`""` when empty). */
  onAplicar: (fechaInicio: string, fechaFin: string) => void
  onLimpiar: () => void
}

/**
 * Collapsible date-range filter of the attendance reports. Closed by default;
 * the toggle reports its state (`aria-expanded`) and the actions sit in the
 * system action footer (clear first, apply last).
 */
export function FiltroFechasAsistencia({ fechaInicio, fechaFin, onAplicar, onLimpiar }: FiltroFechasAsistenciaProps) {
  const idPanel = useId()
  const [mostrarFiltros, setMostrarFiltros] = useState(false)
  const [fechaInicioLocal, setFechaInicioLocal] = useState(fechaInicio || '')
  const [fechaFinLocal, setFechaFinLocal] = useState(fechaFin || '')

  const limpiar = () => {
    setFechaInicioLocal('')
    setFechaFinLocal('')
    onLimpiar()
  }

  return (
    <TarjetaSistema className="@container p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Filter className="size-5 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-foreground">Filtros</h2>
        </div>
        <BotonSistema
          variante="ghost"
          tamaño="sm"
          aria-expanded={mostrarFiltros}
          aria-controls={mostrarFiltros ? idPanel : undefined}
          onClick={() => setMostrarFiltros(!mostrarFiltros)}
        >
          {mostrarFiltros ? 'Ocultar' : 'Mostrar'}
          <ChevronDown
            className={cn("size-4 transition-transform duration-200 ease-out", mostrarFiltros && "rotate-180")}
            aria-hidden="true"
          />
        </BotonSistema>
      </div>

      {mostrarFiltros && (
        <div id={idPanel} className="mt-4 space-y-4">
          <div className="grid gap-4 @lg:grid-cols-2">
            <InputSistema
              label="Fecha Inicio"
              type="date"
              value={fechaInicioLocal}
              onChange={(e) => setFechaInicioLocal(e.target.value)}
            />
            <InputSistema
              label="Fecha Fin"
              type="date"
              value={fechaFinLocal}
              onChange={(e) => setFechaFinLocal(e.target.value)}
            />
          </div>
          <PieAccionesSistema fijo={false} className="bg-transparent">
            <BotonSistema variante="outline" onClick={limpiar}>
              Limpiar
            </BotonSistema>
            <BotonSistema variante="primario" onClick={() => onAplicar(fechaInicioLocal, fechaFinLocal)}>
              Aplicar Filtros
            </BotonSistema>
          </PieAccionesSistema>
        </div>
      )}
    </TarjetaSistema>
  )
}
