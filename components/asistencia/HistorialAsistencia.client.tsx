"use client"

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Eye, Edit, TrendingUp, Calendar, Users, UserCheck, UserX, Filter } from 'lucide-react'
import { TarjetaSistema, BotonSistema, TituloSistema, TextoSistema, InputSistema } from '@/components/ui/sistema-diseno'
import GraficoTendencia from './GraficoTendencia.client'

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
    
    router.push(`/dashboard/grupos/${grupoId}/asistencia/historial?${params.toString()}`)
  }

  const limpiarFiltros = () => {
    setFechaInicioLocal('')
    setFechaFinLocal('')
    router.push(`/dashboard/grupos/${grupoId}/asistencia/historial`)
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
        {/* Asistencia Promedio */}
        <TarjetaSistema className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-orange-500 to-red-500 rounded-xl">
              <TrendingUp className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <TextoSistema variante="sutil" tamaño="sm">
                Asistencia Promedio
              </TextoSistema>
              <TituloSistema nivel={2} className="text-gray-900">
                {reporte.kpis.asistencia_promedio}%
              </TituloSistema>
            </div>
          </div>
        </TarjetaSistema>

        {/* Total de Reuniones */}
        <TarjetaSistema className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl">
              <Calendar className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <TextoSistema variante="sutil" tamaño="sm">
                Total de Reuniones
              </TextoSistema>
              <TituloSistema nivel={2} className="text-gray-900">
                {reporte.kpis.total_reuniones}
              </TituloSistema>
            </div>
          </div>
        </TarjetaSistema>

        {/* Miembro más constante */}
        <TarjetaSistema className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-green-500 to-emerald-500 rounded-xl flex-shrink-0">
              <UserCheck className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <TextoSistema variante="sutil" tamaño="sm" className="mb-1">
                Más Constante
              </TextoSistema>
              {reporte.kpis.miembro_mas_constante.id ? (
                <Link href={`/dashboard/users/${reporte.kpis.miembro_mas_constante.id}/asistencia`}>
                  <div 
                    className="text-sm font-semibold text-blue-600 hover:text-blue-800 truncate cursor-pointer hover:underline" 
                    title={reporte.kpis.miembro_mas_constante.nombre}
                  >
                    {reporte.kpis.miembro_mas_constante.nombre}
                  </div>
                </Link>
              ) : (
                <div 
                  className="text-sm font-semibold text-gray-900 truncate" 
                  title={reporte.kpis.miembro_mas_constante.nombre}
                >
                  {reporte.kpis.miembro_mas_constante.nombre}
                </div>
              )}
              <TextoSistema variante="sutil" tamaño="sm" className="mt-0.5 text-xs">
                {reporte.kpis.miembro_mas_constante.asistencias} asistencias
              </TextoSistema>
            </div>
          </div>
        </TarjetaSistema>

        {/* Miembro con más ausencias */}
        <TarjetaSistema className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex-shrink-0">
              <UserX className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <TextoSistema variante="sutil" tamaño="sm" className="mb-1">
                Más Ausencias
              </TextoSistema>
              {reporte.kpis.miembro_mas_ausencias.id ? (
                <Link href={`/dashboard/users/${reporte.kpis.miembro_mas_ausencias.id}/asistencia`}>
                  <div 
                    className="text-sm font-semibold text-blue-600 hover:text-blue-800 truncate cursor-pointer hover:underline" 
                    title={reporte.kpis.miembro_mas_ausencias.nombre}
                  >
                    {reporte.kpis.miembro_mas_ausencias.nombre}
                  </div>
                </Link>
              ) : (
                <div 
                  className="text-sm font-semibold text-gray-900 truncate" 
                  title={reporte.kpis.miembro_mas_ausencias.nombre}
                >
                  {reporte.kpis.miembro_mas_ausencias.nombre}
                </div>
              )}
              <TextoSistema variante="sutil" tamaño="sm" className="mt-0.5 text-xs">
                {reporte.kpis.miembro_mas_ausencias.ausencias} ausencias
              </TextoSistema>
            </div>
          </div>
        </TarjetaSistema>
      </div>

      {/* Gráfico de Tendencia */}
      <GraficoTendencia data={reporte.series_temporales} />

      {/* Separador */}
      <div className="border-t border-gray-200 my-8"></div>

      {/* Lista de Eventos Históricos */}
      <div>
        <TituloSistema nivel={2} className="mb-4">
          Eventos Registrados
        </TituloSistema>
        
        <TarjetaSistema className="p-0">
          <div className="divide-y">
            {reporte.eventos_historial.length > 0 ? (
              reporte.eventos_historial.map((evento) => (
                <div 
                  key={evento.id} 
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 gap-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">
                      {formatearFecha(evento.fecha)} — {evento.tema}
                    </div>
                    <div className="text-sm text-gray-500">
                      Presentes {evento.presentes}/{evento.total} — {evento.porcentaje}%
                    </div>
                  </div>
                  <div className="flex gap-2 sm:flex-shrink-0">
                    <Link href={`/dashboard/grupos/${grupoId}/asistencia/${evento.id}`}>
                      <BotonSistema 
                        variante="outline" 
                        tamaño="sm"
                        className="gap-2"
                      >
                        <Eye className="w-4 h-4" />
                        <span className="sm:hidden">Ver</span>
                        <span className="hidden sm:inline">Ver detalle</span>
                      </BotonSistema>
                    </Link>
                    <Link href={`/dashboard/grupos/${grupoId}/asistencia/editar/${evento.id}`}>
                      <BotonSistema 
                        variante="ghost" 
                        tamaño="sm"
                        className="gap-2"
                      >
                        <Edit className="w-4 h-4" />
                        <span className="hidden sm:inline">Editar</span>
                      </BotonSistema>
                    </Link>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center">
                <div className="text-gray-400 text-4xl mb-4">📅</div>
                <TituloSistema nivel={3} className="text-gray-600 mb-2">
                  No hay eventos en este período
                </TituloSistema>
                <TextoSistema variante="sutil" className="mb-4">
                  Ajusta los filtros de fecha o registra un nuevo evento.
                </TextoSistema>
              </div>
            )}
          </div>
        </TarjetaSistema>
      </div>
    </div>
  )
}
