"use client"

import { TarjetaSistema, TituloSistema, TextoSistema, BadgeSistema } from '@/components/ui/sistema-diseno'
import { Trophy, UserCheck, UserX, TrendingUp, TrendingDown } from 'lucide-react'

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
    grupoNombre
}: RankingAsistenciaClientProps) {
    const esConstantes = modo === 'constantes'

    const getMedalla = (posicion: number) => {
        if (posicion === 0) return '🥇'
        if (posicion === 1) return '🥈'
        if (posicion === 2) return '🥉'
        return `${posicion + 1}`
    }

    const getBarColor = (porcentaje: number) => {
        if (porcentaje >= 80) return 'bg-green-500'
        if (porcentaje >= 60) return 'bg-amber-500'
        if (porcentaje >= 40) return 'bg-orange-500'
        return 'bg-red-500'
    }

    const getBadgeVariante = (porcentaje: number): 'success' | 'warning' | 'error' => {
        if (porcentaje >= 70) return 'success'
        if (porcentaje >= 40) return 'warning'
        return 'error'
    }

    return (
        <div className="space-y-6">
            {/* Resumen */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <TarjetaSistema className="p-4">
                    <div className="flex items-center gap-3">
                        <div className={`p-2.5 rounded-xl ${esConstantes ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                            {esConstantes
                                ? <UserCheck className="w-5 h-5 text-green-500" />
                                : <UserX className="w-5 h-5 text-red-500" />
                            }
                        </div>
                        <div>
                            <TextoSistema variante="muted" tamaño="sm">Miembros</TextoSistema>
                            <TituloSistema nivel={3}>{miembros.length}</TituloSistema>
                        </div>
                    </div>
                </TarjetaSistema>

                <TarjetaSistema className="p-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-blue-500/10">
                            <Trophy className="w-5 h-5 text-blue-500" />
                        </div>
                        <div>
                            <TextoSistema variante="muted" tamaño="sm">Reuniones</TextoSistema>
                            <TituloSistema nivel={3}>{totalEventos}</TituloSistema>
                        </div>
                    </div>
                </TarjetaSistema>

                <TarjetaSistema className="p-4 col-span-2 sm:col-span-1">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-[var(--brand-primary)]/10">
                            {esConstantes
                                ? <TrendingUp className="w-5 h-5 text-[var(--brand-primary)]" />
                                : <TrendingDown className="w-5 h-5 text-[var(--brand-primary)]" />
                            }
                        </div>
                        <div>
                            <TextoSistema variante="muted" tamaño="sm">
                                {esConstantes ? 'Mejor %' : 'Peor %'}
                            </TextoSistema>
                            <TituloSistema nivel={3}>
                                {miembros.length > 0 ? `${miembros[0].porcentaje}%` : 'N/D'}
                            </TituloSistema>
                        </div>
                    </div>
                </TarjetaSistema>
            </div>

            {/* Tabla de ranking */}
            <TarjetaSistema className="p-0 overflow-hidden">
                {/* Header de tabla — solo desktop */}
                <div className="hidden sm:grid sm:grid-cols-[3rem_1fr_5rem_5rem_5rem_8.5rem] gap-3 px-4 py-3 border-b border-border bg-muted/30 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    <span className="text-center">#</span>
                    <span>Miembro</span>
                    <span className="text-center">{esConstantes ? 'Asist.' : 'Ausenc.'}</span>
                    <span className="text-center">Total</span>
                    <span className="text-center">%</span>
                    <span className="text-center">Estado</span>
                </div>

                {miembros.length > 0 ? (
                    <div className="divide-y divide-border">
                        {miembros.map((miembro, i) => {
                            const valorPrincipal = esConstantes ? miembro.asistencias : miembro.ausencias
                            return (
                                <div
                                    key={miembro.id}
                                    className="sm:grid sm:grid-cols-[3rem_1fr_5rem_5rem_5rem_8.5rem] sm:gap-3 px-4 py-3 sm:items-center hover:bg-muted/30 transition-colors duration-200"
                                >
                                    {/* Posición — desktop */}
                                    <div className="hidden sm:flex items-center justify-center">
                                        <span className={`text-sm font-semibold ${i < 3 ? 'text-lg' : 'text-muted-foreground'}`}>
                                            {getMedalla(i)}
                                        </span>
                                    </div>

                                    {/* Móvil: fila compacta */}
                                    <div className="sm:hidden">
                                        {/* Línea 1: medalla + nombre + porcentaje */}
                                        <div className="flex items-center gap-2.5">
                                            <span className="text-base flex-shrink-0 w-6 text-center">
                                                {getMedalla(i)}
                                            </span>
                                            <span className="text-sm font-medium text-foreground truncate flex-1 min-w-0">
                                                {miembro.nombre}
                                            </span>
                                            <span className="text-xs font-semibold text-foreground flex-shrink-0">
                                                {miembro.porcentaje}%
                                            </span>
                                        </div>
                                        {/* Línea 2: barra de progreso completa */}
                                        <div className="mt-1.5 ml-[2.125rem] flex items-center gap-2">
                                            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full transition-all duration-500 ${getBarColor(miembro.porcentaje)}`}
                                                    style={{ width: `${miembro.porcentaje}%` }}
                                                />
                                            </div>
                                        </div>
                                        {/* Línea 3: stats */}
                                        <div className="mt-1 ml-[2.125rem] flex items-center gap-2 text-xs text-muted-foreground">
                                            <span>{esConstantes ? `${miembro.asistencias} asist.` : `${miembro.ausencias} ausenc.`}</span>
                                            <span>·</span>
                                            <span>de {miembro.total_registros} reuniones</span>
                                        </div>
                                    </div>

                                    {/* Desktop: nombre */}
                                    <div className="hidden sm:flex items-center min-w-0">
                                        <span className="text-sm font-medium text-foreground truncate">
                                            {miembro.nombre}
                                        </span>
                                    </div>

                                    {/* Valor principal — desktop */}
                                    <div className="hidden sm:flex items-center justify-center">
                                        <span className="text-sm font-semibold text-foreground">
                                            {valorPrincipal}
                                        </span>
                                    </div>

                                    {/* Total — desktop */}
                                    <div className="hidden sm:flex items-center justify-center">
                                        <span className="text-sm text-muted-foreground">
                                            {miembro.total_registros}
                                        </span>
                                    </div>

                                    {/* Porcentaje — desktop */}
                                    <div className="hidden sm:flex items-center justify-center">
                                        <div className="flex items-center gap-1.5">
                                            <div className="w-12 h-1.5 rounded-full bg-muted overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full ${getBarColor(miembro.porcentaje)}`}
                                                    style={{ width: `${miembro.porcentaje}%` }}
                                                />
                                            </div>
                                            <span className="text-xs font-medium text-muted-foreground">
                                                {miembro.porcentaje}%
                                            </span>
                                        </div>
                                    </div>

                                    {/* Badge — desktop */}
                                    <div className="hidden sm:flex items-center justify-center">
                                        <BadgeSistema variante={getBadgeVariante(miembro.porcentaje)} tamaño="sm">
                                            {miembro.porcentaje >= 70 ? 'Bien' : miembro.porcentaje >= 40 ? 'Puede mejorar' : 'Prestar atención'}
                                        </BadgeSistema>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                ) : (
                    <div className="p-8 text-center">
                        <div className="text-muted-foreground/50 text-4xl mb-4">
                            {esConstantes ? '📊' : '📉'}
                        </div>
                        <TituloSistema nivel={3} className="text-muted-foreground mb-2">
                            Sin datos de asistencia
                        </TituloSistema>
                        <TextoSistema variante="sutil">
                            No hay registros de asistencia para este grupo en el período seleccionado.
                        </TextoSistema>
                    </div>
                )}
            </TarjetaSistema>
        </div>
    )
}
