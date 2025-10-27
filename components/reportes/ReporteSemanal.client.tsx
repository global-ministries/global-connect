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
  total_grupos_activos: number
  total_miembros_asistentes: number
  total_miembros_en_grupos: number
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
  grupos_en_riesgo_todos?: GrupoRiesgo[]
}

interface ReporteSemanalProps {
  reporte: ReporteSemanalData
  incluirTodosInicial?: boolean
}

export default function ReporteSemanal({ reporte, incluirTodosInicial = false }: ReporteSemanalProps) {
  const router = useRouter()
  const [fechaSeleccionada, setFechaSeleccionada] = useState(reporte.semana.inicio)
  const [incluirTodos, setIncluirTodos] = useState<boolean>(!!incluirTodosInicial)
  const [mostrarTodosRiesgo, setMostrarTodosRiesgo] = useState<boolean>(false)

  // Formatear fecha para mostrar
  const mesesCortos = ['ene','feb','mar','abr','may','jun','jul','ago','sept','oct','nov','dic']
  const parsearFechaUTC = (s: string) => {
    const base = (s || '').slice(0, 10) // YYYY-MM-DD
    const [yStr, mStr, dStr] = base.split('-')
    const y = Number(yStr)
    const m = Number(mStr)
    const d = Number(dStr)
    return new Date(Date.UTC(isNaN(y) ? 1970 : y, isNaN(m) ? 0 : (m - 1), isNaN(d) ? 1 : d))
  }
  const formatearFecha = (fecha: string) => {
    const f = parsearFechaUTC(fecha)
    return `${f.getUTCDate()} ${mesesCortos[f.getUTCMonth()]}`
  }
  const formatearRangoSemana = (inicioIso: string) => {
    const ini = parsearFechaUTC(inicioIso)
    const fin = new Date(ini)
    fin.setUTCDate(ini.getUTCDate() + 6)
    const iniTxt = `${ini.getUTCDate()} ${mesesCortos[ini.getUTCMonth()]}`
    const finTxt = `${fin.getUTCDate()} ${mesesCortos[fin.getUTCMonth()]}`
    return `${iniTxt} - ${finTxt}`
  }

  const inicioSemanaLunesUTC = (d: Date) => {
    const dow = d.getUTCDay() // 0=dom, 1=lun, ...
    const delta = (dow + 6) % 7 // 0 si es lunes
    const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
    monday.setUTCDate(monday.getUTCDate() - delta)
    return monday
  }
  const formatearFechaDesdeDateUTC = (d: Date) => `${d.getUTCDate()} ${mesesCortos[d.getUTCMonth()]}`
  const rangoSemanaDesdeMonday = (monday: Date) => {
    const fin = new Date(monday)
    fin.setUTCDate(monday.getUTCDate() + 6)
    return `${formatearFechaDesdeDateUTC(monday)} - ${formatearFechaDesdeDateUTC(fin)}`
  }

  const construirUrl = (fecha?: string) => {
    const params = new URLSearchParams()
    if (fecha) params.set('semana', fecha)
    if (incluirTodos) params.set('todos', '1')
    const qs = params.toString()
    return qs ? `/dashboard/reportes/asistencia-semanal?${qs}` : '/dashboard/reportes/asistencia-semanal'
  }

  const irSemanaAnterior = () => {
    const fechaInicio = parsearFechaUTC(reporte.semana.inicio)
    fechaInicio.setUTCDate(fechaInicio.getUTCDate() - 7)
    const nuevaFecha = fechaInicio.toISOString().split('T')[0]
    router.push(construirUrl(nuevaFecha))
  }

  // Navegar a semana siguiente
  const irSemanaSiguiente = () => {
    const fechaInicio = parsearFechaUTC(reporte.semana.inicio)
    fechaInicio.setUTCDate(fechaInicio.getUTCDate() + 7)
    const nuevaFecha = fechaInicio.toISOString().split('T')[0]
    router.push(construirUrl(nuevaFecha))
  }

  // Navegar a semana actual
  const irSemanaActual = () => {
    router.push(construirUrl())
  }

  const alternarIncluirTodos = () => {
    setIncluirTodos(prev => {
      const next = !prev
      const params = new URLSearchParams()
      params.set('semana', reporte.semana.inicio)
      if (next) params.set('todos', '1')
      router.push(`/dashboard/reportes/asistencia-semanal?${params.toString()}`)
      return next
    })
  }

  // Preparar datos para el gráfico de tendencia
  const datosTendencia = reporte.tendencia_asistencia_global.map(item => {
    const base = parsearFechaUTC(item.semana_inicio)
    const monday = inicioSemanaLunesUTC(base)
    const isoMonday = monday.toISOString().slice(0, 10)
    return {
      semana_inicio: isoMonday,
      semana_label: formatearFechaDesdeDateUTC(monday),
      porcentaje: item.porcentaje,
    }
  })

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
            <button
              type="button"
              onClick={alternarIncluirTodos}
              className={`ml-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
                incluirTodos ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-300'
              }`}
              aria-pressed={incluirTodos}
            >
              {incluirTodos ? 'Todos los grupos activos' : 'Solo grupos con reunión'}
            </button>
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

        {/* Miembros Asistentes */}
        <TarjetaSistema className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-purple-500 to-indigo-500 rounded-xl flex-shrink-0">
              <CheckCircle2 className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <TextoSistema variante="sutil" tamaño="sm">
                Miembros Asistentes
              </TextoSistema>
              <div className="text-3xl font-bold text-gray-900">
                {reporte.kpis_globales.total_miembros_asistentes} / {reporte.kpis_globales.total_miembros_en_grupos}
              </div>
            </div>
          </div>
        </TarjetaSistema>

        {/* Grupos con Reunión / Activos */}
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
                {reporte.kpis_globales.total_grupos_con_reunion} / {reporte.kpis_globales.total_grupos_activos}
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
                type="category"
                dataKey="semana_label"
                allowDuplicatedCategory={false}
                interval={0}
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
                labelFormatter={(label: any, payload: any[]) => {
                  const p = payload && payload[0] && payload[0].payload
                  if (p && p.semana_inicio) return formatearRangoSemana(String(p.semana_inicio))
                  // fallback: derivar desde monday normalizado si tenemos etiqueta
                  const tryDate = parsearFechaUTC(String(label))
                  const monday = inicioSemanaLunesUTC(tryDate)
                  return rangoSemanaDesdeMonday(monday)
                }}
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
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-6 h-6 text-red-600" />
              <TituloSistema nivel={3}>
                Grupos que Necesitan Atención
              </TituloSistema>
            </div>
            {reporte.grupos_en_riesgo_todos && reporte.grupos_en_riesgo_todos.length > 5 && (
              <BotonSistema
                variante="outline"
                tamaño="sm"
                onClick={() => setMostrarTodosRiesgo((v) => !v)}
              >
                {mostrarTodosRiesgo ? 'Ver menos' : 'Ver más'}
              </BotonSistema>
            )}
          </div>
          {(mostrarTodosRiesgo ? reporte.grupos_en_riesgo_todos : reporte.top_5_grupos_en_riesgo) && (mostrarTodosRiesgo ? (reporte.grupos_en_riesgo_todos || []) : reporte.top_5_grupos_en_riesgo).length > 0 ? (
            <div className="space-y-3">
              {(mostrarTodosRiesgo ? (reporte.grupos_en_riesgo_todos || []) : reporte.top_5_grupos_en_riesgo).map((grupo) => (
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
