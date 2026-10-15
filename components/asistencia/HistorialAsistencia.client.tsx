"use client"

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Eye, Edit, TrendingUp, Calendar, CalendarX, UserCheck, UserX } from 'lucide-react'
import { TarjetaSistema, BotonSistema } from '@/components/ui/sistema-diseno'
import { cn } from '@/lib/utils'
import GraficoTendencia from './GraficoTendencia.client'
import { FiltroFechasAsistencia } from './filtro-fechas-asistencia'
import { BarraAsistencia, EstadoVacioAsistencia, TarjetaKpiAsistencia, claseTextoAsistencia } from './partes-asistencia'

type KPIs = {
  asistencia_promedio: number
  total_reuniones: number
  miembro_mas_constante: {
    id: string | null
    nombre: string
    asistencias: number
  }
  miembro_mas_ausencias: {
    id: string | null
    nombre: string
    ausencias: number
  }
}

type SerieTemporal = {
  semana: string
  porcentaje: number
}

type EventoHistorial = {
  id: string
  fecha: string
  tema: string
  presentes: number
  total: number
  porcentaje: number
}

type ReporteAsistencia = {
  kpis: KPIs
  series_temporales: SerieTemporal[]
  eventos_historial: EventoHistorial[]
}

interface HistorialAsistenciaClientProps {
  grupoId: string
  reporte: ReporteAsistencia
  fechaInicio?: string
  fechaFin?: string
}

