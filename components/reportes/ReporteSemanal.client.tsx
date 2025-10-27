"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { 
  LineChart, 
  Line, 
  BarChart,
  Bar,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Legend 
} from 'recharts'
import { 
  TarjetaSistema, 
  TituloSistema, 
  TextoSistema, 
  BotonSistema,
  BadgeSistema 
} from '@/components/ui/sistema-diseno'
import { 
  TrendingUp, 
  TrendingDown, 
  Calendar, 
  Users, 
  CheckCircle2, 
  AlertTriangle,
  ChevronLeft,
  ChevronRight
} from 'lucide-react'

type Semana = {
  inicio: string
  fin: string
  numero: number
}

type KPIsGlobales = {
  porcentaje_asistencia_global: number
  variacion_semana_anterior: number
  total_reuniones_registradas: number
  total_grupos_con_reunion: number
}

type TendenciaItem = {
  semana_inicio: string
  porcentaje: number
}

type SegmentoItem = {
  id: string
  nombre: string
  porcentaje_asistencia: number
  total_reuniones: number
}

type GrupoPerfecto = {
  id: string
  nombre: string
  lideres: string
}

type GrupoRiesgo = {
  id: string
  nombre: string
  porcentaje_asistencia: number
  lideres: string
}

type ReporteSemanalData = {
  semana: Semana
  kpis_globales: KPIsGlobales
  tendencia_asistencia_global: TendenciaItem[]
  asistencia_por_segmento: SegmentoItem[]
  top_5_grupos_perfectos: GrupoPerfecto[]
  top_5_grupos_en_riesgo: GrupoRiesgo[]
}

interface ReporteSemanalProps {
  reporte: ReporteSemanalData
}

