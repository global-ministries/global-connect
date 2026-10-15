"use client"

import Link from 'next/link'
import {
    PieChart, Pie, Cell,
    AreaChart, Area,
    XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer
} from 'recharts'
import {
    TarjetaSistema,
    TituloSistema,
    TextoSistema,
    BadgeSistema
} from '@/components/ui/sistema-diseno'
import {
    ShieldAlert, TrendingDown, AlertTriangle, Users,
    HeartPulse, Calendar, UserX, Activity,
    ChevronRight, Eye,
    type LucideIcon
} from 'lucide-react'
import type { DashboardRiesgo } from '@/lib/types/asistencia-avanzada.types'

// ─── Constantes de estilo ──────────────────────────────────────────

/**
 * One color per health level, from the status tokens (app/globals.css) so the
 * charts follow light and dark mode. "En riesgo" sits between warning and
 * danger, so it mixes both. Used where a class cannot reach (SVG fills,
 * inline widths).
 */
const COLORES_NIVEL = {
    normal: 'var(--success)',
    atencion: 'var(--warning)',
    riesgo: 'color-mix(in oklch, var(--warning), var(--danger))',
    critico: 'var(--danger)'
} as const

/**
 * Readable text per level. `--warning` is too light for text on white, so the
 * two middle levels keep darker amber and orange until a warning text token
 * exists (docs/design-system.md).
 */
const TEXTO_NIVEL = {
    normal: 'text-success',
    atencion: 'text-amber-700 dark:text-amber-400',
    riesgo: 'text-orange-700 dark:text-orange-400',
    critico: 'text-danger'
} as const

/** Tinted tile behind each level's icon. */
const FONDO_NIVEL = {
    normal: 'bg-success/10',
    atencion: 'bg-warning/15',
    riesgo: 'bg-orange-500/10',
    critico: 'bg-danger/10'
} as const

const COLOR_SIN_NIVEL = 'var(--muted-foreground)'

const ETIQUETAS_NIVEL: Record<string, string> = {
    normal: 'Sanos',
    atencion: 'Atención',
    riesgo: 'En riesgo',
    critico: 'Críticos'
}

// ─── Componente Principal ────────────────────────────────────────

interface Props {
    data: DashboardRiesgo
}