export default function HistorialAsistenciaClient({
  grupoId,
  reporte,
  fechaInicio,
  fechaFin
}: HistorialAsistenciaClientProps) {
  const router = useRouter()

  // Formatear fecha a dd-mm-aaaa
  const formatearFecha = (fecha: string) => {
    const fechaObj = new Date(fecha)
    const dia = String(fechaObj.getUTCDate()).padStart(2, '0')
    const mes = String(fechaObj.getUTCMonth() + 1).padStart(2, '0')
    const anio = fechaObj.getUTCFullYear()
    return `${dia}-${mes}-${anio}`
  }

  const aplicarFiltros = (fechaInicioLocal: string, fechaFinLocal: string) => {
    const params = new URLSearchParams()
    if (fechaInicioLocal) params.set('fecha_inicio', fechaInicioLocal)
    if (fechaFinLocal) params.set('fecha_fin', fechaFinLocal)

    router.push(`/grupos-vida/${grupoId}/asistencia/historial?${params.toString()}`)
  }

  const limpiarFiltros = () => {
    router.push(`/grupos-vida/${grupoId}/asistencia/historial`)
  }

  // Serie para gráfico: usar fechas reales de eventos registrados
  const serieEventos = (reporte.eventos_historial || [])
    .slice()
    .sort((a, b) => {
      const da = new Date(String(a.fecha)).getTime()
      const db = new Date(String(b.fecha)).getTime()
      return da - db
    })
    .map(ev => ({ semana: ev.fecha, porcentaje: ev.porcentaje }))

  return (
    <div className="space-y-6">
      <FiltroFechasAsistencia
        fechaInicio={fechaInicio}
        fechaFin={fechaFin}
        onAplicar={aplicarFiltros}
        onLimpiar={limpiarFiltros}
      />

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <TarjetaKpiAsistencia
          icono={TrendingUp}
          tono="marca"
          etiqueta="Asistencia Promedio"
          valor={`${reporte.kpis.asistencia_promedio}%`}
        />
        <TarjetaKpiAsistencia
          icono={Calendar}
          tono="info"
          etiqueta="Total de Reuniones"
          valor={reporte.kpis.total_reuniones}
        />
        <TarjetaKpiAsistencia
          icono={UserCheck}
          tono="exito"
          etiqueta="Más Constante"
          tipoValor="texto"
          valor={<span title={reporte.kpis.miembro_mas_constante.nombre}>{reporte.kpis.miembro_mas_constante.nombre}</span>}
          detalle={`${reporte.kpis.miembro_mas_constante.asistencias} asistencias`}
          href={`/grupos-vida/${grupoId}/asistencia/historial/mas-constantes`}
        />
        <TarjetaKpiAsistencia
          icono={UserX}
          tono="peligro"
          etiqueta="Más Ausencias"
          tipoValor="texto"
          valor={<span title={reporte.kpis.miembro_mas_ausencias.nombre}>{reporte.kpis.miembro_mas_ausencias.nombre}</span>}
          detalle={`${reporte.kpis.miembro_mas_ausencias.ausencias} ausencias`}
          href={`/grupos-vida/${grupoId}/asistencia/historial/mas-ausencias`}
        />
      </div>

      {/* Gráfico de Tendencia (fechas reales de eventos) */}
      <GraficoTendencia data={serieEventos} />

      {/* Lista de Eventos Históricos */}
      <section aria-labelledby="eventos-registrados-titulo" className="space-y-4">
        <h2 id="eventos-registrados-titulo" className="text-xl font-semibold text-foreground">
          Eventos Registrados
        </h2>

        <TarjetaSistema className="@container overflow-hidden p-0">
          {/* Header — solo cuando la lista es ancha */}
          <div className={cn(COLUMNAS_EVENTO, "hidden border-b border-border bg-muted/50 px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground @xl:grid")}>
            <span>Fecha</span>
            <span>Tema</span>
            <span className="text-center">Presentes</span>
            <span className="text-center">%</span>
            <span className="text-center">Acciones</span>
          </div>

          <ul className="divide-y divide-border">
            {reporte.eventos_historial.length > 0 ? (
              reporte.eventos_historial.map((evento) => (
                <li
                  key={evento.id}
                  className={cn(COLUMNAS_EVENTO, "px-4 py-3 transition-colors duration-200 hover:bg-muted/30 @xl:grid @xl:items-center")}
                >
                  {/* Angosto: fila compacta */}
                  <div className="flex items-start justify-between gap-3 @xl:hidden">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">
                        {evento.tema}
                      </p>
                      <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                        {formatearFecha(evento.fecha)}
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        <BarraAsistencia porcentaje={evento.porcentaje} className="flex-1" />
                        <span className="shrink-0 text-xs font-semibold tabular-nums text-foreground">
                          {evento.porcentaje}%
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {evento.presentes}/{evento.total} presentes
                      </p>
                    </div>
                    <AccionesEvento grupoId={grupoId} eventoId={evento.id} compactas />
                  </div>

                  {/* Ancho: columnas */}
                  <div className="hidden text-sm tabular-nums text-muted-foreground @xl:block">
                    {formatearFecha(evento.fecha)}
                  </div>
                  <div className="hidden truncate text-sm font-medium text-foreground @xl:block">
                    {evento.tema}
                  </div>
                  <div className="hidden text-center text-sm tabular-nums text-muted-foreground @xl:block">
                    {evento.presentes}/{evento.total}
                  </div>
                  <div className="hidden items-center justify-center @xl:flex">
                    <span className={cn("text-sm font-semibold tabular-nums", claseTextoAsistencia(evento.porcentaje))}>
                      {evento.porcentaje}%
                    </span>
                  </div>
                  <div className="hidden items-center justify-center @xl:flex">
                    <AccionesEvento grupoId={grupoId} eventoId={evento.id} />
                  </div>
                </li>
              ))
            ) : (
              <li>
                <EstadoVacioAsistencia
                  icono={CalendarX}
                  titulo="No hay eventos en este período"
                  descripcion="Ajusta los filtros de fecha o registra un nuevo evento."
                />
              </li>
            )}
          </ul>
        </TarjetaSistema>
      </section>
    </div>
  )
}

const COLUMNAS_EVENTO = "@xl:grid-cols-[7rem_minmax(0,1fr)_6rem_4rem_8.5rem] @xl:gap-3"

/** View and edit links of one event; icon-only when `compactas`. */
function AccionesEvento({ grupoId, eventoId, compactas = false }: { grupoId: string; eventoId: string; compactas?: boolean }) {
  const hrefVer = `/grupos-vida/${grupoId}/asistencia/${eventoId}`
  return (
    <div className="flex shrink-0 gap-1">
      {compactas ? (
        <BotonSistema asChild variante="outline" tamaño="sm" soloIcono icono={Eye} aria-label="Ver evento">
          <Link href={hrefVer} />
        </BotonSistema>
      ) : (
        <BotonSistema asChild variante="outline" tamaño="sm" icono={Eye}>
          <Link href={hrefVer} aria-label="Ver evento">Ver</Link>
        </BotonSistema>
      )}
      <BotonSistema asChild variante="ghost" tamaño="sm" soloIcono icono={Edit} aria-label="Editar evento">
        <Link href={`/grupos-vida/${grupoId}/asistencia/editar/${eventoId}`} />
      </BotonSistema>
    </div>
  )
}
