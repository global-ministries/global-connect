"use client"

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { TrendingUp, Users, Calendar, Clock, Filter, Eye } from 'lucide-react'
import { TarjetaSistema, BotonSistema, TituloSistema, TextoSistema, InputSistema, BadgeSistema } from '@/components/ui/sistema-diseno'
import GraficoAsistenciaUsuario from './GraficoAsistenciaUsuario.client'

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
  const [mostrarFiltros, setMostrarFiltros] = useState(false)
  const [fechaInicioLocal, setFechaInicioLocal] = useState(fechaInicio || '')
  const [fechaFinLocal, setFechaFinLocal] = useState(fechaFin || '')

  // Formatear fecha a dd-mm-aaaa
  const formatearFecha = (fecha: string) => {
    const fechaObj = new Date(fecha)
    const dia = String(fechaObj.getUTCDate()).padStart(2, '0')
    const mes = String(fechaObj.getUTCMonth() + 1).padStart(2, '0')
    const anio = fechaObj.getUTCFullYear()
    return `${dia}-${mes}-${anio}`
  }

  const aplicarFiltros = () => {
    const params = new URLSearchParams()
    if (fechaInicioLocal) params.set('fecha_inicio', fechaInicioLocal)
    if (fechaFinLocal) params.set('fecha_fin', fechaFinLocal)
    
    router.push(`/dashboard/users/${usuarioId}/asistencia?${params.toString()}`)
  }

  const limpiarFiltros = () => {
    setFechaInicioLocal('')
    setFechaFinLocal('')
    router.push(`/dashboard/users/${usuarioId}/asistencia`)
  }

  return (
    <div className="space-y-6">
      {/* Filtros de Fecha */}
      <TarjetaSistema className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-gray-600" />
            <TituloSistema nivel={3}>Filtros</TituloSistema>
          </div>
          <BotonSistema
            variante="ghost"
            tamaño="sm"
            onClick={() => setMostrarFiltros(!mostrarFiltros)}
          >
            {mostrarFiltros ? 'Ocultar' : 'Mostrar'}
          </BotonSistema>
        </div>

        {mostrarFiltros && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            <div className="flex gap-2">
              <BotonSistema
                variante="primario"
                tamaño="sm"
                onClick={aplicarFiltros}
              >
                Aplicar Filtros
              </BotonSistema>
              <BotonSistema
                variante="ghost"
                tamaño="sm"
                onClick={limpiarFiltros}
              >
                Limpiar
              </BotonSistema>
            </div>
          </div>
        )}
      </TarjetaSistema>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Porcentaje de Asistencia General */}
        <TarjetaSistema className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl flex-shrink-0">
              <TrendingUp className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <TextoSistema variante="sutil" tamaño="sm">
                Asistencia General
              </TextoSistema>
              <TituloSistema nivel={2} className="text-gray-900">
                {reporte.kpis.porcentaje_asistencia_general}%
              </TituloSistema>
            </div>
          </div>
        </TarjetaSistema>

        {/* Total de Grupos Activos */}
        <TarjetaSistema className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex-shrink-0">
              <Users className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <TextoSistema variante="sutil" tamaño="sm">
                Grupos Activos
              </TextoSistema>
              <TituloSistema nivel={2} className="text-gray-900">
                {reporte.kpis.total_grupos_activos}
              </TituloSistema>
            </div>
          </div>
        </TarjetaSistema>

        {/* Grupo Más Frecuente */}
        <TarjetaSistema className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-green-500 to-emerald-500 rounded-xl flex-shrink-0">
              <Calendar className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <TextoSistema variante="sutil" tamaño="sm" className="mb-1">
                Grupo Más Frecuente
              </TextoSistema>
              {reporte.kpis.grupo_mas_frecuente.id ? (
                <Link href={`/dashboard/grupos/${reporte.kpis.grupo_mas_frecuente.id}`}>
                  <div 
                    className="text-sm font-semibold text-blue-600 hover:text-blue-800 truncate cursor-pointer" 
                    title={reporte.kpis.grupo_mas_frecuente.nombre}
                  >
                    {reporte.kpis.grupo_mas_frecuente.nombre}
                  </div>
                </Link>
              ) : (
                <div className="text-sm font-semibold text-gray-900 truncate">
                  {reporte.kpis.grupo_mas_frecuente.nombre}
                </div>
              )}
            </div>
          </div>
        </TarjetaSistema>

        {/* Última Asistencia */}
        <TarjetaSistema className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-orange-500 to-red-500 rounded-xl flex-shrink-0">
              <Clock className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <TextoSistema variante="sutil" tamaño="sm">
                Última Asistencia
              </TextoSistema>
              <div className="text-sm font-semibold text-gray-900">
                {reporte.kpis.ultima_asistencia_fecha 
                  ? formatearFecha(reporte.kpis.ultima_asistencia_fecha)
                  : 'N/D'
                }
              </div>
            </div>
          </div>
        </TarjetaSistema>
      </div>

      {/* Gráfico de Tendencia */}
      <GraficoAsistenciaUsuario data={reporte.series_temporales} />

      {/* Separador */}
      <div className="border-t border-gray-200 my-8"></div>

      {/* Historial de Eventos */}
      <div>
        <TituloSistema nivel={2} className="mb-4">
          Historial de Eventos
        </TituloSistema>
        
        <TarjetaSistema className="p-0">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Fecha
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Grupo
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tema
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Estado
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {reporte.historial_eventos.length > 0 ? (
                  reporte.historial_eventos.map((evento, index) => (
                    <tr key={index} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatearFecha(evento.fecha)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <Link 
                          href={`/dashboard/grupos/${evento.grupo_id}`}
                          className="text-blue-600 hover:text-blue-800 hover:underline"
                        >
                          {evento.grupo_nombre}
                        </Link>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {evento.tema}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <BadgeSistema 
                          variante={evento.estado === 'Presente' ? 'success' : 'error'}
                          tamaño="sm"
                        >
                          {evento.estado}
                        </BadgeSistema>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Link href={`/dashboard/grupos/${evento.grupo_id}/asistencia/historial`}>
                          <BotonSistema 
                            variante="ghost" 
                            tamaño="sm"
                            className="gap-2"
                          >
                            <Eye className="w-4 h-4" />
                            <span className="hidden sm:inline">Ver grupo</span>
                          </BotonSistema>
                        </Link>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center">
                      <div className="text-gray-400 text-4xl mb-4">📅</div>
                      <TituloSistema nivel={3} className="text-gray-600 mb-2">
                        No hay eventos en este período
                      </TituloSistema>
                      <TextoSistema variante="sutil">
                        Ajusta los filtros de fecha para ver más eventos.
                      </TextoSistema>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TarjetaSistema>
      </div>
    </div>
  )
}
