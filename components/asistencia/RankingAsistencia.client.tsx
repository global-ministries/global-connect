"use client"

import { TarjetaSistema, BadgeSistema } from '@/components/ui/sistema-diseno'
import { BarChart3, Trophy, UserCheck, UserX, TrendingUp, TrendingDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BarraAsistencia, EstadoVacioAsistencia, TarjetaKpiAsistencia, claseTextoAsistencia } from './partes-asistencia'

type MiembroRanking = {
    id: string
    nombre: string
    email: string
    asistencias: number
    ausencias: number
    total_registros: number
    porcentaje: number
}

interface RankingAsistenciaClientProps {
    modo: 'constantes' | 'ausentes'
    miembros: MiembroRanking[]
    totalEventos: number
    grupoNombre: string
}

export default function RankingAsistenciaClient({
    modo,
    miembros,
    totalEventos,
    grupoNombre: _grupoNombre
}: RankingAsistenciaClientProps) {
    const esConstantes = modo === 'constantes'

    const getMedalla = (posicion: number) => {
        if (posicion === 0) return '🥇'
        if (posicion === 1) return '🥈'
        if (posicion === 2) return '🥉'
        return `${posicion + 1}`
    }

    const getBadgeVariante = (porcentaje: number): 'success' | 'warning' | 'error' => {
        if (porcentaje >= 70) return 'success'
        if (porcentaje >= 40) return 'warning'
        return 'error'
    }

    return (
        <div className="space-y-6">
            {/* Resumen */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <TarjetaKpiAsistencia
                    icono={esConstantes ? UserCheck : UserX}
                    tono={esConstantes ? 'exito' : 'peligro'}
                    etiqueta="Miembros"
                    valor={miembros.length}
                    className="flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-4"
                />
                <TarjetaKpiAsistencia
                    icono={Trophy}
                    tono="info"
                    etiqueta="Reuniones"
                    valor={totalEventos}
                    className="flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-4"
                />
                <TarjetaKpiAsistencia
                    icono={esConstantes ? TrendingUp : TrendingDown}
                    tono="marca"
                    etiqueta={esConstantes ? 'Mejor %' : 'Peor %'}
                    valor={miembros.length > 0 ? `${miembros[0].porcentaje}%` : 'N/D'}
                    className="col-span-2 sm:col-span-1"
                />
            </div>

            {/* Tabla de ranking */}
            <TarjetaSistema className="@container overflow-hidden p-0">
                {/* Encabezado — solo cuando la tabla es ancha */}
                <div className={cn(COLUMNAS_RANKING, "hidden border-b border-border bg-muted/50 px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground @2xl:grid")}>
                    <span className="text-center">#</span>
                    <span>Miembro</span>
                    <span className="text-center">{esConstantes ? 'Asist.' : 'Ausenc.'}</span>
                    <span className="text-center">Total</span>
                    <span className="text-center">%</span>
                    <span className="text-center">Estado</span>
                </div>

                {miembros.length > 0 ? (
                    <ol className="divide-y divide-border">
                        {miembros.map((miembro, i) => {
                            const valorPrincipal = esConstantes ? miembro.asistencias : miembro.ausencias
                            return (
                                <li
                                    key={miembro.id}
                                    className={cn(COLUMNAS_RANKING, "px-4 py-3 transition-colors duration-200 hover:bg-muted/30 @2xl:grid @2xl:items-center")}
                                >
                                    {/* Posición — ancho */}
                                    <div className="hidden items-center justify-center @2xl:flex">
                                        <span className={cn("text-sm font-semibold tabular-nums", i < 3 ? 'text-lg' : 'text-muted-foreground')}>
                                            {getMedalla(i)}
                                        </span>
                                    </div>

                                    {/* Angosto: fila compacta */}
                                    <div className="@2xl:hidden">
                                        {/* Línea 1: medalla + nombre + porcentaje */}
                                        <div className="flex items-center gap-2.5">
                                            <span className="w-6 shrink-0 text-center text-base tabular-nums">
                                                {getMedalla(i)}
                                            </span>
                                            <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                                                {miembro.nombre}
                                            </span>
                                            <span className={cn("shrink-0 text-xs font-semibold tabular-nums", claseTextoAsistencia(miembro.porcentaje))}>
                                                {miembro.porcentaje}%
                                            </span>
                                        </div>
                                        {/* Línea 2: barra de progreso completa */}
                                        <BarraAsistencia porcentaje={miembro.porcentaje} className="ml-[2.125rem] mt-1.5" />
                                        {/* Línea 3: stats */}
                                        <div className="ml-[2.125rem] mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                                            <span>{esConstantes ? `${miembro.asistencias} asist.` : `${miembro.ausencias} ausenc.`}</span>
                                            <span aria-hidden="true">·</span>
                                            <span>de {miembro.total_registros} reuniones</span>
                                        </div>
                                    </div>

                                    {/* Ancho: nombre */}
                                    <div className="hidden min-w-0 items-center @2xl:flex">
                                        <span className="truncate text-sm font-medium text-foreground">
                                            {miembro.nombre}
                                        </span>
                                    </div>

                                    {/* Valor principal — ancho */}
                                    <div className="hidden items-center justify-center @2xl:flex">
                                        <span className="text-sm font-semibold tabular-nums text-foreground">
                                            {valorPrincipal}
                                        </span>
                                    </div>

                                    {/* Total — ancho */}
                                    <div className="hidden items-center justify-center @2xl:flex">
                                        <span className="text-sm tabular-nums text-muted-foreground">
                                            {miembro.total_registros}
                                        </span>
                                    </div>

                                    {/* Porcentaje — ancho */}
                                    <div className="hidden items-center justify-center gap-1.5 @2xl:flex">
                                        <BarraAsistencia porcentaje={miembro.porcentaje} className="w-12" />
                                        <span className="text-xs font-medium tabular-nums text-muted-foreground">
                                            {miembro.porcentaje}%
                                        </span>
                                    </div>

                                    {/* Badge — ancho */}
                                    <div className="hidden items-center justify-center @2xl:flex">
                                        <BadgeSistema variante={getBadgeVariante(miembro.porcentaje)} tamaño="sm">
                                            {miembro.porcentaje >= 70 ? 'Bien' : miembro.porcentaje >= 40 ? 'Puede mejorar' : 'Prestar atención'}
                                        </BadgeSistema>
                                    </div>
                                </li>
                            )
                        })}
                    </ol>
                ) : (
                    <EstadoVacioAsistencia
                        icono={esConstantes ? BarChart3 : TrendingDown}
                        titulo="Sin datos de asistencia"
                        descripcion="No hay registros de asistencia para este grupo en el período seleccionado."
                    />
                )}
            </TarjetaSistema>
        </div>
    )
}

const COLUMNAS_RANKING = "@2xl:grid-cols-[3rem_minmax(0,1fr)_5rem_5rem_6rem_8.5rem] @2xl:gap-3"