export default function DashboardRiesgoClient({ data: d }: Props) {
    const totalMiembrosReporte = Math.max(0, Number(d.total_miembros) || 0)
    const distribucionSalud = [
        { nivel: 'normal', cantidad: d.miembros_sanos },
        { nivel: 'atencion', cantidad: d.miembros_en_atencion },
        { nivel: 'riesgo', cantidad: d.miembros_en_riesgo },
        { nivel: 'critico', cantidad: d.miembros_criticos },
    ].map((item) => ({ ...item, cantidad: Math.max(0, Number(item.cantidad) || 0) }))
    const totalMiembrosDistribucion = distribucionSalud.reduce((total, item) => total + item.cantidad, 0)
    const hayDiferenciaDistribucion = totalMiembrosDistribucion !== totalMiembrosReporte
    const totalMiembrosVisual = totalMiembrosReporte || totalMiembrosDistribucion
    const porcentajeDelReporte = (cantidad: number) => totalMiembrosReporte > 0
        ? Math.round((cantidad / totalMiembrosReporte) * 100)
        : 0
    const porcentajeDistribucion = (cantidad: number) => totalMiembrosDistribucion > 0
        ? Math.round((cantidad / totalMiembrosDistribucion) * 100)
        : 0
    const mensajeDiferenciaDistribucion = totalMiembrosDistribucion > totalMiembrosReporte
        ? `La distribución suma ${totalMiembrosDistribucion}; podría haber miembros contados en más de un nivel.`
        : `La distribución suma ${totalMiembrosDistribucion}; algunos miembros podrían no estar representados en la distribución de riesgo.`
    const pctCriticos = porcentajeDelReporte(d.miembros_criticos)
    const pctRiesgo = porcentajeDelReporte(d.miembros_en_riesgo)
    const pctAtencion = porcentajeDelReporte(d.miembros_en_atencion)
    const pctSanos = porcentajeDelReporte(d.miembros_sanos)
    const distribucionGrafico = distribucionSalud
        .filter((item) => item.cantidad > 0)
        .map((item) => ({
            ...item,
            name: ETIQUETAS_NIVEL[item.nivel] || item.nivel,
            porcentaje: porcentajeDistribucion(item.cantidad),
        }))

    return (
        <div className="space-y-6">
            {/* ─── Explicación del dashboard ─── */}
            <TarjetaSistema variante="default" className="p-4 sm:p-5">
                <div className="flex items-start gap-3">
                    <div className="p-2 rounded-xl bg-info/10 shrink-0">
                        <HeartPulse className="h-5 w-5 text-info" aria-hidden="true" />
                    </div>
                    <div>
                        <TituloSistema nivel={4}>¿Cómo funciona este dashboard?</TituloSistema>
                        <TextoSistema variante="muted" tamaño="sm" className="mt-1">
                            Monitoreamos la salud de cada miembro según sus semanas sin asistir.
                            Los <strong className="text-foreground">niveles de riesgo</strong> se calculan automáticamente:
                            {' '}<strong className={TEXTO_NIVEL.critico}>Crítico</strong> = muchas semanas ausente,
                            {' '}<strong className={TEXTO_NIVEL.riesgo}>Riesgo</strong> = varias semanas sin venir,
                            {' '}<strong className={TEXTO_NIVEL.atencion}>Atención</strong> = empezando a alejarse,
                            {' '}<strong className={TEXTO_NIVEL.normal}>Sano</strong> = asistencia regular.
                        </TextoSistema>
                    </div>
                </div>
            </TarjetaSistema>

            {/* ─── KPI Cards ─── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                <KPICard
                    nivel="normal"
                    icono={HeartPulse}
                    valor={d.miembros_sanos}
                    etiqueta="Sanos"
                    porcentaje={pctSanos}
                />
                <KPICard
                    nivel="atencion"
                    icono={AlertTriangle}
                    valor={d.miembros_en_atencion}
                    etiqueta="Atención"
                    porcentaje={pctAtencion}
                />
                <KPICard
                    nivel="riesgo"
                    icono={TrendingDown}
                    valor={d.miembros_en_riesgo}
                    etiqueta="En riesgo"
                    porcentaje={pctRiesgo}
                />
                <KPICard
                    nivel="critico"
                    icono={ShieldAlert}
                    valor={d.miembros_criticos}
                    etiqueta="Críticos"
                    porcentaje={pctCriticos}
                />
            </div>

            {/* ─── Charts Row ─── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Donut Chart - Distribución */}
                <TarjetaSistema variante="default" className="p-4 sm:p-5">
                    <div className="flex items-center gap-2 mb-4">
                        <div className="p-1.5 rounded-xl bg-info/10">
                            <Activity className="h-4 w-4 text-info" aria-hidden="true" />
                        </div>
                        <TituloSistema nivel={4}>Distribución de Salud</TituloSistema>
                    </div>
                    {distribucionGrafico.length > 0 ? (
                        <div className="flex flex-col sm:flex-row items-center gap-4">
                            <div className="w-48 h-48 sm:w-52 sm:h-52">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={distribucionGrafico}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={55}
                                            outerRadius={80}
                                            paddingAngle={3}
                                            dataKey="cantidad"
                                            strokeWidth={0}
                                        >
                                            {distribucionGrafico.map((r, i) => (
                                                <Cell
                                                    key={i}
                                                    fill={COLORES_NIVEL[r.nivel as keyof typeof COLORES_NIVEL] || COLOR_SIN_NIVEL}
                                                />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            formatter={(value: number, name: string) => [`${value} miembros`, name]}
                                            contentStyle={{
                                                background: 'var(--card)',
                                                border: '1px solid var(--border)',
                                                borderRadius: '12px',
                                                color: 'var(--foreground)',
                                                fontSize: '13px'
                                            }}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="flex w-full min-w-0 flex-col gap-2 flex-1">
                                {distribucionGrafico.map((r) => (
                                    <div key={r.nivel} className="flex items-center gap-2">
                                        <span
                                            className="w-3 h-3 rounded-full shrink-0"
                                            style={{ backgroundColor: COLORES_NIVEL[r.nivel as keyof typeof COLORES_NIVEL] || COLOR_SIN_NIVEL }}
                                        />
                                        <span className="text-sm text-foreground flex-1">
                                            {ETIQUETAS_NIVEL[r.nivel] || r.nivel}
                                        </span>
                                        <span className="text-sm font-semibold text-foreground">{r.cantidad}</span>
                                        <span className="text-xs text-muted-foreground">({r.porcentaje}%)</span>
                                    </div>
                                ))}
                                <div className="mt-1 pt-2 border-t border-border">
                                     <div className="flex items-center justify-between">
                                         <span className="text-xs text-muted-foreground">Total miembros</span>
                                         <span className="text-sm font-bold text-foreground">{totalMiembrosVisual}</span>
                                    </div>
                                    {hayDiferenciaDistribucion && (
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            {mensajeDiferenciaDistribucion}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <TextoSistema variante="muted" className="text-center py-8">
                            No hay datos de distribución disponibles
                        </TextoSistema>
                    )}
                </TarjetaSistema>

                {/* Area Chart - Tendencia */}
                <TarjetaSistema variante="default" className="p-4 sm:p-5">
                    <div className="flex items-center gap-2 mb-4">
                        <div className="p-1.5 rounded-xl bg-success/10">
                            <Activity className="h-4 w-4 text-success" aria-hidden="true" />
                        </div>
                        <TituloSistema nivel={4}>Tendencia de Asistencia</TituloSistema>
                    </div>
                    {d.tendencia_asistencia_4_semanas.length > 0 ? (
                        <>
                            <div className="h-48 sm:h-52">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={d.tendencia_asistencia_4_semanas}>
                                        <defs>
                                            <linearGradient id="colorPct" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="var(--success)" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="var(--success)" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                                        <XAxis
                                            dataKey="semana"
                                            tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                                            axisLine={{ stroke: 'var(--border)' }}
                                        />
                                        <YAxis
                                            domain={[0, 100]}
                                            tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                                            axisLine={{ stroke: 'var(--border)' }}
                                            tickFormatter={(v) => `${v}%`}
                                        />
                                        <Tooltip
                                            formatter={(value: number) => [`${value}%`, 'Asistencia']}
                                            contentStyle={{
                                                background: 'var(--card)',
                                                border: '1px solid var(--border)',
                                                borderRadius: '12px',
                                                color: 'var(--foreground)',
                                                fontSize: '13px'
                                            }}
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey="pct"
                                            stroke="var(--success)"
                                            strokeWidth={2}
                                            fillOpacity={1}
                                            fill="url(#colorPct)"
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                            <TextoSistema variante="muted" tamaño="sm" className="mt-2 text-center">
                                Porcentaje de asistencia promedio por semana (últimas 4 semanas)
                            </TextoSistema>
                        </>
                    ) : (
                        <TextoSistema variante="muted" className="text-center py-8">
                            No hay datos de tendencia disponibles
                        </TextoSistema>
                    )}
                </TarjetaSistema>
            </div>

            {/* ─── Miembros Críticos ─── */}
            {d.miembros_criticos_detalle.length > 0 && (
                <TarjetaSistema variante="default" className="p-4 sm:p-5">
                    <div className="flex items-center gap-2 mb-4">
                        <div className="p-1.5 rounded-xl bg-danger/10">
                            <UserX className="h-4 w-4 text-danger" aria-hidden="true" />
                        </div>
                        <TituloSistema nivel={4}>Miembros que Necesitan Atención Urgente</TituloSistema>
                    </div>
                    <TextoSistema variante="muted" tamaño="sm" className="mb-3">
                        Personas con más tiempo sin asistir. Considera contactarlos para saber cómo están.
                    </TextoSistema>

                    {/* Desktop: tabla */}
                    <div className="hidden sm:block border border-border rounded-xl overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-border bg-muted/30">
                                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-2.5">Nombre</th>
                                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-2.5">Grupo</th>
                                    <th className="text-center text-xs font-medium text-muted-foreground px-4 py-2.5">Semanas ausente</th>
                                    <th className="text-center text-xs font-medium text-muted-foreground px-4 py-2.5">Asistencia</th>
                                    <th className="text-center text-xs font-medium text-muted-foreground px-4 py-2.5">Nivel</th>
                                    <th className="text-right text-xs font-medium text-muted-foreground px-4 py-2.5"><span className="sr-only">Acciones</span></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {d.miembros_criticos_detalle.map((m) => (
                                    <tr key={m.usuario_id + m.grupo_id} className="hover:bg-muted/30 transition-colors duration-200">
                                        <td className="px-4 py-3 text-sm font-medium text-foreground">{m.nombre}</td>
                                        <td className="px-4 py-3 text-sm text-muted-foreground">{m.grupo_nombre}</td>
                                        <td className="px-4 py-3 text-center">
                                            <span className="text-sm font-semibold text-danger">
                                                {m.semanas_ausente >= 99 ? 'Nunca asistió' : `${m.semanas_ausente} sem`}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-center text-sm text-muted-foreground">
                                            {m.pct_asistencia}%
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <BadgeSistema
                                                variante={m.nivel_riesgo === 'critico' ? 'error' : 'warning'}
                                                tamaño="sm"
                                            >
                                                {m.nivel_riesgo === 'critico' ? 'Crítico' : 'Riesgo'}
                                            </BadgeSistema>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <Link
                                                href={`/grupos-vida/${m.grupo_id}/salud`}
                                                className="inline-flex min-h-9 items-center justify-end gap-1 rounded-xl px-2 text-xs font-medium text-info transition-colors duration-200 hover:bg-info/10 pointer-coarse:min-h-11"
                                            >
                                                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                                                Ver grupo
                                            </Link>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Móvil: cards */}
                    <div className="sm:hidden space-y-2">
                        {d.miembros_criticos_detalle.map((m) => (
                            <Link
                                key={m.usuario_id + m.grupo_id}
                                href={`/grupos-vida/${m.grupo_id}/salud`}
                                className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border hover:bg-muted/30 transition-colors duration-200"
                            >
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-foreground truncate">{m.nombre}</p>
                                    <p className="text-xs text-muted-foreground truncate">{m.grupo_nombre}</p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <div className="text-right">
                                        <p className="text-sm font-semibold text-danger">
                                            {m.semanas_ausente >= 99 ? '∞' : m.semanas_ausente} sem
                                        </p>
                                    </div>
                                    <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                                </div>
                            </Link>
                        ))}
                    </div>

                    {/* Botón ver listado completo */}
                    <div className="mt-4 pt-3 border-t border-border flex justify-center">
                        <Link
                            href="/grupos-vida/miembros-riesgo"
                            className="inline-flex h-11 items-center gap-2 px-4 rounded-xl text-sm font-medium text-info hover:bg-info/10 transition-colors duration-200"
                        >
                            <Users className="h-4 w-4" aria-hidden="true" />
                            Ver listado completo
                            <ChevronRight className="h-4 w-4" aria-hidden="true" />
                        </Link>
                    </div>
                </TarjetaSistema>
            )}

            {/* ─── Dos columns: Top Riesgo + Sin Reunión ─── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
                {/* Grupos con mayor riesgo */}
                {d.top_5_grupos_riesgo.length > 0 && (
                    <TarjetaSistema variante="default" className="p-4 sm:p-5 flex flex-col">
                        <div className="flex items-center gap-2 mb-3">
                            <div className={`p-1.5 rounded-xl ${FONDO_NIVEL.riesgo}`}>
                                <ShieldAlert className={`h-4 w-4 ${TEXTO_NIVEL.riesgo}`} aria-hidden="true" />
                            </div>
                            <TituloSistema nivel={4}>Grupos con Mayor Riesgo</TituloSistema>
                        </div>
                        <TextoSistema variante="muted" tamaño="sm" className="mb-3">
                            Grupos con más miembros en estado crítico o de riesgo.
                        </TextoSistema>
                        <div className="divide-y divide-border flex-1 overflow-y-auto max-h-[320px]">
                            {d.top_5_grupos_riesgo.map((g, i) => (
                                <Link
                                    key={g.grupo_id}
                                    href={`/grupos-vida/${g.grupo_id}/salud`}
                                    className="flex items-center justify-between gap-3 py-2.5 hover:bg-muted/30 px-2 -mx-2 rounded-xl transition-colors duration-200"
                                >
                                    <div className="flex min-w-0 items-center gap-3">
                                        <span className="text-xs text-muted-foreground w-5 shrink-0 text-center font-mono">{i + 1}</span>
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium text-foreground truncate">{g.grupo_nombre}</p>
                                            <p className="text-xs text-muted-foreground">{g.total_miembros} miembros</p>
                                        </div>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-1.5">
                                        {g.criticos > 0 && (
                                            <BadgeSistema variante="error" tamaño="sm">
                                                {g.criticos} crít.
                                            </BadgeSistema>
                                        )}
                                        <BadgeSistema variante="warning" tamaño="sm">
                                            {g.riesgo_total} riesgo
                                        </BadgeSistema>
                                        <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </TarjetaSistema>
                )}

                {/* Grupos sin reunión */}
                <TarjetaSistema variante="default" className="p-4 sm:p-5 flex flex-col">
                    <div className="flex items-center gap-2 mb-3">
                        <div className="p-1.5 rounded-xl bg-muted">
                            <Calendar className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        </div>
                        <div className="flex items-center gap-2">
                            <TituloSistema nivel={4}>Sin Reunión Esta Semana</TituloSistema>
                            <BadgeSistema variante="default" tamaño="sm">
                                {d.grupos_sin_reunion_esta_semana}
                            </BadgeSistema>
                        </div>
                    </div>
                    <TextoSistema variante="muted" tamaño="sm" className="mb-3">
                        Grupos que no han registrado asistencia en los últimos 7 días.
                    </TextoSistema>
                    {d.grupos_sin_reunion_detalle.length > 0 ? (
                        <div className="divide-y divide-border flex-1 overflow-y-auto max-h-[320px]">
                            {d.grupos_sin_reunion_detalle.map((g) => (
                                <Link
                                    key={g.grupo_id}
                                    href={`/grupos-vida/${g.grupo_id}`}
                                    className="flex items-center justify-between gap-3 py-2.5 hover:bg-muted/30 px-2 -mx-2 rounded-xl transition-colors duration-200"
                                >
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium text-foreground truncate">{g.grupo_nombre}</p>
                                        <p className="text-xs text-muted-foreground truncate">Líder: {g.lider_nombre}</p>
                                    </div>
                                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                                </Link>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-6">
                            <div className="p-3 rounded-full bg-success/10 w-fit mx-auto mb-2">
                                <Calendar className="h-5 w-5 text-success" aria-hidden="true" />
                            </div>
                            <TextoSistema variante="muted" tamaño="sm">
                                ¡Todos los grupos se reunieron esta semana! 🎉
                            </TextoSistema>
                        </div>
                    )}
                </TarjetaSistema>
            </div>

            {/* ─── Riesgo por Segmento ─── */}
            {d.segmentos_riesgo.length > 0 && (
                <TarjetaSistema variante="default" className="p-4 sm:p-5">
                    <div className="flex items-center gap-2 mb-4">
                        <div className="p-1.5 rounded-xl bg-info/10">
                            <Users className="h-4 w-4 text-info" aria-hidden="true" />
                        </div>
                        <TituloSistema nivel={4}>Salud por Segmento</TituloSistema>
                    </div>
                    <TextoSistema variante="muted" tamaño="sm" className="mb-4">
                        Distribución de riesgo en cada tipo de grupo. Las barras muestran la proporción de miembros sanos vs. en riesgo.
                    </TextoSistema>

                    {/* Horizontal stacked bars */}
                    <div className="space-y-3">
                        {d.segmentos_riesgo.map((seg) => {
                            const totalSegmento = Math.max(0, seg.normal + seg.atencion + seg.riesgo + seg.criticos)
                            const anchoSegmento = (cantidad: number) => totalSegmento > 0 ? (cantidad / totalSegmento) * 100 : 0
                            return (
                                <div key={seg.segmento_nombre}>
                                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 mb-1.5">
                                        <span className="text-sm font-medium text-foreground">{seg.segmento_nombre}</span>
                                        <div className="flex items-center gap-2">
                                            {seg.criticos > 0 && (
                                                <span className={`text-xs font-medium ${TEXTO_NIVEL.critico}`}>{seg.criticos} crít.</span>
                                            )}
                                            {seg.riesgo > 0 && (
                                                <span className={`text-xs font-medium ${TEXTO_NIVEL.riesgo}`}>{seg.riesgo} riesgo</span>
                                            )}
                                            <span className="text-xs text-muted-foreground">{totalSegmento} total</span>
                                        </div>
                                    </div>
                                    {/* Bar visual */}
                                    <div className="w-full h-2.5 rounded-full bg-muted overflow-hidden flex">
                                        {seg.normal > 0 && (
                                            <div
                                                className="h-full transition-all duration-500"
                                                style={{ width: `${anchoSegmento(seg.normal)}%`, backgroundColor: COLORES_NIVEL.normal }}
                                            />
                                        )}
                                        {seg.atencion > 0 && (
                                            <div
                                                className="h-full transition-all duration-500"
                                                style={{ width: `${anchoSegmento(seg.atencion)}%`, backgroundColor: COLORES_NIVEL.atencion }}
                                            />
                                        )}
                                        {seg.riesgo > 0 && (
                                            <div
                                                className="h-full transition-all duration-500"
                                                style={{ width: `${anchoSegmento(seg.riesgo)}%`, backgroundColor: COLORES_NIVEL.riesgo }}
                                            />
                                        )}
                                        {seg.criticos > 0 && (
                                            <div
                                                className="h-full transition-all duration-500"
                                                style={{ width: `${anchoSegmento(seg.criticos)}%`, backgroundColor: COLORES_NIVEL.critico }}
                                            />
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                    </div>

                    {/* Legend */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-4 pt-3 border-t border-border">
                        {Object.entries(COLORES_NIVEL).map(([nivel, color]) => (
                            <div key={nivel} className="flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                                <span className="text-xs text-muted-foreground">{ETIQUETAS_NIVEL[nivel]}</span>
                            </div>
                        ))}
                    </div>
                </TarjetaSistema>
            )}

            {/* ─── Info fila complementaria ─── */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <TarjetaSistema variante="default" className="p-4 flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-info/10">
                        <Users className="h-5 w-5 text-info" aria-hidden="true" />
                    </div>
                    <div>
                        <p className="text-lg font-bold text-foreground">{d.total_grupos}</p>
                        <p className="text-xs text-muted-foreground">Grupos activos</p>
                    </div>
                </TarjetaSistema>

                <TarjetaSistema variante="default" className="p-4 flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-warning/15">
                        <Activity className="h-5 w-5 text-amber-700 dark:text-warning" aria-hidden="true" />
                    </div>
                    <div>
                        <p className="text-lg font-bold text-foreground">{d.solicitudes_pendientes}</p>
                        <p className="text-xs text-muted-foreground">Solicitudes pendientes</p>
                    </div>
                </TarjetaSistema>

                <TarjetaSistema variante="default" className="p-4 flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-success/10">
                        <Users className="h-5 w-5 text-success" aria-hidden="true" />
                    </div>
                    <div>
                        <p className="text-lg font-bold text-foreground">{d.visitantes_del_mes}</p>
                        <p className="text-xs text-muted-foreground">Visitantes del mes</p>
                    </div>
                </TarjetaSistema>
            </div>
        </div>
    )
}

// ─── Sub-componentes ──────────────────────────────────────────────

interface KPICardProps {
    nivel: keyof typeof COLORES_NIVEL
    icono: LucideIcon
    valor: number
    etiqueta: string
    porcentaje: number
}

function KPICard({ nivel, icono: Icono, valor, etiqueta, porcentaje }: KPICardProps) {
    return (
        <TarjetaSistema variante="default" className="p-4">
            <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl ${FONDO_NIVEL[nivel]} shrink-0`}>
                    <Icono className={`h-5 w-5 ${TEXTO_NIVEL[nivel]}`} aria-hidden="true" />
                </div>
                <div className="min-w-0">
                    <p className="text-2xl font-bold text-foreground">{valor}</p>
                    <p className="text-xs text-muted-foreground">{etiqueta}</p>
                </div>
            </div>
            <div className="mt-2 pt-2 border-t border-border">
                <span className={`text-xs font-medium ${TEXTO_NIVEL[nivel]}`}>
                    {porcentaje}% del total
                </span>
            </div>
        </TarjetaSistema>
    )
}