export default function ReporteSemanal({ reporte }: ReporteSemanalProps) {
  const router = useRouter()
  const [fechaSeleccionada, setFechaSeleccionada] = useState(reporte.semana.inicio)

  // Formatear fecha para mostrar
  const formatearFecha = (fecha: string) => {
    return new Date(fecha).toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'short'
    })
  }

  // Navegar a semana anterior
  const irSemanaAnterior = () => {
    const fechaInicio = new Date(reporte.semana.inicio)
    fechaInicio.setDate(fechaInicio.getDate() - 7)
    const nuevaFecha = fechaInicio.toISOString().split('T')[0]
    router.push(`/dashboard/reportes/asistencia-semanal?semana=${nuevaFecha}`)
  }

  // Navegar a semana siguiente
  const irSemanaSiguiente = () => {
    const fechaInicio = new Date(reporte.semana.inicio)
    fechaInicio.setDate(fechaInicio.getDate() + 7)
    const nuevaFecha = fechaInicio.toISOString().split('T')[0]
    router.push(`/dashboard/reportes/asistencia-semanal?semana=${nuevaFecha}`)
  }

  // Navegar a semana actual
  const irSemanaActual = () => {
    router.push('/dashboard/reportes/asistencia-semanal')
  }

  // Preparar datos para el gráfico de tendencia
  const datosTendencia = reporte.tendencia_asistencia_global.map(item => ({
    semana: formatearFecha(item.semana_inicio),
    porcentaje: item.porcentaje,
    fecha_original: item.semana_inicio
  }))

  // Preparar datos para el gráfico de segmentos
  const datosSegmentos = reporte.asistencia_por_segmento.map(item => ({
    nombre: item.nombre.length > 20 ? item.nombre.substring(0, 20) + '...' : item.nombre,
    porcentaje: item.porcentaje_asistencia,
    nombre_completo: item.nombre
  }))

  return (
    <div className="space-y-6">
      {/* Selector de Semana */}
      <TarjetaSistema className="p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Calendar className="w-5 h-5 text-gray-500" />
            <div>
              <TextoSistema variante="sutil" tamaño="sm">
                Semana seleccionada
              </TextoSistema>
              <div className="text-lg font-semibold text-gray-900">
                {formatearFecha(reporte.semana.inicio)} - {formatearFecha(reporte.semana.fin)}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <BotonSistema
              variante="outline"
              tamaño="sm"
              onClick={irSemanaAnterior}
              className="gap-1"
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Anterior</span>
            </BotonSistema>
            <BotonSistema
              variante="outline"
              tamaño="sm"
              onClick={irSemanaActual}
            >
              Hoy
            </BotonSistema>
            <BotonSistema
              variante="outline"
              tamaño="sm"
              onClick={irSemanaSiguiente}
              className="gap-1"
            >
              <span className="hidden sm:inline">Siguiente</span>
              <ChevronRight className="w-4 h-4" />
            </BotonSistema>
          </div>
        </div>
      </TarjetaSistema>

      {/* KPIs Globales */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Porcentaje Global */}
        <TarjetaSistema className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-xl flex-shrink-0">
              <Users className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <TextoSistema variante="sutil" tamaño="sm">
                Asistencia Global
              </TextoSistema>
              <div className="text-3xl font-bold text-gray-900">
                {reporte.kpis_globales.porcentaje_asistencia_global}%
              </div>
            </div>
          </div>
        </TarjetaSistema>

        {/* Variación vs Semana Anterior */}
        <TarjetaSistema className="p-6">
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-xl flex-shrink-0 ${
              reporte.kpis_globales.variacion_semana_anterior >= 0
                ? 'bg-gradient-to-br from-green-500 to-emerald-500'
                : 'bg-gradient-to-br from-red-500 to-rose-500'
            }`}>
              {reporte.kpis_globales.variacion_semana_anterior >= 0 ? (
                <TrendingUp className="w-6 h-6 text-white" />
              ) : (
                <TrendingDown className="w-6 h-6 text-white" />
              )}
            </div>
            <div className="flex-1">
              <TextoSistema variante="sutil" tamaño="sm">
                vs. Semana Anterior
              </TextoSistema>
              <div className={`text-3xl font-bold ${
                reporte.kpis_globales.variacion_semana_anterior >= 0
                  ? 'text-green-600'
                  : 'text-red-600'
              }`}>
                {reporte.kpis_globales.variacion_semana_anterior > 0 ? '+' : ''}
                {reporte.kpis_globales.variacion_semana_anterior}%
              </div>
            </div>
          </div>
        </TarjetaSistema>

        {/* Total Reuniones */}
        <TarjetaSistema className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex-shrink-0">
              <Calendar className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <TextoSistema variante="sutil" tamaño="sm">
                Reuniones Registradas
              </TextoSistema>
              <div className="text-3xl font-bold text-gray-900">
                {reporte.kpis_globales.total_reuniones_registradas}
              </div>
            </div>
          </div>
        </TarjetaSistema>

        {/* Grupos Activos */}
        <TarjetaSistema className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-orange-500 to-red-500 rounded-xl flex-shrink-0">
              <Users className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <TextoSistema variante="sutil" tamaño="sm">
                Grupos con Reunión
              </TextoSistema>
              <div className="text-3xl font-bold text-gray-900">
                {reporte.kpis_globales.total_grupos_con_reunion}
              </div>
            </div>
          </div>
        </TarjetaSistema>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gráfico de Tendencia */}
        <TarjetaSistema className="p-6">
          <TituloSistema nivel={3} className="mb-4">
            Tendencia de Asistencia (8 semanas)
          </TituloSistema>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={datosTendencia}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis 
                dataKey="semana" 
                stroke="#6b7280"
                style={{ fontSize: '12px' }}
              />
              <YAxis 
                domain={[0, 100]}
                stroke="#6b7280"
                style={{ fontSize: '12px' }}
                label={{ value: '%', position: 'insideLeft' }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(255, 255, 255, 0.95)',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  padding: '8px 12px'
                }}
                formatter={(value: number) => [`${value}%`, 'Asistencia']}
              />
              <Line 
                type="monotone" 
                dataKey="porcentaje" 
                stroke="#3b82f6" 
                strokeWidth={3}
                dot={{ fill: '#3b82f6', r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </TarjetaSistema>

        {/* Gráfico por Segmento */}
        <TarjetaSistema className="p-6">
          <TituloSistema nivel={3} className="mb-4">
            Asistencia por Segmento
          </TituloSistema>
          {datosSegmentos.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={datosSegmentos}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis 
                  dataKey="nombre" 
                  stroke="#6b7280"
                  style={{ fontSize: '12px' }}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis 
                  domain={[0, 100]}
                  stroke="#6b7280"
                  style={{ fontSize: '12px' }}
                  label={{ value: '%', position: 'insideLeft' }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    padding: '8px 12px'
                  }}
                  formatter={(value: number) => [`${value}%`, 'Asistencia']}
                  labelFormatter={(label, payload) => {
                    if (payload && payload[0]) {
                      return payload[0].payload.nombre_completo
                    }
                    return label
                  }}
                />
                <Bar 
                  dataKey="porcentaje" 
                  fill="#f97316"
                  radius={[8, 8, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[300px]">
              <TextoSistema variante="sutil">
                No hay datos de segmentos para esta semana
              </TextoSistema>
            </div>
          )}
        </TarjetaSistema>
      </div>

      {/* Listas de Grupos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Grupos Perfectos */}
        <TarjetaSistema className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <CheckCircle2 className="w-6 h-6 text-green-600" />
            <TituloSistema nivel={3}>
              Grupos con 100% de Asistencia
            </TituloSistema>
          </div>
          {reporte.top_5_grupos_perfectos && reporte.top_5_grupos_perfectos.length > 0 ? (
            <div className="space-y-3">
              {reporte.top_5_grupos_perfectos.map((grupo) => (
                <div 
                  key={grupo.id}
                  className="p-4 bg-green-50 border border-green-200 rounded-xl hover:bg-green-100 transition-colors"
                >
                  <Link 
                    href={`/dashboard/grupos/${grupo.id}`}
                    className="block"
                  >
                    <div className="font-semibold text-gray-900 hover:text-green-700 mb-1">
                      {grupo.nombre}
                    </div>
                    <div className="flex items-center gap-2">
                      <TextoSistema variante="sutil" tamaño="sm">
                        Líderes: {grupo.lideres}
                      </TextoSistema>
                    </div>
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="text-gray-400 text-4xl mb-2">🎯</div>
              <TextoSistema variante="sutil">
                No hay grupos con 100% de asistencia esta semana
              </TextoSistema>
            </div>
          )}
        </TarjetaSistema>

        {/* Grupos en Riesgo */}
        <TarjetaSistema className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <AlertTriangle className="w-6 h-6 text-red-600" />
            <TituloSistema nivel={3}>
              Grupos que Necesitan Atención
            </TituloSistema>
          </div>
          {reporte.top_5_grupos_en_riesgo && reporte.top_5_grupos_en_riesgo.length > 0 ? (
            <div className="space-y-3">
              {reporte.top_5_grupos_en_riesgo.map((grupo) => (
                <div 
                  key={grupo.id}
                  className="p-4 bg-red-50 border border-red-200 rounded-xl hover:bg-red-100 transition-colors"
                >
                  <Link 
                    href={`/dashboard/grupos/${grupo.id}`}
                    className="block"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="font-semibold text-gray-900 hover:text-red-700">
                        {grupo.nombre}
                      </div>
                      <BadgeSistema variante="error" tamaño="sm">
                        {grupo.porcentaje_asistencia}%
                      </BadgeSistema>
                    </div>
                    <div className="flex items-center gap-2">
                      <TextoSistema variante="sutil" tamaño="sm">
                        Líderes: {grupo.lideres}
                      </TextoSistema>
                    </div>
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="text-gray-400 text-4xl mb-2">✨</div>
              <TextoSistema variante="sutil">
                ¡Todos los grupos tienen buena asistencia!
              </TextoSistema>
            </div>
          )}
        </TarjetaSistema>
      </div>
    </div>
  )
}
