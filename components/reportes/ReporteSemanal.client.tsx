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

export default function ReporteSemanal({ reporte, incluirTodosInicial = true }: ReporteSemanalProps) {
  const router = useRouter()
  const [fechaSeleccionada, setFechaSeleccionada] = useState(reporte.semana.inicio)
  const [incluirTodos, setIncluirTodos] = useState<boolean>(!!incluirTodosInicial)
  const [mostrarTodosRiesgo, setMostrarTodosRiesgo] = useState<boolean>(false)

  // Formatear fecha para mostrar
  const mesesCortos = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic']
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
    if (!incluirTodos) params.set('todos', '0')
    const qs = params.toString()
    return qs ? `/grupos-vida/reportes/asistencia-semanal?${qs}` : '/grupos-vida/reportes/asistencia-semanal'
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
      if (!next) params.set('todos', '0')
      router.push(`/grupos-vida/reportes/asistencia-semanal?${params.toString()}`)
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
            <Calendar className="w-5 h-5 text-muted-foreground" />
            <div>
              <TextoSistema variante="sutil" tamaño="sm">
                Semana seleccionada
              </TextoSistema>
              <div className="text-lg font-semibold text-foreground">
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
              className={`ml-2 px-3 py-2 rounded-lg border text-sm transition-colors ${incluirTodos ? 'bg-foreground text-background border-foreground' : 'bg-card text-foreground border-border'
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
              <div className="text-3xl font-bold text-foreground">
                {reporte.kpis_globales.porcentaje_asistencia_global}%
              </div>
            </div>
          </div>
        </TarjetaSistema>

        {/* Variación vs Semana Anterior */}
        <TarjetaSistema className="p-6">
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-xl flex-shrink-0 ${reporte.kpis_globales.variacion_semana_anterior >= 0
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
              <div className={`text-3xl font-bold ${reporte.kpis_globales.variacion_semana_anterior >= 0
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
              <div className="text-3xl font-bold text-foreground">
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
              <div className="text-3xl font-bold text-foreground">
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
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                type="category"
                dataKey="semana_label"
                allowDuplicatedCategory={false}
                interval={0}
                stroke="var(--muted-foreground)"
                style={{ fontSize: '12px' }}
              />
              <YAxis
                domain={[0, 100]}
                stroke="var(--muted-foreground)"
                style={{ fontSize: '12px' }}
                label={{ value: '%', position: 'insideLeft' }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  padding: '8px 12px',
                  color: 'var(--foreground)',
                }}
                labelStyle={{ color: 'var(--foreground)', fontWeight: 600 }}
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
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="nombre"
                  stroke="var(--muted-foreground)"
                  style={{ fontSize: '12px' }}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis
                  domain={[0, 100]}
                  stroke="var(--muted-foreground)"
                  style={{ fontSize: '12px' }}
                  label={{ value: '%', position: 'insideLeft' }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--card)',
                    border: '1px solid var(--border)',
                    borderRadius: '12px',
                    padding: '8px 12px',
                    color: 'var(--foreground)',
                  }}
                  labelStyle={{ color: 'var(--foreground)', fontWeight: 600 }}
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
        <TarjetaSistema className="p-4 sm:p-6 h-full">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-gradient-to-br from-emerald-500 to-green-600 rounded-lg ring-1 ring-white/20 shadow-lg">
              <CheckCircle2 className="w-4 h-4 text-white" />
            </div>
            <TituloSistema nivel={3}>
              Grupos con 100% de Asistencia
            </TituloSistema>
          </div>
          {reporte.top_5_grupos_perfectos && reporte.top_5_grupos_perfectos.length > 0 ? (
            <div className="space-y-1.5 max-h-72 overflow-y-auto scrollbar-glass">
              {reporte.top_5_grupos_perfectos.map((grupo) => (
                <Link
                  key={grupo.id}
                  href={`/grupos-vida/${grupo.id}`}
                  className="flex items-center gap-3 p-3 bg-[var(--surface-secondary)]/50 rounded-xl hover:bg-[var(--surface-secondary)] transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm text-foreground truncate">
                      {grupo.nombre}
                    </div>
                    <TextoSistema variante="sutil" tamaño="sm" className="truncate">
                      {grupo.lideres}
                    </TextoSistema>
                  </div>
                  <BadgeSistema variante="success" tamaño="sm">100%</BadgeSistema>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="text-muted-foreground/50 text-4xl mb-2">🎯</div>
              <TextoSistema variante="sutil">
                No hay grupos con 100% de asistencia esta semana
              </TextoSistema>
            </div>
          )}
        </TarjetaSistema>

        {/* Grupos en Riesgo (< 75%) */}
        <TarjetaSistema className="p-4 sm:p-6 h-full">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-red-500 to-rose-600 rounded-lg ring-1 ring-white/20 shadow-lg">
                <AlertTriangle className="w-4 h-4 text-white" />
              </div>
              <TituloSistema nivel={3}>
                Grupos que Necesitan Atención
              </TituloSistema>
            </div>
            {reporte.grupos_en_riesgo_todos && reporte.grupos_en_riesgo_todos.length > 5 && (
              <BotonSistema
                variante="ghost"
                tamaño="sm"
                onClick={() => setMostrarTodosRiesgo((v) => !v)}
              >
                {mostrarTodosRiesgo ? 'Ver menos' : 'Ver más'}
              </BotonSistema>
            )}
          </div>
          {(() => {
            const lista = mostrarTodosRiesgo
              ? (reporte.grupos_en_riesgo_todos || [])
              : reporte.top_5_grupos_en_riesgo
            return lista && lista.length > 0 ? (
              <div className="space-y-1.5 max-h-72 overflow-y-auto scrollbar-glass">
                {lista.map((grupo) => (
                  <Link
                    key={grupo.id}
                    href={`/grupos-vida/${grupo.id}`}
                    className="flex items-center gap-3 p-3 bg-[var(--surface-secondary)]/50 rounded-xl hover:bg-[var(--surface-secondary)] transition-colors"
                  >
                    <div className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center shrink-0">
                      <AlertTriangle className="w-4 h-4 text-red-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm text-foreground truncate">
                        {grupo.nombre}
                      </div>
                      <TextoSistema variante="sutil" tamaño="sm" className="truncate">
                        {grupo.lideres}
                      </TextoSistema>
                    </div>
                    <BadgeSistema variante="error" tamaño="sm">
                      {grupo.porcentaje_asistencia}%
                    </BadgeSistema>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="text-muted-foreground/50 text-4xl mb-2">✨</div>
                <TextoSistema variante="sutil">
                  ¡Todos los grupos tienen buena asistencia!
                </TextoSistema>
              </div>
            )
          })()}
        </TarjetaSistema>
      </div>
    </div>
  )
}
