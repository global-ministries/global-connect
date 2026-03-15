"use client"

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Eye, Edit, TrendingUp, Calendar, Users, UserCheck, UserX, Filter, ChevronRight } from 'lucide-react'
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

    router.push(`/grupos-vida/${grupoId}/asistencia/historial?${params.toString()}`)
  }

  const limpiarFiltros = () => {
    setFechaInicioLocal('')
    setFechaFinLocal('')
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
      {/* Filtros de Fecha */}
      <TarjetaSistema className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-muted-foreground" />
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
              <TituloSistema nivel={2} className="text-foreground">
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
              <TituloSistema nivel={2} className="text-foreground">
                {reporte.kpis.total_reuniones}
              </TituloSistema>
            </div>
          </div>
        </TarjetaSistema>

        {/* Miembro más constante */}
        <Link href={`/grupos-vida/${grupoId}/asistencia/historial/mas-constantes`}>
          <TarjetaSistema className="p-6 hover:bg-muted/30 transition-colors duration-200 cursor-pointer group">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-gradient-to-br from-green-500 to-emerald-500 rounded-xl flex-shrink-0">
                <UserCheck className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <TextoSistema variante="sutil" tamaño="sm" className="mb-1">
                  Más Constante
                </TextoSistema>
                <div
                  className="text-sm font-semibold text-foreground truncate"
                  title={reporte.kpis.miembro_mas_constante.nombre}
                >
                  {reporte.kpis.miembro_mas_constante.nombre}
                </div>
                <TextoSistema variante="sutil" tamaño="sm" className="mt-0.5 text-xs">
                  {reporte.kpis.miembro_mas_constante.asistencias} asistencias
                </TextoSistema>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0" />
            </div>
          </TarjetaSistema>
        </Link>

        {/* Miembro con más ausencias */}
        <Link href={`/grupos-vida/${grupoId}/asistencia/historial/mas-ausencias`}>
          <TarjetaSistema className="p-6 hover:bg-muted/30 transition-colors duration-200 cursor-pointer group">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex-shrink-0">
                <UserX className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <TextoSistema variante="sutil" tamaño="sm" className="mb-1">
                  Más Ausencias
                </TextoSistema>
                <div
                  className="text-sm font-semibold text-foreground truncate"
                  title={reporte.kpis.miembro_mas_ausencias.nombre}
                >
                  {reporte.kpis.miembro_mas_ausencias.nombre}
                </div>
                <TextoSistema variante="sutil" tamaño="sm" className="mt-0.5 text-xs">
                  {reporte.kpis.miembro_mas_ausencias.ausencias} ausencias
                </TextoSistema>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0" />
            </div>
          </TarjetaSistema>
        </Link>
      </div>

      {/* Gráfico de Tendencia (fechas reales de eventos) */}
      <GraficoTendencia data={serieEventos} />

      {/* Separador */}
      <div className="border-t border-border my-8"></div>

      {/* Lista de Eventos Históricos */}
      <div>
        <TituloSistema nivel={2} className="mb-4">
          Eventos Registrados
        </TituloSistema>

        <TarjetaSistema className="p-0 overflow-hidden">
          {/* Header — solo desktop */}
          <div className="hidden sm:grid sm:grid-cols-[7rem_1fr_6rem_5rem_7rem] gap-3 px-4 py-3 border-b border-border bg-muted/30 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            <span>Fecha</span>
            <span>Tema</span>
            <span className="text-center">Presentes</span>
            <span className="text-center">%</span>
            <span className="text-center">Acciones</span>
          </div>

          <div className="divide-y divide-border">
            {reporte.eventos_historial.length > 0 ? (
              reporte.eventos_historial.map((evento) => (
                <div
                  key={evento.id}
                  className="sm:grid sm:grid-cols-[7rem_1fr_6rem_5rem_7rem] sm:gap-3 px-4 py-3 sm:items-center hover:bg-muted/30 transition-colors duration-200"
                >
                  {/* Móvil: card compacto */}
                  <div className="sm:hidden">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        {/* Fecha + tema */}
                        <div className="text-sm font-medium text-foreground">
                          {evento.tema}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {formatearFecha(evento.fecha)}
                        </div>
                        {/* Barra de progreso */}
                        <div className="mt-2 flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${evento.porcentaje >= 80 ? 'bg-green-500' :
                                  evento.porcentaje >= 60 ? 'bg-amber-500' :
                                    evento.porcentaje >= 40 ? 'bg-orange-500' : 'bg-red-500'
                                }`}
                              style={{ width: `${evento.porcentaje}%` }}
                            />
                          </div>
                          <span className="text-xs font-semibold text-foreground flex-shrink-0">
                            {evento.porcentaje}%
                          </span>
                        </div>
                        {/* Stats */}
                        <div className="mt-1 text-xs text-muted-foreground">
                          {evento.presentes}/{evento.total} presentes
                        </div>
                      </div>
                      {/* Acciones móvil */}
                      <div className="flex gap-1.5 flex-shrink-0">
                        <Link href={`/grupos-vida/${grupoId}/asistencia/${evento.id}`}>
                          <BotonSistema variante="outline" tamaño="sm" className="px-2">
                            <Eye className="w-4 h-4" />
                          </BotonSistema>
                        </Link>
                        <Link href={`/grupos-vida/${grupoId}/asistencia/editar/${evento.id}`}>
                          <BotonSistema variante="ghost" tamaño="sm" className="px-2">
                            <Edit className="w-4 h-4" />
                          </BotonSistema>
                        </Link>
                      </div>
                    </div>
                  </div>

                  {/* Desktop: columnas */}
                  <div className="hidden sm:block text-sm text-muted-foreground">
                    {formatearFecha(evento.fecha)}
                  </div>
                  <div className="hidden sm:block text-sm font-medium text-foreground truncate">
                    {evento.tema}
                  </div>
                  <div className="hidden sm:block text-sm text-center text-muted-foreground">
                    {evento.presentes}/{evento.total}
                  </div>
                  <div className="hidden sm:flex items-center justify-center">
                    <span className={`text-sm font-semibold ${evento.porcentaje >= 80 ? 'text-green-500' :
                        evento.porcentaje >= 60 ? 'text-amber-500' : 'text-red-500'
                      }`}>
                      {evento.porcentaje}%
                    </span>
                  </div>
                  <div className="hidden sm:flex items-center justify-center gap-1.5">
                    <Link href={`/grupos-vida/${grupoId}/asistencia/${evento.id}`}>
                      <BotonSistema variante="outline" tamaño="sm" className="gap-1.5">
                        <Eye className="w-3.5 h-3.5" />
                        Ver
                      </BotonSistema>
                    </Link>
                    <Link href={`/grupos-vida/${grupoId}/asistencia/editar/${evento.id}`}>
                      <BotonSistema variante="ghost" tamaño="sm" className="px-2">
                        <Edit className="w-3.5 h-3.5" />
                      </BotonSistema>
                    </Link>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center">
                <div className="text-muted-foreground/50 text-4xl mb-4">📅</div>
                <TituloSistema nivel={3} className="text-muted-foreground mb-2">
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
