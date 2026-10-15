"use client"

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { TrendingUp, Users, Calendar, CalendarX, Clock, Eye } from 'lucide-react'
import { TarjetaSistema, BotonSistema, BadgeSistema } from '@/components/ui/sistema-diseno'
import { cn } from '@/lib/utils'
import GraficoAsistenciaUsuario from './GraficoAsistenciaUsuario.client'
import { FiltroFechasAsistencia } from './filtro-fechas-asistencia'
import { CLASE_ENLACE_ASISTENCIA, EstadoVacioAsistencia, TarjetaKpiAsistencia } from './partes-asistencia'

type KPIs = {
  porcentaje_asistencia_general: number
  total_grupos_activos: number
  grupo_mas_frecuente: {
    id: string | null
    nombre: string
  }
  ultima_asistencia_fecha: string | null
}

type SerieTemporal = {
  mes: string
  porcentaje_asistencia: number
}

type EventoHistorial = {
  fecha: string
  grupo_nombre: string
  grupo_id: string
  tema: string
  estado: 'Presente' | 'Ausente'
  motivo_ausencia?: string | null
}

type ReporteAsistenciaUsuario = {
  kpis: KPIs
  series_temporales: SerieTemporal[]
  historial_eventos: EventoHistorial[]
}

interface ReporteAsistenciaUsuarioClientProps {
  usuarioId: string
  reporte: ReporteAsistenciaUsuario
  fechaInicio?: string
  fechaFin?: string
}

export default function ReporteAsistenciaUsuarioClient({
  usuarioId,
  reporte,
  fechaInicio,
  fechaFin
}: ReporteAsistenciaUsuarioClientProps) {
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

    router.push(`/users/${usuarioId}/asistencia?${params.toString()}`)
  }

  const limpiarFiltros = () => {
    router.push(`/users/${usuarioId}/asistencia`)
  }

  const grupoMasFrecuente = reporte.kpis.grupo_mas_frecuente
  const claseCelda = "px-3 py-3 sm:px-4"
  const claseEncabezado = "px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground sm:px-4"

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
          etiqueta="Asistencia General"
          valor={`${reporte.kpis.porcentaje_asistencia_general}%`}
        />
        <TarjetaKpiAsistencia
          icono={Users}
          tono="info"
          etiqueta="Grupos Activos"
          valor={reporte.kpis.total_grupos_activos}
        />
        <TarjetaKpiAsistencia
          icono={Calendar}
          tono="exito"
          etiqueta="Grupo Más Frecuente"
          tipoValor="texto"
          valor={grupoMasFrecuente.id ? (
            <Link
              href={`/grupos-vida/${grupoMasFrecuente.id}`}
              className={CLASE_ENLACE_ASISTENCIA}
              title={grupoMasFrecuente.nombre}
            >
              {grupoMasFrecuente.nombre}
            </Link>
          ) : (
            grupoMasFrecuente.nombre
          )}
        />
        <TarjetaKpiAsistencia
          icono={Clock}
          tono="neutro"
          etiqueta="Última Asistencia"
          tipoValor="texto"
          valor={reporte.kpis.ultima_asistencia_fecha
            ? formatearFecha(reporte.kpis.ultima_asistencia_fecha)
            : 'N/D'
          }
        />
      </div>

      {/* Gráfico de Tendencia */}
      <GraficoAsistenciaUsuario data={reporte.series_temporales} />

      {/* Historial de Eventos */}
      <section aria-labelledby="historial-eventos-titulo" className="space-y-4">
        <h2 id="historial-eventos-titulo" className="text-xl font-semibold text-foreground">
          Historial de Eventos
        </h2>

        <TarjetaSistema className="@container overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full divide-y divide-border">
              <thead className="bg-muted/50">
                <tr>
                  <th scope="col" className={claseEncabezado}>Fecha</th>
                  <th scope="col" className={claseEncabezado}>Grupo</th>
                  <th scope="col" className={cn(claseEncabezado, "hidden @3xl:table-cell")}>Tema</th>
                  <th scope="col" className={claseEncabezado}>Estado</th>
                  <th scope="col" className={cn(claseEncabezado, "hidden text-right @3xl:table-cell")}>Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {reporte.historial_eventos.length > 0 ? (
                  reporte.historial_eventos.map((evento, index) => (
                    <tr key={index} className="transition-colors duration-200 hover:bg-muted/30">
                      <td className={cn(claseCelda, "whitespace-nowrap text-sm tabular-nums text-foreground")}>
                        {formatearFecha(evento.fecha)}
                      </td>
                      <td className={cn(claseCelda, "text-sm")}>
                        <Link
                          href={`/grupos-vida/${evento.grupo_id}`}
                          className={CLASE_ENLACE_ASISTENCIA}
                        >
                          {evento.grupo_nombre}
                        </Link>
                      </td>
                      <td className={cn(claseCelda, "hidden text-sm text-muted-foreground @3xl:table-cell")}>
                        {evento.tema}
                      </td>
                      <td className={cn(claseCelda, "whitespace-nowrap")}>
                        <BadgeSistema
                          variante={evento.estado === 'Presente' ? 'success' : 'error'}
                          tamaño="sm"
                        >
                          {evento.estado}
                        </BadgeSistema>
                      </td>
                      <td className={cn(claseCelda, "hidden whitespace-nowrap text-right @3xl:table-cell")}>
                        <BotonSistema asChild variante="ghost" tamaño="sm" icono={Eye}>
                          <Link href={`/grupos-vida/${evento.grupo_id}/asistencia/historial`}>
                            Ver grupo
                          </Link>
                        </BotonSistema>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5}>
                      <EstadoVacioAsistencia
                        icono={CalendarX}
                        titulo="No hay eventos en este período"
                        descripcion="Ajusta los filtros de fecha para ver más eventos."
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TarjetaSistema>
      </section>
    </div>
  )
}
